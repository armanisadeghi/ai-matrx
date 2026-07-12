"use client";

// INSIDE №1 — Command Quick-Pick (the VS Code one).
//
// One search box, one keyboard-driven list. Type to search the whole universe
// flat (scopes rank first, breadcrumb paths shown dim); Projects and Tasks
// are drillable rails at the bottom of the root.
//
// INTERACTION LAW (Arman, 2026-07-11): clicking anywhere on a row goes
// FORWARD — it drills into the node. Only a direct click on the checkbox
// selects. Leaf rows (items, projects, tasks) have nothing to drill into,
// so a row click toggles them. Keyboard mirrors it: Enter = forward (toggle
// on a leaf), Cmd/Ctrl+Enter = toggle anywhere, →/Tab = drill, Backspace
// walks up. Create-at-any-level rides the current query ("Create …").
// Built for hosts with almost no space — one input tall until opened.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  ChevronRight,
  CornerUpLeft,
  FolderOpen,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildIndex,
  createDraft,
  itemNodeOf,
  orgNameLookup,
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  searchNodes,
  taskNodeOf,
  typeNodeOf,
  useTypeItems,
  useUniverse,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
} from "./engine";
import {
  CheckGlyph,
  EmptyPane,
  ErrorPane,
  KindGlyph,
  PickerFooter,
  SkeletonRows,
} from "./parts";

type Level =
  | { t: "org"; node: PickNode }
  | { t: "type"; node: PickNode }
  | { t: "scope"; node: PickNode }
  | { t: "projects" }
  | { t: "tasks" };

interface Row {
  key: string;
  node?: PickNode;
  drill?: Level;
  /** Create affordance — label + the create runner. */
  create?: { label: string; run: (name: string) => void };
  showPath?: boolean;
}

function levelLabel(l: Level): string {
  if (l.t === "projects") return "Projects";
  if (l.t === "tasks") return "Tasks";
  return l.node.label;
}

