"use client";

// INSIDE №4 — Token Composer (the "To:" field).
//
// The selection IS the interface: picked nodes render as colored tokens
// inside a single input-shaped field; typing filters a compact grouped
// suggestion panel across the entire universe (breadcrumb paths keep
// same-named scopes from different orgs unambiguous). Enter takes the
// highlighted suggestion, Backspace pops the last token, and "Create …" rows
// appear for every scope type the query could become — plus project and
// task. The natural fit for the FILTER use case (a filter bar is a sentence,
// not a tree), and a strong assignment field for forms.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildIndex,
  createDraft,
  itemNodeOf,
  nodeKey,
  scopeNodeOf,
  searchNodes,
  useTypeItems,
  useUniverse,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
} from "./engine";
import { EmptyPane, ErrorPane, KindGlyph, PickerFooter, SkeletonRows } from "./parts";
import { KIND_LABEL } from "./engine";

interface CreateRow {
  key: string;
  label: string;
  hint: string;
  run: (name: string) => { id: string } | void;
  /** Build the PickNode for auto-select after create (scopes only). */
  select?: (id: string, name: string) => PickNode;
}

/** Item strip under the field — "deepen" a selected scope token down to its
 *  context items (closes the reach-items gap without leaving the composer). */
function ScopeItemStrip({
  scope,
  engine,
  onClose,
}: {
  scope: PickNode;
  engine: SelectionEngine;
  onClose: () => void;
}) {
  const itemsQ = useTypeItems(scope.typeId ?? null);
  return (
    <div className="shrink-0 border-b border-border bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {scope.label} · context items
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close items"
          className="ml-auto flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
      {itemsQ.status === "loading" && (
        <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
      )}
      {itemsQ.status === "error" && (
        <ErrorPane message={itemsQ.error} onRetry={itemsQ.retry} />
      )}
      {itemsQ.status === "ready" && itemsQ.items.length === 0 && (
        <span className="text-[11px] text-muted-foreground">
          No items on this type yet.
        </span>
      )}
      {itemsQ.status === "ready" && (
        <div className="flex flex-wrap gap-1">
          {itemsQ.items.map((it) => {
            const n = itemNodeOf(scope, { id: it.id, label: it.label });
            const on = engine.isOn("item", n.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => engine.toggle(n)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px]",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TokenComposer({
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [deepenedKey, setDeepenedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const deepened =
    engine.nodes.find((n) => n.kind === "scope" && nodeKey(n) === deepenedKey) ??
    null;

  const index = useMemo(() => buildIndex(u), [u]);
  const matches = useMemo(
    () =>
      q
        ? searchNodes(index, q, 9).filter(
            (n) => !engine.isOn(n.kind, n.id),
          )
        : [],
    [index, q, engine],
  );

  // Create rows: the query can become a new scope under ANY type (first 3
  // types across orgs shown), or a new project / task.
  const createRows: CreateRow[] = useMemo(() => {
    if (!q) return [];
    const rows: CreateRow[] = [];
    const exact = matches.some((m) => m.label.toLowerCase() === q.toLowerCase());
    if (exact) return rows;
    let typeCount = 0;
    for (const o of u.orgs) {
      for (const t of o.scope_types) {
        if (typeCount >= 3) break;
        typeCount += 1;
        rows.push({
          key: `create:scope:${t.id}`,
          label: `New ${t.label_singular.toLowerCase()} "${q}"`,
          hint: `${o.name} › ${t.label_plural}`,
          run: (name) =>
            createDraft({
              kind: "scope",
              orgId: o.id,
              typeId: t.id,
              typeName: t.label_singular,
              name,
            }),
          select: (id, name) => scopeNodeOf(o, t, { id, name }),
        });
      }
      if (typeCount >= 3) break;
    }
    rows.push({
      key: "create:project",
      label: `New project "${q}"`,
      hint: "Projects",
      run: (name) => createDraft({ kind: "project", orgId: null, name }),
    });
    rows.push({
      key: "create:task",
      label: `New task "${q}"`,
      hint: "Tasks",
      run: (name) => createDraft({ kind: "task", name }),
    });
    return rows;
  }, [q, matches, u.orgs]);

  const totalRows = matches.length + createRows.length;
  useEffect(() => setActive(0), [q]);

  const take = (i: number) => {
    if (i < matches.length) {
      engine.toggle(matches[i]);
      setQuery("");
      inputRef.current?.focus();
      return;
    }
    const c = createRows[i - matches.length];
    if (!c) return;
    const created = c.run(q);
    if (created && c.select) engine.toggle(c.select(created.id, q));
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, totalRows - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && q && totalRows > 0) {
      e.preventDefault();
      take(active);
    } else if (e.key === "Backspace" && query === "" && engine.count > 0) {
      e.preventDefault();
      const last = engine.nodes.at(-1);
      if (last) engine.toggle(last);
    } else if (e.key === "Escape" && q) {
      e.stopPropagation();
      setQuery("");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* the token field */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[44px] shrink-0 cursor-text flex-wrap items-center gap-1 border-b border-border px-2 py-1.5"
      >
        {engine.nodes.map((n) => (
          <span
            key={nodeKey(n)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border bg-background pl-1.5 pr-0.5 text-xs",
              n.color?.border ?? "border-border",
              n.color?.fg ?? "text-foreground",
            )}
          >
            <KindGlyph node={n} />
            <span className="max-w-[140px] truncate">{n.label}</span>
            {n.kind === "scope" && (
              <button
                type="button"
                aria-label={`Show ${n.label} context items`}
                title="Context items"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeepenedKey((k) =>
                    k === nodeKey(n) ? null : nodeKey(n),
                  );
                }}
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded hover:bg-muted",
                  deepenedKey === nodeKey(n) && "bg-muted",
                )}
              >
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${n.label}`}
              onClick={(e) => {
                e.stopPropagation();
                engine.toggle(n);
              }}
              className="flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={
            engine.count === 0
              ? "Type to add context — scopes, orgs, projects, tasks…"
              : "Add more…"
          }
          aria-label="Add context"
          className="h-6 min-w-[120px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>

      {deepened && (
        <ScopeItemStrip
          scope={deepened}
          engine={engine}
          onClose={() => setDeepenedKey(null)}
        />
      )}

      {/* suggestions */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
        {u.treeStatus === "loading" && <SkeletonRows count={4} />}
        {u.treeStatus === "error" && (
          <ErrorPane message={u.treeError} onRetry={u.retryTree} />
        )}
        {u.treeStatus === "empty" && (
          <EmptyPane text="No organizations yet — nothing to compose from." />
        )}
        {u.treeStatus === "ready" && !q && (
          <div className="px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {open ? (
              <>
                Start typing to search{" "}
                <span className="text-foreground">
                  {index.length.toLocaleString()}
                </span>{" "}
                nodes across every org. Enter takes the highlighted match,
                Backspace removes the last token.
              </>
            ) : (
              "Click the field and type — the selection reads like a sentence."
            )}
          </div>
        )}
        {u.treeStatus === "ready" && q && (
          <div className="p-1">
            {matches.map((n, i) => (
              <button
                key={nodeKey(n)}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  take(i);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <KindGlyph node={n} />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {n.label}
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {[KIND_LABEL[n.kind], ...n.path].join(" · ")}
                  </span>
                </span>
                {i === active && (
                  <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
            {createRows.map((c, j) => {
              const i = matches.length + j;
              return (
                <button
                  key={c.key}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    take(i);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    i === active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-primary">
                    {c.label}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {c.hint}
                    </span>
                  </span>
                </button>
              );
            })}
            {totalRows === 0 && (
              <EmptyPane text={`No matches for "${q}".`} />
            )}
          </div>
        )}
      </div>

      <PickerFooter engine={engine} mode={mode} dense />
    </div>
  );
}
