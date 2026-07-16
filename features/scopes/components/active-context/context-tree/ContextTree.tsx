"use client";

// ContextTree — THE dense Surface-A picker (promoted from context-lab/dense).
//
// Browsing is a real tree: indentation + chevrons, org → type → scope →
// field, with Projects and Tasks as the two bottom sections. Selected
// projects/tasks are promoted to a top-level strip just above those
// sections so the active pick is always visible. Hierarchy is carried by
// STRUCTURE, never by path prefixes. Search is the one place the tree flattens.
//
// Interaction model (Drill Deck convention):
//   • click a row        = expand / collapse — never selects
//   • click the checkbox = select — never navigates
//   • leaf rows (fields, projects, tasks) toggle on row click too
//   • ↑/↓ move · → expand · ← collapse · space select · enter select(+close)
//
// Cascade-up: selecting a child always selects its ancestors (scope → type →
// org). Laziness: fields / projects / tasks fetch on first expand only.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, ChevronRight, FolderKanban, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  buildAncestryMap,
  isEmptySelection,
  isSelected,
  itemRef,
  selectionCount,
  summarizeSelection,
  toggleNodeCascaded,
  type DenseNodeKind,
  type DenseSelection,
  type SelectMode,
} from "./model";
import {
  CheckGlyph,
  InlineAddRow,
  InlineSpinner,
  type ContextTreeData,
} from "./shared";

export type ContextTreeCreateLevel =
  "scope type" | "scope" | "context item" | "project" | "task";

export type ContextTreeCreateHandler = (
  level: ContextTreeCreateLevel,
  name: string,
  detail: Record<string, string | null>,
) => void;

/* ── row model ────────────────────────────────────────────────────────── */

interface TreeRow {
  key: string;
  depth: number;
  /** Selectable node (undefined for pure section headers / add rows). */
  kind?: DenseNodeKind;
  id?: string;
  label: string;
  tone?: string;
  icon?: React.ReactNode;
  meta?: string;
  expandKey?: string;
  expandable?: boolean;
  loading?: boolean;
  /** Search-mode context tag, right-aligned ("Client · Titanium"). */
  tag?: string;
  isCreate?: boolean;
  onCreate?: () => void;
  add?: { placeholder: string; commit: (v: string) => void };
}

const ROW_H = 22;
const INDENT = 12;

