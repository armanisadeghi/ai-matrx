"use client";

// INSIDE 5 — "Token input": the smallest possible footprint — ONE input row.
//
// For hosts with almost no space (filter bars, table toolbars, composer edges).
// Type → a compact 8-row suggestion list appears (scopes ranked first, then
// orgs, projects, tasks — projects/tasks always last); Enter takes the top hit;
// Backspace on empty input removes the last token. Selected context renders as
// inline chips. Still reaches items: a selected scope chip exposes a "+field"
// affordance that swaps the suggestions to that scope's fields.

import React, { useMemo, useRef, useState } from "react";
import { Building2, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { OrgNode } from "@/features/scopes/types";
import {
  flattenScopes,
  itemPickId,
  mergeDraftItems,
  type DraftStore,
  type FlatScope,
  type ItemsState,
  type PickController,
  type PickKind,
} from "./model";
import { EmptyRow, ErrorRow, LoadingRow } from "./rows";

interface Suggestion {
  kind: PickKind;
  id: string;
  label: string;
  sub?: string;
  fg?: string;
  icon?: React.ReactNode;
}

const MAX_SUGGESTIONS = 8;

export function TokenInput({
  orgs,
  projects,
  tasks,
  ctrl,
  items,
  drafts,
  label,
  placeholder = "Filter by context…",
  className,
}: {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  ctrl: PickController;
  items: ItemsState;
  drafts: DraftStore;
  /** Resolves a pick id to a human label (for chips). */
  label: (kind: PickKind, id: string) => string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fieldSource, setFieldSource] = useState<FlatScope | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const flat = useMemo(() => flattenScopes(orgs), [orgs]);

  const chips: { kind: PickKind; id: string }[] = [
    ...ctrl.sel.orgIds.map((id) => ({ kind: "org" as const, id })),
    ...ctrl.sel.scopeIds.map((id) => ({ kind: "scope" as const, id })),
    ...ctrl.sel.itemIds.map((id) => ({ kind: "item" as const, id })),
    ...ctrl.sel.projectIds.map((id) => ({ kind: "project" as const, id })),
    ...ctrl.sel.taskIds.map((id) => ({ kind: "task" as const, id })),
  ];

  const suggestions: Suggestion[] = useMemo(() => {
    if (fieldSource) {
      const merged = mergeDraftItems(
        items.itemsByType[fieldSource.type.id],
        drafts,
        fieldSource.type.id,
      );
      return merged
        .filter((it) => !q || it.display_name.toLowerCase().includes(q))
        .slice(0, MAX_SUGGESTIONS)
        .map((it) => ({
          kind: "item" as const,
          id: itemPickId(fieldSource.scope.id, it.id),
          label: it.display_name,
          sub: `${fieldSource.scope.name} field`,
        }));
    }
    const match = (s: string) => s.toLowerCase().includes(q);
    const out: Suggestion[] = [];
    for (const fs of flat) {
      if (!match(fs.scope.name) && !match(fs.type.label_plural)) continue;
      if (ctrl.has("scope", fs.scope.id)) continue;
      const c = resolveColor(fs.type);
      out.push({
        kind: "scope",
        id: fs.scope.id,
        label: fs.scope.name,
        sub: `${fs.type.label_singular} · ${fs.org.name}`,
        fg: c.fg,
        icon: React.createElement(resolveIcon(fs.type.icon), {
          className: cn("h-3 w-3 shrink-0", c.fg),
        }),
      });
    }
    for (const o of orgs) {
      if (!match(o.name) || ctrl.has("org", o.id)) continue;
      out.push({
        kind: "org",
        id: o.id,
        label: o.name,
        sub: "Organization",
        icon: <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />,
      });
    }
    // Projects and tasks are ALWAYS ranked after the scope hierarchy.
    for (const p of projects) {
      if (!match(p.name) || ctrl.has("project", p.id)) continue;
      out.push({ kind: "project", id: p.id, label: p.name, sub: "Project" });
    }
    for (const t of tasks) {
      if (!match(t.title) || ctrl.has("task", t.id)) continue;
      out.push({ kind: "task", id: t.id, label: t.title, sub: "Task" });
    }
    return out.slice(0, MAX_SUGGESTIONS);
  }, [fieldSource, items.itemsByType, drafts, q, flat, orgs, projects, tasks, ctrl]);

  const fieldLoading = fieldSource
    ? items.loadingTypeIds.has(fieldSource.type.id)
    : false;
  const fieldError = fieldSource
    ? items.errorTypeIds.has(fieldSource.type.id)
    : false;

  const open = focused && (q.length > 0 || fieldSource !== null);

  function pick(s: Suggestion) {
    ctrl.toggle(s.kind, s.id);
    setQuery("");
    setActiveIdx(0);
    if (s.kind === "item") setFieldSource(null);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[activeIdx] ?? suggestions[0];
      if (s) pick(s);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (fieldSource) setFieldSource(null);
      else setQuery("");
    } else if (e.key === "Backspace" && query === "" && chips.length > 0) {
      const last = chips[chips.length - 1];
      ctrl.toggle(last.kind, last.id);
    }
  }

  return (
    <div className={cn("relative", className)}>
      {/* the one-row host */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5",
          focused && "border-ring ring-1 ring-ring/30",
        )}
      >
        <ListFilter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {chips.map(({ kind, id }) => {
          const fs =
            kind === "scope" ? flat.find((f) => f.scope.id === id) : undefined;
          const c = fs ? resolveColor(fs.type) : undefined;
          return (
            <span
              key={`${kind}:${id}`}
              className={cn(
                "inline-flex h-[22px] shrink-0 items-center gap-1 rounded border bg-transparent px-1.5 text-[11px] font-medium",
                c?.fg ?? "text-foreground",
                c?.border ?? "border-border",
              )}
            >
              <span className="max-w-[120px] truncate">{label(kind, id)}</span>
              {kind === "scope" && fs && (
                <button
                  type="button"
                  title={`Add one of ${fs.scope.name}'s fields`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFieldSource(fs);
                    items.ensure(fs.type.id);
                    inputRef.current?.focus();
                  }}
                  className="rounded px-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  +field
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  ctrl.toggle(kind, id);
                }}
                className="rounded p-px hover:bg-muted"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={
            fieldSource
              ? `Which ${fieldSource.scope.name} field?`
              : chips.length === 0
                ? placeholder
                : "Add more…"
          }
          className="h-6 min-w-[90px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
          style={{ fontSize: "16px" }}
        />
        {chips.length > 0 && (
          <button
            type="button"
            title="Clear all"
            onClick={(e) => {
              e.stopPropagation();
              ctrl.clear();
              setFieldSource(null);
            }}
            className="ml-auto shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>

      {/* suggestion flyout — fixed max height, never taller than 8 rows */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {fieldSource && (
            <div className="flex h-6 items-center gap-1 border-b border-border px-2 text-[10px] text-muted-foreground">
              Fields of
              <span className="font-medium text-foreground">
                {fieldSource.scope.name}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFieldSource(null)}
                className="ml-auto rounded px-1 hover:bg-muted"
              >
                back
              </button>
            </div>
          )}
          <div className="max-h-[210px] overflow-y-auto p-1 scrollbar-thin">
            {fieldSource && fieldLoading && suggestions.length === 0 ? (
              <LoadingRow label="Loading fields…" />
            ) : fieldSource && fieldError ? (
              <ErrorRow
                label="Couldn't load fields"
                onRetry={() => items.retry(fieldSource.type.id)}
              />
            ) : suggestions.length === 0 ? (
              <EmptyRow
                label={fieldSource ? "No matching fields." : "No matches."}
              />
            ) : (
              suggestions.map((s, i) => (
                <div
                  key={`${s.kind}:${s.id}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className={cn(
                    "flex h-[26px] cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-muted",
                    i === activeIdx && "bg-accent",
                  )}
                >
                  {s.icon}
                  <span className={cn("min-w-0 truncate", s.fg)}>{s.label}</span>
                  {s.sub && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                      {s.sub}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
