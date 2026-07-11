"use client";

// INSIDE 1 — "Quick Pick" (the VS Code one).
//
// One search box, one flat keyboard-driven list of EVERY selectable node
// across every org: org / scope type / scope / context item / project / task.
// 24px rows, breadcrumb prefixes instead of indentation, so a 3-org tree that
// used to fill a page fits in ~300px.
//
//   ↑/↓  move        Space/Enter  toggle (Enter also closes in single mode)
//   →    drill into a scope's context items   ←  collapse them
//   type to filter across all levels at once ("all green", "brand", "seo")
//   no match → create rows appear (scope in every matching type, task, project)
//
// Projects and tasks are ALWAYS the bottom two bands, per the domain rule.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRight, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import type { ContextItemRow } from "@/features/scopes/types";
import {
  flattenTree,
  isSelected,
  itemRef,
  projectNode,
  selectionCount,
  summarizeSelection,
  taskNode,
  toggleNode,
  type DenseNodeKind,
  type DenseSelection,
  type FlatNode,
  type SelectMode,
} from "./model";
import { CheckGlyph, InlineSpinner, fakeCreate, type DenseData } from "./shared";

interface Row {
  node: FlatNode;
  /** Item rows carry their owning scope id (selection is per cell). */
  itemScopeId?: string;
  item?: ContextItemRow;
  isCreate?: boolean;
  createLevel?: "scope" | "project" | "task";
  createTypeId?: string;
  createOrgId?: string;
}

