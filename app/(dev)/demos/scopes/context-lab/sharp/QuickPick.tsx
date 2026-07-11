"use client";

// INSIDE 1 — Quick Pick. The VS Code quick-pick, rebuilt for context.
//
// One search box, one flat keyboard-driven list. Every level is reachable:
// orgs and scopes are rows; a scope's context items are one drill (→ / click)
// away; projects and tasks sit at the bottom, exactly as the shape demands.
// No match? The same box creates a scope / project / task inline (previewed).
// Works from 260px wide up — it never needs more space than a palette.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  SquareCheckBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import type {
  OrgNode,
  ScopeTypeNode,
  ContextItemRow,
} from "@/features/scopes/types";
import type { AssignableProject, AssignableTask } from "@/features/scopes/components/context-assignment/data";
import {
  previewWrite,
  useTypeItems,
  type FlatScope,
  type PickerData,
  type SelectionApi,
} from "./engine";

type QPRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "org"; key: string; org: OrgNode }
  | { kind: "scope"; key: string; fs: FlatScope }
  | { kind: "project"; key: string; p: AssignableProject }
  | { kind: "task"; key: string; t: AssignableTask }
  | { kind: "item"; key: string; item: ContextItemRow; fs: FlatScope }
  | {
      kind: "create";
      key: string;
      label: string;
      run: () => void;
    };

interface QuickPickProps {
  data: PickerData;
  sel: SelectionApi;
  /** Single-select: picking a row calls onSinglePick and does not toggle. */
  single?: boolean;
  onSinglePick?: (label: string, row: QPRow) => void;
  height?: number;
  autoFocus?: boolean;
  placeholder?: string;
  /** Hide the create-on-no-match rows (e.g. filter mode). */
  allowCreate?: boolean;
  footer?: React.ReactNode;
}

const norm = (s: string) => s.toLowerCase();

