"use client";

// TRIGGERS — six ways to summon (and summarize) the context picker, sized for
// six very different hosts. All are presentational: the page wires each into a
// Popover/host with a real inside. Every trigger has a stable footprint — the
// selection changing NEVER resizes the control (chips truncate, counts swap
// glyphs of identical size).

import React, { forwardRef } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TapTargetButtonTransparent,
} from "@/components/icons/TapTargetButton";
import { TapTargetLabeled } from "@/components/icons/TapTargetLabeled";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import type { OrgNode } from "@/features/scopes/types";
import { flattenScopes, selCount, type PickKind, type PickSel } from "./model";

export interface TriggerProps {
  sel: PickSel;
  label: (kind: PickKind, id: string) => string;
  orgs: OrgNode[];
  onClick?: () => void;
  open?: boolean;
}

/** Ordered (kind,id) pairs of the selection — scopes first, projects/tasks last. */
function orderedPicks(sel: PickSel): { kind: PickKind; id: string }[] {
  return [
    ...sel.orgIds.map((id) => ({ kind: "org" as const, id })),
    ...sel.scopeIds.map((id) => ({ kind: "scope" as const, id })),
    ...sel.itemIds.map((id) => ({ kind: "item" as const, id })),
    ...sel.projectIds.map((id) => ({ kind: "project" as const, id })),
    ...sel.taskIds.map((id) => ({ kind: "task" as const, id })),
  ];
}

/* ── T1 · Chip summary — toolbar/header workhorse (Linear label-button vibe) ── */

export const ChipSummaryTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function ChipSummaryTrigger({ sel, label, orgs, onClick, open }, ref) {
    const picks = orderedPicks(sel);
    const flat = flattenScopes(orgs);
    const shown = picks.slice(0, 2);
    const extra = picks.length - shown.length;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-7 w-[240px] items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[12px] hover:bg-muted",
          open && "border-ring ring-1 ring-ring/30",
        )}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {picks.length === 0 ? (
          <span className="text-muted-foreground">Context</span>
        ) : (
          <>
            {shown.map(({ kind, id }) => {
              const fs =
                kind === "scope"
                  ? flat.find((f) => f.scope.id === id)
                  : undefined;
              const c = fs ? resolveColor(fs.type) : undefined;
              return (
                <span
                  key={`${kind}:${id}`}
                  className={cn(
                    "inline-flex h-[18px] min-w-0 items-center rounded border px-1 text-[11px] font-medium",
                    c?.fg ?? "text-foreground",
                    c?.border ?? "border-border",
                  )}
                >
                  <span className="max-w-[76px] truncate">
                    {label(kind, id)}
                  </span>
                </span>
              );
            })}
            {extra > 0 && (
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                +{extra}
              </span>
            )}
          </>
        )}
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    );
  },
);

/* ── T2 · Tap target — icon-rail / toolbar-icon host (the tap-button family) ──
   NOTE: no padding or spacing may be applied around the tap buttons — the
   44px outer target IS the spacing. The count badge rides inside the icon. */

export const TapTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function TapTrigger({ sel, onClick }, ref) {
    const n = selCount(sel);
    return (
      <TapTargetLabeled label={n > 0 ? `Context · ${n}` : "Context"}>
        <TapTargetButtonTransparent
          ref={ref}
          onClick={onClick}
          ariaLabel={n > 0 ? `Context (${n} selected)` : "Context"}
          tooltip={false}
          icon={
            <span className="relative flex items-center justify-center">
              <Layers className="matrx-tap-icon text-foreground" />
              {n > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                  {n > 9 ? "9+" : n}
                </span>
              )}
            </span>
          }
        />
      </TapTargetLabeled>
    );
  },
);

/* ── T3 · Path — breadcrumb for SINGLE-select "working context" headers ── */

export const PathTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function PathTrigger({ sel, orgs, onClick, open }, ref) {
    const flat = flattenScopes(orgs);
    const scopeId = sel.scopeIds[0];
    const fs = scopeId ? flat.find((f) => f.scope.id === scopeId) : undefined;
    const orgOnly = !fs && sel.orgIds[0]
      ? orgs.find((o) => o.id === sel.orgIds[0])
      : undefined;
    const c = fs ? resolveColor(fs.type) : undefined;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-7 max-w-[320px] items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-muted",
          open && "bg-muted",
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {fs ? (
          <>
            <span className="max-w-[90px] truncate text-muted-foreground">
              {fs.org.name}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className={cn("shrink-0 text-muted-foreground", c?.fg)}>
              {fs.type.label_singular}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className={cn("max-w-[110px] truncate font-medium", c?.fg)}>
              {fs.scope.name}
            </span>
          </>
        ) : orgOnly ? (
          <span className="max-w-[200px] truncate font-medium">
            {orgOnly.name}
          </span>
        ) : (
          <span className="text-muted-foreground">No working context</span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    );
  },
);

/* ── T4 · Micro count — table-row / list-cell host (20px, never resizes) ── */

export const MicroCountTrigger = forwardRef<
  HTMLButtonElement,
  TriggerProps & { title?: string }
>(function MicroCountTrigger({ sel, onClick, open, title }, ref) {
  const n = selCount(sel);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={title ?? (n > 0 ? `${n} context nodes` : "No context — add some")}
      className={cn(
        "flex h-5 w-9 shrink-0 items-center justify-center gap-0.5 rounded border text-[10px] font-semibold transition-colors",
        n > 0
          ? "border-border text-muted-foreground hover:bg-muted"
          : "border-warning/50 text-warning hover:bg-warning/10",
        open && "bg-muted",
      )}
    >
      <Layers className="h-2.5 w-2.5" />
      {n > 0 ? n : "—"}
    </button>
  );
});

/* ── T5 · Field — settings-form host (looks like an input, chips live inside) ── */

export const FieldTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function FieldTrigger({ sel, label, orgs, onClick, open }, ref) {
    const picks = orderedPicks(sel);
    const flat = flattenScopes(orgs);
    const shown = picks.slice(0, 4);
    const extra = picks.length - shown.length;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-9 w-full items-center gap-1 overflow-hidden rounded-md border border-border bg-background px-2 text-left text-[13px] hover:border-ring/60",
          open && "border-ring ring-1 ring-ring/30",
        )}
      >
        {picks.length === 0 ? (
          <>
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Add context…</span>
          </>
        ) : (
          <>
            {shown.map(({ kind, id }) => {
              const fs =
                kind === "scope"
                  ? flat.find((f) => f.scope.id === id)
                  : undefined;
              const c = fs ? resolveColor(fs.type) : undefined;
              return (
                <span
                  key={`${kind}:${id}`}
                  className={cn(
                    "inline-flex h-[22px] min-w-0 items-center rounded border px-1.5 text-[11px] font-medium",
                    c?.fg ?? "text-foreground",
                    c?.border ?? "border-border",
                  )}
                >
                  <span className="max-w-[92px] truncate">
                    {label(kind, id)}
                  </span>
                </span>
              );
            })}
            {extra > 0 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                +{extra} more
              </span>
            )}
          </>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  },
);

/* ── T6 · Command — search-first host (the ⌘K / VS Code quick-pick entry) ── */

export const CommandTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function CommandTrigger({ sel, onClick, open }, ref) {
    const n = selCount(sel);
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-8 w-[280px] items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-[13px] text-muted-foreground hover:bg-muted",
          open && "border-ring ring-1 ring-ring/30",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span>Search context…</span>
        {n > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
            {n}
          </span>
        )}
        <kbd className="ml-auto rounded border border-border bg-background px-1 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
    );
  },
);