export function QuickPick({
  data,
  selection,
  onChange,
  mode = "multi",
  onCommit,
  height = 320,
  autoFocus = true,
}: {
  data: DenseData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  /** Single mode: Enter on a row selects AND commits (host closes). */
  onCommit?: (sel: DenseSelection) => void;
  height?: number;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const tree = flattenTree(data.organizations);
    for (const node of tree) {
      const match = !q || node.search.includes(q);
      // A scope also matches if any of its type's loaded items match.
      const typeItems =
        node.kind === "scope" && node.type
          ? (data.itemsByType[node.type.id] ?? [])
          : [];
      const itemMatches = q
        ? typeItems.filter((i) =>
            `${i.display_name} ${i.key}`.toLowerCase().includes(q),
          )
        : typeItems;
      if (!match && !(node.kind === "scope" && q && itemMatches.length > 0))
        continue;
      out.push({ node });
      if (
        node.kind === "scope" &&
        node.scope &&
        (expandedScopes.has(node.scope.id) ||
          (q.length > 0 && !match && itemMatches.length > 0))
      ) {
        for (const item of itemMatches) {
          out.push({ node, itemScopeId: node.scope.id, item });
        }
      }
    }
    // Bottom bands: projects, then tasks (always last).
    const orgName = (id: string | null) =>
      data.organizations.find((o) => o.id === id)?.name ?? null;
    for (const p of data.projects) {
      const n = projectNode(p, orgName(p.orgId));
      if (!q || n.search.includes(q)) out.push({ node: n });
    }
    for (const t of data.tasks) {
      const n = taskNode(t);
      if (!q || n.search.includes(q)) out.push({ node: n });
    }
    // Create rows when the query matches nothing at a level.
    if (q.length > 1) {
      const hasScopeHit = out.some((r) => r.node.kind === "scope" && !r.item);
      if (!hasScopeHit) {
        for (const org of data.organizations) {
          for (const type of org.scope_types) {
            out.push({
              node: {
                kind: "scope",
                id: `create:${type.id}`,
                label: query.trim(),
                path: [org.name, type.label_plural],
                depth: 2,
                org,
                type,
                search: "",
              },
              isCreate: true,
              createLevel: "scope",
              createTypeId: type.id,
              createOrgId: org.id,
            });
          }
        }
      }
      if (!out.some((r) => r.node.kind === "task")) {
        out.push({
          node: {
            kind: "task",
            id: "create:task",
            label: query.trim(),
            path: [],
            depth: 1,
            search: "",
          },
          isCreate: true,
          createLevel: "task",
        });
      }
    }
    return out;
  }, [data, q, query, expandedScopes]);

  // Clamp during render (never an effect): a shrinking result list must not
  // leave the active index out of range.
  const activeIdx = Math.min(active, Math.max(0, rows.length - 1));

  const rowId = (r: Row) =>
    r.item && r.itemScopeId ? itemRef(r.itemScopeId, r.item.id) : r.node.id;
  const rowKind = (r: Row): DenseNodeKind => (r.item ? "item" : r.node.kind);

  const toggleRow = useCallback(
    (r: Row, commit: boolean) => {
      if (r.isCreate) {
        if (r.createLevel === "scope") {
          fakeCreate("scope", r.node.label, {
            org_id: r.createOrgId ?? null,
            scope_type_id: r.createTypeId ?? null,
          });
        } else if (r.createLevel === "task") {
          fakeCreate("task", r.node.label, {});
        }
        setQuery("");
        return;
      }
      const next = toggleNode(selection, rowKind(r), rowId(r), mode);
      onChange(next);
      if (commit && mode === "single") onCommit?.(next);
    },
    [selection, mode, onChange, onCommit],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = rows[activeIdx];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "ArrowRight" && r?.node.kind === "scope" && !r.item) {
      e.preventDefault();
      const scope = r.node.scope;
      const type = r.node.type;
      if (scope && type) {
        data.loadItems(type.id);
        setExpandedScopes((p) => new Set(p).add(scope.id));
      }
    } else if (e.key === "ArrowLeft" && r?.node.scope) {
      e.preventDefault();
      const sid = r.node.scope.id;
      setExpandedScopes((p) => {
        const n = new Set(p);
        n.delete(sid);
        return n;
      });
    } else if (e.key === " " && r) {
      e.preventDefault();
      toggleRow(r, false);
    } else if (e.key === "Enter" && r) {
      e.preventDefault();
      toggleRow(r, true);
    }
  };

  // Keep the active row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const loading =
    data.treeStatus === "loading" && data.organizations.length === 0;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card text-sm">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type to filter orgs, scopes, fields, projects, tasks…"
          className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          style={{ fontSize: "16px" }}
          aria-label="Filter context nodes"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1 font-mono text-[9px] text-muted-foreground sm:block">
          space toggles
        </kbd>
      </div>

      <div
        ref={listRef}
        className="scrollbar-thin overflow-y-auto"
        style={{ height }}
        role="listbox"
        aria-multiselectable={mode === "multi"}
      >
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : data.treeError ? (
          <div className="p-3 text-xs text-destructive">
            Couldn&apos;t load your scope tree: {data.treeError}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            {q
              ? `Nothing matches "${query}".`
              : "No organizations, projects or tasks on your account yet."}
          </div>
        ) : (
          rows.map((r, i) => {
            const kind = rowKind(r);
            const id = rowId(r);
            const on = !r.isCreate && isSelected(selection, kind, id);
            const c = r.node.type ? resolveColor(r.node.type) : undefined;
            const TypeIcon = r.node.type
              ? resolveIcon(r.node.type.icon)
              : null;
            const isActive = i === activeIdx;
            const scopeExpandable = kind === "scope" && !r.item;
            const expanded =
              scopeExpandable &&
              !!r.node.scope &&
              expandedScopes.has(r.node.scope.id);
            const itemsLoading =
              expanded &&
              !!r.node.type &&
              data.itemsLoading.has(r.node.type.id);
            return (
              <div
                key={`${id}:${i}`}
                data-row-index={i}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggleRow(r, true)}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1.5 px-2",
                  isActive ? "bg-accent" : "hover:bg-muted/60",
                  r.item && "pl-6",
                )}
              >
                <CheckGlyph on={on} />
                {r.isCreate ? (
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
                    <span className="shrink-0 text-primary">Create</span>
                    <span className="truncate font-medium">
                      &quot;{r.node.label}&quot;
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {r.createLevel === "scope" && r.node.type && r.node.org
                        ? `${r.node.type.label_singular} · ${r.node.org.name}`
                        : "task"}
                    </span>
                  </span>
                ) : r.item ? (
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
                    <span className="truncate">{r.item.display_name}</span>
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                      {String(r.item.value_type)}
                    </span>
                  </span>
                ) : (
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
                    {r.node.path.length > 0 && (
                      <span className="hidden shrink-0 truncate text-[10px] text-muted-foreground/60 sm:inline">
                        {r.node.path.join(" › ")} ›
                      </span>
                    )}
                    <span
                      className={cn(
                        "truncate",
                        kind === "org" && "font-semibold",
                        kind === "type" && cn("font-medium", c?.fg),
                      )}
                    >
                      {r.node.label}
                    </span>
                    {kind === "type" && TypeIcon && (
                      <TypeIcon className={cn("h-3 w-3 shrink-0", c?.fg)} />
                    )}
                    {kind === "scope" && r.node.type && (
                      <span className={cn("shrink-0 text-[10px]", c?.fg)}>
                        {r.node.type.label_singular}
                      </span>
                    )}
                    {kind === "task" && r.node.task?.status && (
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                        {r.node.task.status}
                      </span>
                    )}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {itemsLoading && <InlineSpinner />}
                  {scopeExpandable && !r.isCreate && (
                    <button
                      type="button"
                      aria-label={expanded ? "Hide fields" : "Show fields"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const scope = r.node.scope;
                        const type = r.node.type;
                        if (!scope || !type) return;
                        data.loadItems(type.id);
                        setExpandedScopes((p) => {
                          const n = new Set(p);
                          if (n.has(scope.id)) n.delete(scope.id);
                          else n.add(scope.id);
                          return n;
                        });
                      }}
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                    </button>
                  )}
                  <span className="w-[38px] text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
                    {r.isCreate ? "new" : kind === "item" ? "field" : kind}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {summarizeSelection(selection)}
        </span>
        {mode === "single" ? (
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" /> picks one
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {selectionCount(selection)} selected
          </span>
        )}
      </div>
    </div>
  );
}