export function QuickPick({
  data,
  sel,
  single = false,
  onSinglePick,
  height = 280,
  autoFocus = false,
  placeholder = "Search orgs, scopes, projects, tasks…",
  allowCreate = true,
  footer,
}: QuickPickProps) {
  const [query, setQuery] = useState("");
  const [drill, setDrill] = useState<FlatScope | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemState = useTypeItems(drill ? drill.type.id : null);

  const q = norm(query.trim());

  const rows = useMemo<QPRow[]>(() => {
    if (drill) {
      const out: QPRow[] = [];
      const items = (itemState.items ?? []).filter(
        (i) => !q || norm(i.display_name).includes(q) || norm(i.key).includes(q),
      );
      for (const item of items)
        out.push({ kind: "item", key: `item:${item.id}`, item, fs: drill });
      if (allowCreate && q && items.length === 0)
        out.push({
          kind: "create",
          key: "create:item",
          label: `Define item "${query.trim()}" on ${drill.type.label_plural}`,
          run: () =>
            previewWrite(
              "create context item",
              { scope_type_id: drill.type.id, display_name: query.trim() },
              `Defined "${query.trim()}" on ${drill.type.label_plural}`,
            ),
        });
      return out;
    }

    const out: QPRow[] = [];
    const matches = (name: string) => !q || norm(name).includes(q);

    for (const org of data.orgs) {
      const orgHit = matches(org.name);
      const scopeHits = data.flatScopes.filter(
        (fs) => fs.org.id === org.id && matches(fs.scope.name),
      );
      if (!orgHit && scopeHits.length === 0) continue;
      out.push({ kind: "header", key: `h:${org.id}`, label: org.name });
      if (orgHit) out.push({ kind: "org", key: `org:${org.id}`, org });
      for (const fs of scopeHits)
        out.push({ kind: "scope", key: `scope:${fs.scope.id}`, fs });
    }

    const projHits = data.projects.filter((p) => matches(p.name));
    if (projHits.length > 0) {
      out.push({ kind: "header", key: "h:projects", label: "Projects" });
      for (const p of projHits.slice(0, q ? 50 : 6))
        out.push({ kind: "project", key: `p:${p.id}`, p });
    }
    const taskHits = data.tasks.filter((t) => matches(t.title));
    if (taskHits.length > 0) {
      out.push({ kind: "header", key: "h:tasks", label: "Tasks" });
      for (const t of taskHits.slice(0, q ? 50 : 6))
        out.push({ kind: "task", key: `t:${t.id}`, t });
    }

    if (allowCreate && q && !out.some((r) => r.kind !== "header")) {
      const types = data.orgs.flatMap((o) =>
        o.scope_types.map((t) => ({ org: o, type: t })),
      );
      for (const { org, type } of types)
        out.push({
          kind: "create",
          key: `create:scope:${type.id}`,
          label: `Create ${type.label_singular.toLowerCase()} "${query.trim()}" · ${org.name}`,
          run: () =>
            previewWrite(
              "create scope",
              { org_id: org.id, type_id: type.id, name: query.trim() },
              `Created "${query.trim()}" in ${type.label_plural}`,
            ),
        });
      out.push({
        kind: "create",
        key: "create:project",
        label: `Create project "${query.trim()}"`,
        run: () =>
          previewWrite(
            "create project",
            { name: query.trim() },
            `Created project "${query.trim()}"`,
          ),
      });
      out.push({
        kind: "create",
        key: "create:task",
        label: `Create task "${query.trim()}"`,
        run: () =>
          previewWrite(
            "create task",
            { title: query.trim() },
            `Created task "${query.trim()}"`,
          ),
      });
    }
    return out;
  }, [data, drill, itemState.items, q, query, allowCreate]);

  const actionable = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter((x) => x.r.kind !== "header"),
    [rows],
  );

  // Adjust-during-render: a new query/drill resets the highlight instantly.
  const resetKey = `${q}|${drill?.scope.id ?? ""}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setActiveIdx(0);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-qp-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, rows.length]);

  function activate(row: QPRow) {
    switch (row.kind) {
      case "org":
        if (single) onSinglePick?.(row.org.name, row);
        else sel.toggleOrg(row.org.id);
        break;
      case "scope":
        if (single) onSinglePick?.(row.fs.scope.name, row);
        else sel.toggleScope(row.fs.scope.id);
        break;
      case "project":
        if (single) onSinglePick?.(row.p.name, row);
        else sel.toggleProject(row.p.id);
        break;
      case "task":
        if (single) onSinglePick?.(row.t.title, row);
        else sel.toggleTask(row.t.id);
        break;
      case "item":
        if (single)
          onSinglePick?.(
            `${row.fs.scope.name} · ${row.item.display_name}`,
            row,
          );
        else
          sel.toggleItem({
            scopeId: row.fs.scope.id,
            itemId: row.item.id,
            itemLabel: row.item.display_name,
            scopeName: row.fs.scope.name,
          });
        break;
      case "create":
        row.run();
        setQuery("");
        break;
      case "header":
        break;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const pos = actionable.findIndex((x) => x.i === activeIdx);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = actionable[Math.min(pos + 1, actionable.length - 1)];
      if (next) setActiveIdx(next.i);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = actionable[Math.max(pos - 1, 0)];
      if (prev) setActiveIdx(prev.i);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIdx];
      if (row) activate(row);
    } else if (e.key === "ArrowRight") {
      const row = rows[activeIdx];
      if (row?.kind === "scope") {
        e.preventDefault();
        setQuery("");
        setDrill(row.fs);
      }
    } else if (e.key === "Backspace" && query === "" && drill) {
      e.preventDefault();
      setDrill(null);
    }
  }

  const check = (on: boolean) => (
    <span
      className={cn(
        "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );

  return (
    <div className="flex w-full flex-col text-sm" onKeyDown={onKeyDown}>
      <div className="relative border-b border-border">
        {drill ? (
          <button
            onClick={() => setDrill(null)}
            aria-label="Back to all"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            drill
              ? `${drill.scope.name} — search its ${drill.type.label_singular.toLowerCase()} fields…`
              : placeholder
          }
          className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground/70"
          style={{ fontSize: "16px" }}
        />
      </div>

      {drill && (
        <div className="flex h-7 items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 text-[11px] text-muted-foreground">
          <span className="truncate">{drill.org.name}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate">{drill.type.label_plural}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium text-foreground">
            {drill.scope.name}
          </span>
        </div>
      )}

      <div
        ref={listRef}
        className="overflow-y-auto py-1 scrollbar-thin"
        style={{ height }}
      >
        {drill && itemState.loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading {drill.type.label_singular.toLowerCase()} fields…
          </div>
        ) : drill && itemState.error ? (
          <div className="px-3 py-2 text-xs text-destructive">
            {itemState.error}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {drill
              ? `${drill.type.label_plural} have no fields yet — type a name to define one.`
              : "Nothing matches."}
          </div>
        ) : (
          rows.map((row, i) => {
            if (row.kind === "header")
              return (
                <div
                  key={row.key}
                  className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80"
                >
                  {row.label}
                </div>
              );

            const active = i === activeIdx;
            const base = cn(
              "flex h-7 w-full items-center gap-2 px-2.5 text-left",
              active ? "bg-accent" : "hover:bg-muted",
            );
            const common = {
              "data-qp-idx": i,
              onMouseMove: () => setActiveIdx(i),
            };

            if (row.kind === "org") {
              const on = sel.hasOrg(row.org.id);
              return (
                <button
                  key={row.key}
                  {...common}
                  className={base}
                  onClick={() => activate(row)}
                >
                  {!single && check(on)}
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    Everything in {row.org.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                    org
                  </span>
                </button>
              );
            }
            if (row.kind === "scope") {
              const on = sel.hasScope(row.fs.scope.id);
              const c = resolveColor(row.fs.type);
              const TIcon = resolveIcon(row.fs.type.icon);
              return (
                <div key={row.key} {...common} className={cn(base, "pr-1")}>
                  <button
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => activate(row)}
                  >
                    {!single && check(on)}
                    <TIcon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />
                    <span className="min-w-0 flex-1 truncate">
                      {row.fs.scope.name}
                    </span>
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground/70">
                      {row.fs.type.label_singular}
                    </span>
                  </button>
                  <button
                    aria-label={`Open ${row.fs.scope.name} fields`}
                    onClick={() => {
                      setQuery("");
                      setDrill(row.fs);
                    }}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-background hover:text-foreground",
                      active && "text-muted-foreground",
                    )}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }
            if (row.kind === "project") {
              const on = sel.hasProject(row.p.id);
              return (
                <button
                  key={row.key}
                  {...common}
                  className={base}
                  onClick={() => activate(row)}
                >
                  {!single && check(on)}
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{row.p.name}</span>
                </button>
              );
            }
            if (row.kind === "task") {
              const on = sel.hasTask(row.t.id);
              return (
                <button
                  key={row.key}
                  {...common}
                  className={base}
                  onClick={() => activate(row)}
                >
                  {!single && check(on)}
                  <SquareCheckBig className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{row.t.title}</span>
                </button>
              );
            }
            if (row.kind === "item") {
              const on = sel.hasItem(row.fs.scope.id, row.item.id);
              return (
                <button
                  key={row.key}
                  {...common}
                  className={base}
                  onClick={() => activate(row)}
                >
                  {!single && check(on)}
                  <span className="min-w-0 flex-1 truncate">
                    {row.item.display_name}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {String(row.item.value_type)}
                  </span>
                </button>
              );
            }
            // create
            return (
              <button
                key={row.key}
                {...common}
                className={cn(base, "text-primary")}
                onClick={() => activate(row)}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
              </button>
            );
          })
        )}
      </div>

      {footer}
    </div>
  );
}