export function ContextTree({
  data,
  selection,
  onChange,
  mode = "multi",
  onCommit,
  onClear,
  height = 280,
  showSearch = true,
  allowCreate = false,
  onCreate,
  header,
  autoFocus = false,
  className,
}: {
  data: ContextTreeData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  /** Single mode: selecting commits (host closes). */
  onCommit?: (sel: DenseSelection) => void;
  /** Optional clear affordance in the footer. */
  onClear?: () => void;
  height?: number;
  showSearch?: boolean;
  /** Show inline "+ New …" rows and search-create offers. Off in production. */
  allowCreate?: boolean;
  onCreate?: ContextTreeCreateHandler;
  /** Sidebar-style header: title + expand/collapse-all + live count. */
  header?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ancestry = useMemo(
    () => buildAncestryMap(data.organizations, data.projects, data.tasks),
    [data.organizations, data.projects, data.tasks],
  );

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(data.organizations.map((o) => `org:${o.id}`)),
  );
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const seededOrgs = useRef(false);

  // Orgs start expanded (they're the cheap level); seed once tree arrives.
  useEffect(() => {
    if (seededOrgs.current || data.organizations.length === 0) return;
    seededOrgs.current = true;
    setExpanded((p) => {
      const n = new Set(p);
      data.organizations.forEach((o) => n.add(`org:${o.id}`));
      return n;
    });
  }, [data.organizations]);

  // Selected projects/tasks need labels for the promoted strip — kick the
  // lazy load if the host already has picks but the lists haven't been opened.
  const { loadProjects, loadTasks } = data;
  useEffect(() => {
    if (selection.projectIds.length > 0) loadProjects();
    if (selection.taskIds.length > 0) loadTasks();
  }, [selection.projectIds, selection.taskIds, loadProjects, loadTasks]);

  const q = query.trim().toLowerCase();

  const flip = (key: string, open?: boolean) =>
    setExpanded((p) => {
      const n = new Set(p);
      const want = open ?? !n.has(key);
      if (want) n.add(key);
      else n.delete(key);
      return n;
    });

  const expandAll = () =>
    setExpanded(() => {
      const n = new Set<string>();
      for (const o of data.organizations) {
        n.add(`org:${o.id}`);
        for (const t of o.scope_types) n.add(`type:${t.id}`);
      }
      // scope-field + projects/tasks levels stay manual: expanding them
      // costs a fetch each, and expand-all must never fire N requests.
      return n;
    });
  const collapseAll = () => setExpanded(new Set());

  /* ── visible rows ──────────────────────────────────────────────────── */

  const rows = useMemo<TreeRow[]>(() => {
    const out: TreeRow[] = [];

    if (q) {
      // SEARCH — flat results with a slim context tag.
      for (const o of data.organizations) {
        if (o.name.toLowerCase().includes(q))
          out.push({
            key: `org:${o.id}`,
            depth: 0,
            kind: "org",
            id: o.id,
            label: o.name,
            tone: "font-medium",
            tag: "org",
          });
        for (const t of o.scope_types) {
          const c = resolveColor(t);
          if (t.label_plural.toLowerCase().includes(q))
            out.push({
              key: `type:${t.id}`,
              depth: 0,
              kind: "type",
              id: t.id,
              label: `All ${t.label_plural}`,
              tone: cn("font-medium", c.fg),
              tag: o.name,
            });
          for (const s of t.scopes) {
            if (s.name.toLowerCase().includes(q))
              out.push({
                key: `scope:${s.id}`,
                depth: 0,
                kind: "scope",
                id: s.id,
                label: s.name,
                tag: `${t.label_singular} · ${o.name}`,
              });
            for (const it of data.itemsByType[t.id] ?? []) {
              if (`${it.display_name} ${it.key}`.toLowerCase().includes(q))
                out.push({
                  key: `item:${s.id}:${it.id}`,
                  depth: 0,
                  kind: "item",
                  id: itemRef(s.id, it.id),
                  label: `${s.name} › ${it.display_name}`,
                  tag: t.label_singular,
                });
            }
          }
        }
      }
      for (const p of data.projects)
        if (p.name.toLowerCase().includes(q))
          out.push({
            key: `project:${p.id}`,
            depth: 0,
            kind: "project",
            id: p.id,
            label: p.name,
            tag: "project",
          });
      for (const t of data.tasks)
        if (t.title.toLowerCase().includes(q))
          out.push({
            key: `task:${t.id}`,
            depth: 0,
            kind: "task",
            id: t.id,
            label: t.title,
            tag: "task",
          });
      // No scope hit → offer creates (capped at 4 types).
      if (
        allowCreate &&
        onCreate &&
        q.length > 2 &&
        !out.some((r) => r.kind === "scope")
      ) {
        let n = 0;
        for (const o of data.organizations) {
          for (const t of o.scope_types) {
            if (n >= 4) break;
            n += 1;
            out.push({
              key: `create:${t.id}`,
              depth: 0,
              label: query.trim(),
              tag: `new ${t.label_singular} · ${o.name}`,
              isCreate: true,
              onCreate: () => {
                onCreate("scope", query.trim(), {
                  org_id: o.id,
                  scope_type_id: t.id,
                });
                setQuery("");
              },
            });
          }
        }
      }
      return out;
    }

    // BROWSE — the tree.
    for (const o of data.organizations) {
      const oKey = `org:${o.id}`;
      const oOpen = expanded.has(oKey);
      out.push({
        key: oKey,
        depth: 0,
        kind: "org",
        id: o.id,
        label: o.name,
        tone: "font-semibold",
        meta: String(o.scope_types.length),
        expandKey: oKey,
        expandable: o.scope_types.length > 0,
      });
      if (!oOpen) continue;
      for (const t of o.scope_types) {
        const tKey = `type:${t.id}`;
        const tOpen = expanded.has(tKey);
        const c = resolveColor(t);
        out.push({
          key: tKey,
          depth: 1,
          kind: "type",
          id: t.id,
          label: t.label_plural,
          tone: cn("font-medium", c.fg),
          icon: React.createElement(resolveIcon(t.icon), {
            className: cn("h-3 w-3 shrink-0", c.fg),
          }),
          meta: String(t.scopes.length),
          expandKey: tKey,
          expandable: true,
        });
        if (!tOpen) continue;
        for (const s of t.scopes) {
          const sKey = `scope:${s.id}`;
          const sOpen = expanded.has(sKey);
          out.push({
            key: sKey,
            depth: 2,
            kind: "scope",
            id: s.id,
            label: s.name,
            expandKey: sKey,
            expandable: true,
            loading: sOpen && data.itemsLoading.has(t.id),
          });
          if (!sOpen) continue;
          const items = data.itemsByType[t.id];
          if (items && items.length === 0) {
            out.push({
              key: `${sKey}:none`,
              depth: 3,
              label: "no fields on this type",
              tone: "text-muted-foreground/50 italic",
            });
          }
          for (const it of items ?? []) {
            out.push({
              key: `item:${s.id}:${it.id}`,
              depth: 3,
              kind: "item",
              id: itemRef(s.id, it.id),
              label: it.display_name,
              meta: String(it.value_type),
            });
          }
          if (allowCreate && onCreate && items) {
            out.push({
              key: `${sKey}:add`,
              depth: 3,
              label: "",
              add: {
                placeholder: "New field",
                commit: (v) =>
                  onCreate("context item", v, { scope_type_id: t.id }),
              },
            });
          }
        }
        if (allowCreate && onCreate) {
          out.push({
            key: `${tKey}:add`,
            depth: 2,
            label: "",
            add: {
              placeholder: `New ${t.label_singular.toLowerCase()}`,
              commit: (v) =>
                onCreate("scope", v, { org_id: o.id, scope_type_id: t.id }),
            },
          });
        }
      }
      if (allowCreate && onCreate) {
        out.push({
          key: `${oKey}:add`,
          depth: 1,
          label: "",
          add: {
            placeholder: "New scope type",
            commit: (v) => onCreate("scope type", v, { org_id: o.id }),
          },
        });
      }
    }

    // Promoted strip — selected projects/tasks ALSO appear at the top level
    // just above the Projects/Tasks menus (second reference — the originals
    // stay in their lists so clicking never makes a row vanish mid-browse).
    for (const pid of selection.projectIds) {
      const p = data.projects.find((x) => x.id === pid);
      out.push({
        key: `pinned:project:${pid}`,
        depth: 0,
        kind: "project",
        id: pid,
        label: p?.name ?? "Selected project",
        tone: "font-medium text-amber-700 dark:text-amber-300",
        icon: (
          <FolderKanban className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        ),
        tag: "project",
        meta: p
          ? (data.organizations.find((o) => o.id === p.orgId)?.slug ?? "")
          : undefined,
      });
    }
    for (const tid of selection.taskIds) {
      const t = data.tasks.find((x) => x.id === tid);
      out.push({
        key: `pinned:task:${tid}`,
        depth: 0,
        kind: "task",
        id: tid,
        label: t?.title ?? "Selected task",
        tone: "font-medium text-sky-700 dark:text-sky-300",
        icon: (
          <Briefcase className="h-3 w-3 shrink-0 text-sky-600 dark:text-sky-400" />
        ),
        tag: "task",
        meta: t?.status ?? undefined,
      });
    }

    // Projects & Tasks — always the two bottom sections; lazy.
    const pOpen = expanded.has("sec:projects");
    out.push({
      key: "sec:projects",
      depth: 0,
      label: "Projects",
      tone: "font-semibold",
      meta:
        data.projectsStatus === "ready"
          ? String(data.projects.length)
          : undefined,
      expandKey: "sec:projects",
      expandable: true,
      loading: pOpen && data.projectsStatus === "loading",
    });
    if (pOpen) {
      if (data.projectsStatus === "error")
        out.push({
          key: "sec:projects:err",
          depth: 1,
          label: "couldn't load — click to retry",
          tone: "text-destructive",
          isCreate: true,
          onCreate: () => data.loadProjects(),
        });
      for (const p of data.projects)
        out.push({
          key: `project:${p.id}`,
          depth: 1,
          kind: "project",
          id: p.id,
          label: p.name,
          meta: data.organizations.find((o) => o.id === p.orgId)?.slug ?? "",
        });
      if (allowCreate && onCreate && data.projectsStatus === "ready")
        out.push({
          key: "sec:projects:add",
          depth: 1,
          label: "",
          add: {
            placeholder: "New project",
            commit: (v) => onCreate("project", v, {}),
          },
        });
    }
    const kOpen = expanded.has("sec:tasks");
    out.push({
      key: "sec:tasks",
      depth: 0,
      label: "Tasks",
      tone: "font-semibold",
      meta:
        data.tasksStatus === "ready" ? String(data.tasks.length) : undefined,
      expandKey: "sec:tasks",
      expandable: true,
      loading: kOpen && data.tasksStatus === "loading",
    });
    if (kOpen) {
      if (data.tasksStatus === "error")
        out.push({
          key: "sec:tasks:err",
          depth: 1,
          label: "couldn't load — click to retry",
          tone: "text-destructive",
          isCreate: true,
          onCreate: () => data.loadTasks(),
        });
      for (const t of data.tasks)
        out.push({
          key: `task:${t.id}`,
          depth: 1,
          kind: "task",
          id: t.id,
          label: t.title,
          meta: t.status ?? "",
        });
      if (allowCreate && onCreate && data.tasksStatus === "ready")
        out.push({
          key: "sec:tasks:add",
          depth: 1,
          label: "",
          add: {
            placeholder: "New task",
            commit: (v) => onCreate("task", v, {}),
          },
        });
    }
    return out;
  }, [allowCreate, data, expanded, onCreate, q, query, selection]);

  const activeIdx = Math.min(active, Math.max(0, rows.length - 1));

  /* ── interaction ───────────────────────────────────────────────────── */

  const doExpand = (r: TreeRow, open?: boolean) => {
    if (!r.expandKey) return;
    const willOpen = open ?? !expanded.has(r.expandKey);
    if (willOpen) {
      if (r.expandKey === "sec:projects") data.loadProjects();
      if (r.expandKey === "sec:tasks") data.loadTasks();
      if (r.kind === "scope" && r.id) {
        const type = data.organizations
          .flatMap((o) => o.scope_types)
          .find((t) => t.scopes.some((s) => s.id === r.id));
        if (type) data.loadItems(type.id);
      }
    }
    flip(r.expandKey, willOpen);
  };

  const doSelect = (r: TreeRow, commit: boolean) => {
    if (!r.kind || !r.id) return;
    const next = toggleNodeCascaded(selection, r.kind, r.id, mode, ancestry);
    onChange(next);
    if (commit && mode === "single") onCommit?.(next);
  };

  /** Row click: drill if expandable, select if leaf. Checkbox always selects. */
  const onRowClick = (r: TreeRow) => {
    if (r.isCreate) return r.onCreate?.();
    if (r.expandable) doExpand(r);
    else doSelect(r, true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = rows[activeIdx];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "ArrowRight" && r?.expandable) {
      e.preventDefault();
      doExpand(r, true);
    } else if (e.key === "ArrowLeft" && r?.expandKey) {
      e.preventDefault();
      doExpand(r, false);
    } else if (e.key === " " && r) {
      e.preventDefault();
      if (r.isCreate) r.onCreate?.();
      else doSelect(r, false);
    } else if (e.key === "Enter" && r) {
      e.preventDefault();
      if (r.isCreate) r.onCreate?.();
      else doSelect(r, true);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;

  /* ── render ────────────────────────────────────────────────────────── */

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md border border-border bg-card text-sm",
        className,
      )}
    >
      {header !== undefined && (
        <div className="flex h-6 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-1.5">
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {header}
          </span>
          <button
            type="button"
            onClick={expandAll}
            className="rounded-sm px-1 font-mono text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expand all"
          >
            expand
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-sm px-1 font-mono text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Collapse all"
          >
            collapse
          </button>
          {selectionCount(selection) > 0 && (
            <span className="rounded-full bg-primary/10 px-1 font-mono text-[9px] text-primary">
              {selectionCount(selection)}
            </span>
          )}
        </div>
      )}

      {showSearch && (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              // Search must be able to hit projects/tasks — a search IS the
              // first interaction with them, so it triggers the lazy load.
              if (e.target.value.trim()) {
                data.loadProjects();
                data.loadTasks();
              }
            }}
            onKeyDown={onKeyDown}
            placeholder="Search…"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:text-xs"
            aria-label="Search context tree"
          />
        </div>
      )}

      <div
        ref={listRef}
        className="scrollbar-thin overflow-y-auto py-0.5"
        style={{ height }}
        role="tree"
      >
        {loading ? (
          <div className="space-y-1 p-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : data.treeError && data.organizations.length === 0 ? (
          <div className="p-2 text-xs text-destructive">
            Couldn&apos;t load your tree: {data.treeError}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">
            {q ? `Nothing matches "${query}".` : "Nothing here yet."}
          </div>
        ) : (
          rows.map((r, i) => {
            if (r.add) {
              return (
                <InlineAddRow
                  key={r.key}
                  placeholder={r.add.placeholder}
                  onCommit={r.add.commit}
                  indentPx={4 + r.depth * INDENT + 14}
                />
              );
            }
            const on =
              r.kind && r.id ? isSelected(selection, r.kind, r.id) : false;
            const open = r.expandKey ? expanded.has(r.expandKey) : false;
            const selectable = !!r.kind && !!r.id;
            return (
              <div
                key={r.key}
                data-row-index={i}
                role="treeitem"
                aria-expanded={r.expandable ? open : undefined}
                aria-selected={selectable ? on : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => onRowClick(r)}
                className={cn(
                  "flex cursor-pointer items-center gap-1 pr-1.5",
                  i === activeIdx ? "bg-accent" : "hover:bg-muted/60",
                )}
                style={{ height: ROW_H, paddingLeft: 4 + r.depth * INDENT }}
              >
                {r.expandable ? (
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform",
                      open && "rotate-90",
                    )}
                  />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                {r.icon}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    r.tone,
                    r.isCreate && "text-primary",
                  )}
                >
                  {r.isCreate && !r.key.includes("err") ? (
                    <>
                      Create{" "}
                      <span className="font-medium">&quot;{r.label}&quot;</span>
                    </>
                  ) : (
                    r.label
                  )}
                </span>
                {r.loading && <InlineSpinner />}
                {(r.tag ?? r.meta) && (
                  <span className="max-w-[40%] shrink-0 truncate font-mono text-[9px] text-muted-foreground/60">
                    {r.tag ?? r.meta}
                  </span>
                )}
                {selectable && (
                  <button
                    type="button"
                    aria-label={
                      on ? `Deselect ${r.label}` : `Select ${r.label}`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      doSelect(r, true);
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center"
                  >
                    <CheckGlyph on={on} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-1.5">
        {!isEmptySelection(selection) && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary px-1 font-mono text-[9px] text-primary-foreground hover:bg-primary/90"
          >
            <X className="h-2.5 w-2.5" />
            clear
          </button>
        )}
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {summarizeSelection(selection)}
        </span>
        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
          {mode === "single"
            ? "picks one"
            : `${selectionCount(selection)} selected`}
        </span>
      </div>
    </div>
  );
}