export function QuickPick({
  engine,
  mode,
  className,
}: {
  engine: SelectionEngine;
  mode: PickerMode;
  className?: string;
}) {
  const u = useUniverse();
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<Level[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const level = stack.at(-1) ?? null;
  const q = query.trim().toLowerCase();

  const index = useMemo(() => buildIndex(u), [u]);
  const orgName = useMemo(() => orgNameLookup(u), [u]);

  // Items are lazy — only fetched when drilled into a scope.
  const scopeLevel = level?.t === "scope" ? level.node : null;
  const itemsQ = useTypeItems(scopeLevel?.typeId ?? null);

  const rows: Row[] = useMemo(() => {
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const out: Row[] = [];

    if (!level) {
      if (q) {
        // Global flat search — the quick-pick money shot.
        for (const n of searchNodes(index, q, 40)) {
          const drill: Level | undefined =
            n.kind === "org"
              ? { t: "org", node: n }
              : n.kind === "type"
                ? { t: "type", node: n }
                : n.kind === "scope"
                  ? { t: "scope", node: n }
                  : undefined;
          out.push({ key: `${n.kind}:${n.id}`, node: n, drill, showPath: true });
        }
      } else {
        for (const o of u.orgs) {
          const n = orgNodeOf(o);
          out.push({ key: `org:${o.id}`, node: n, drill: { t: "org", node: n } });
        }
        out.push({ key: "rail:projects", drill: { t: "projects" } });
        out.push({ key: "rail:tasks", drill: { t: "tasks" } });
      }
      return out;
    }

    if (level.t === "org") {
      const org = u.orgs.find((o) => o.id === level.node.id);
      if (!org) return out;
      for (const t of org.scope_types) {
        if (!match(t.label_plural)) continue;
        const n = typeNodeOf(org, t);
        out.push({ key: `type:${t.id}`, node: n, drill: { t: "type", node: n } });
      }
      for (const p of u.projects.filter((p) => p.orgId === org.id)) {
        if (!match(p.name)) continue;
        out.push({ key: `project:${p.id}`, node: projectNodeOf(p, orgName) });
      }
      for (const t of u.tasks.filter((t) => t.orgId === org.id)) {
        if (!match(t.title)) continue;
        out.push({ key: `task:${t.id}`, node: taskNodeOf(t, orgName) });
      }
      out.push({
        key: "create:type",
        create: {
          label: q ? `Create scope type "${query.trim()}"` : "New scope type…",
          run: (name) => {
            const { id } = createDraft({
              kind: "type",
              orgId: org.id,
              orgName: org.name,
              name,
            });
            void id;
          },
        },
      });
      return out;
    }

    if (level.t === "type") {
      const org = u.orgs.find((o) => o.id === level.node.orgId);
      const type = org?.scope_types.find((t) => t.id === level.node.typeId);
      if (!org || !type) return out;
      for (const s of type.scopes) {
        if (!match(s.name)) continue;
        const n = scopeNodeOf(org, type, s);
        out.push({ key: `scope:${s.id}`, node: n, drill: { t: "scope", node: n } });
      }
      out.push({
        key: "create:scope",
        create: {
          label: q
            ? `Create ${type.label_singular.toLowerCase()} "${query.trim()}"`
            : `New ${type.label_singular.toLowerCase()}…`,
          run: (name) =>
            void createDraft({
              kind: "scope",
              orgId: org.id,
              typeId: type.id,
              typeName: type.label_singular,
              name,
            }),
        },
      });
      return out;
    }

    if (level.t === "scope") {
      for (const it of itemsQ.items) {
        if (!match(it.label)) continue;
        out.push({
          key: `item:${it.id}`,
          node: itemNodeOf(level.node, { id: it.id, label: it.label }),
        });
      }
      const typeId = level.node.typeId;
      if (typeId) {
        out.push({
          key: "create:item",
          create: {
            label: q
              ? `Create context item "${query.trim()}"`
              : "New context item…",
            run: (name) =>
              void createDraft({
                kind: "item",
                typeId,
                typeName: level.node.path[1] ?? "type",
                name,
              }),
          },
        });
      }
      return out;
    }

    if (level.t === "projects") {
      for (const p of u.projects) {
        if (!match(p.name)) continue;
        out.push({ key: `project:${p.id}`, node: projectNodeOf(p, orgName) });
      }
      out.push({
        key: "create:project",
        create: {
          label: q ? `Create project "${query.trim()}"` : "New project…",
          run: (name) =>
            void createDraft({ kind: "project", orgId: null, name }),
        },
      });
      return out;
    }

    for (const t of u.tasks) {
      if (!match(t.title)) continue;
      out.push({ key: `task:${t.id}`, node: taskNodeOf(t, orgName) });
    }
    out.push({
      key: "create:task",
      create: {
        label: q ? `Create task "${query.trim()}"` : "New task…",
        run: (name) => void createDraft({ kind: "task", name }),
      },
    });
    return out;
  }, [level, q, query, index, u, orgName, itemsQ.items]);

  useEffect(() => setActive(0), [q, stack.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-qp-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const drillInto = (l: Level) => {
    setStack((s) => [...s, l]);
    setQuery("");
    inputRef.current?.focus();
  };
  const popLevel = () => {
    setStack((s) => s.slice(0, -1));
    setQuery("");
    inputRef.current?.focus();
  };

  // FORWARD is the default: a row activation drills when the node is
  // drillable and only toggles when it's a leaf. `intent: "select"` is the
  // explicit selection path (checkbox click / Cmd+Ctrl+Enter).
  const activateRow = (row: Row, intent: "forward" | "select" = "forward") => {
    if (row.create) {
      const name = query.trim();
      if (name) {
        row.create.run(name);
        setQuery("");
      } else {
        // No text yet — put the caret in the box so the user types the name.
        inputRef.current?.focus();
      }
      return;
    }
    if (intent === "select") {
      if (row.node) engine.toggle(row.node);
      return;
    }
    if (row.drill) {
      drillInto(row.drill);
      return;
    }
    if (row.node) engine.toggle(row.node);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) activateRow(row, e.metaKey || e.ctrlKey ? "select" : "forward");
    } else if (e.key === "ArrowRight" || e.key === "Tab") {
      const row = rows[active];
      if (row?.drill) {
        e.preventDefault();
        drillInto(row.drill);
      }
    } else if (e.key === "Backspace" && query === "" && stack.length > 0) {
      e.preventDefault();
      popLevel();
    } else if (e.key === "Escape") {
      if (query !== "") {
        e.stopPropagation();
        setQuery("");
      } else if (stack.length > 0) {
        e.stopPropagation();
        popLevel();
      }
      // else: bubbles up so a popover host can close.
    }
  };

  const placeholder = !level
    ? "Search everything — orgs, scopes, projects, tasks…"
    : level.t === "scope"
      ? `Search ${level.node.label}'s context items…`
      : `Search in ${levelLabel(level)}…`;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* input + breadcrumbs */}
      <div className="shrink-0 border-b border-border">
        {stack.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto px-2 pt-1.5 scrollbar-hide">
            <button
              type="button"
              onClick={popLevel}
              aria-label="Back one level"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CornerUpLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setStack([])}
              className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              All
            </button>
            {stack.map((l, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <button
                  type="button"
                  onClick={() => setStack((s) => s.slice(0, i + 1))}
                  className={cn(
                    "shrink-0 rounded px-1 py-0.5 text-[10px] font-medium hover:bg-muted",
                    i === stack.length - 1
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {levelLabel(l)}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search context"
            className="h-9 w-full bg-transparent pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* list */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin"
        role="listbox"
        aria-label="Context results"
      >
        {u.treeStatus === "loading" && <SkeletonRows count={6} />}
        {u.treeStatus === "error" && (
          <ErrorPane message={u.treeError} onRetry={u.retryTree} />
        )}
        {u.treeStatus === "empty" && (
          <EmptyPane text="No organizations yet — your context universe is empty." />
        )}
        {u.treeStatus === "ready" && level?.t === "scope" && (
          <>
            {itemsQ.status === "loading" && <SkeletonRows count={4} />}
            {itemsQ.status === "error" && (
              <ErrorPane message={itemsQ.error} onRetry={itemsQ.retry} />
            )}
            {itemsQ.status === "ready" && rows.length === 1 && !q && (
              <EmptyPane text="No context items defined on this scope's type yet." />
            )}
          </>
        )}
        {u.treeStatus === "ready" &&
          !(level?.t === "scope" && itemsQ.status !== "ready") &&
          rows.map((row, i) => {
            const isActive = i === active;
            const on = row.node
              ? engine.isOn(row.node.kind, row.node.id)
              : false;
            return (
              <div
                key={row.key}
                data-qp-index={i}
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => activateRow(row)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  isActive && "bg-muted",
                )}
              >
                {row.create ? (
                  <>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-primary">
                      {row.create.label}
                    </span>
                    <kbd className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground">
                      enter
                    </kbd>
                  </>
                ) : row.node ? (
                  <>
                    {/* the ONE selection target — everything else on the row
                        goes forward */}
                    <button
                      type="button"
                      aria-label={`${on ? "Deselect" : "Select"} ${row.node.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        activateRow(row, "select");
                      }}
                      className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded p-1 hover:bg-background"
                    >
                      <CheckGlyph on={on} />
                    </button>
                    <KindGlyph node={row.node} />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {row.node.label}
                      {row.showPath && row.node.path.length > 0 && (
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {row.node.path.join(" › ")}
                        </span>
                      )}
                    </span>
                    {row.drill && (
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                          !isActive && "opacity-40",
                        )}
                      />
                    )}
                  </>
                ) : (
                  // Root rails: Projects / Tasks (drill-only)
                  <>
                    {row.key === "rail:projects" ? (
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {row.key === "rail:projects" ? "Projects" : "Tasks"}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {u.engagementStatus === "loading"
                        ? "…"
                        : row.key === "rail:projects"
                          ? u.projects.length
                          : u.tasks.length}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </>
                )}
              </div>
            );
          })}
        {u.treeStatus === "ready" &&
          rows.length === 0 &&
          !(level?.t === "scope" && itemsQ.status !== "ready") && (
            <EmptyPane text={q ? `No matches for "${query.trim()}".` : "Nothing here yet."} />
          )}
        {u.engagementStatus === "error" && !level && (
          <div className="px-2 pb-1">
            <ErrorPane
              message={u.engagementError}
              onRetry={u.retryEngagement}
            />
          </div>
        )}
      </div>

      <PickerFooter engine={engine} mode={mode} dense />
    </div>
  );
}
