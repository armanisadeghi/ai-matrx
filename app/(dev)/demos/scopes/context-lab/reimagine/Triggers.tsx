"use client";

// The TRIGGER set — six form factors for the thing you see BEFORE the picker
// opens, from a 44px tap pill down to a VS Code status-bar item. All are pure
// presentational: they receive the live selection and an onClick; the host
// decides which inside they open.

import React from "react";
import {
  ChevronsUpDown,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { nodeKey, summarizeSelection, type PickNode } from "./engine";
import { KindGlyph } from "./parts";

export interface TriggerProps {
  nodes: PickNode[];
  onClick: () => void;
  /** Ref target so popover hosts can anchor. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}

/** Distinct color swatches represented in the selection (max `cap`). */
function swatches(nodes: PickNode[], cap = 4): string[] {
  const seen = new Set<string>();
  for (const n of nodes) {
    seen.add(n.color?.swatch ?? "bg-muted-foreground");
    if (seen.size >= cap) break;
  }
  return [...seen];
}

/* ── T1 · Tap pill (the tap-target family — NO padding around it, ever) ──── */

export function TapTargetTrigger({ nodes, onClick, buttonRef }: TriggerProps) {
  return (
    <TapTargetButtonGroup>
      <TapTargetButtonForGroup
        ref={buttonRef}
        icon={<Layers className="matrx-tap-icon" />}
        label={nodes.length === 0 ? "Context" : `Context · ${nodes.length}`}
        onClick={onClick}
        ariaLabel="Choose context"
        tooltip={
          nodes.length === 0 ? "Choose context" : summarizeSelection(nodes)
        }
      />
      <TapTargetButtonForGroup
        icon={<Plus className="matrx-tap-icon" />}
        onClick={onClick}
        ariaLabel="Add context"
        tooltip="Add context"
      />
    </TapTargetButtonGroup>
  );
}

/* ── T2 · Lens chip — colored dots + count summary, one compact pill ─────── */

export function LensChip({ nodes, onClick, buttonRef }: TriggerProps) {
  const dots = swatches(nodes);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs text-foreground hover:bg-muted"
    >
      {nodes.length === 0 ? (
        <>
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Set context</span>
        </>
      ) : (
        <>
          <span className="flex items-center -space-x-0.5">
            {dots.map((s) => (
              <span
                key={s}
                className={cn(
                  "h-2 w-2 rounded-full ring-1 ring-card",
                  s,
                )}
              />
            ))}
          </span>
          <span>{summarizeSelection(nodes)}</span>
        </>
      )}
      <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

/* ── T3 · Status-bar item — the VS Code bottom-bar look, 20px tall ──────── */

export function StatusBarItem({ nodes, onClick, buttonRef }: TriggerProps) {
  const first = nodes[0];
  const rest = nodes.length - 1;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="inline-flex h-5 max-w-full items-center gap-1 rounded-sm px-1.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Layers className="h-3 w-3 shrink-0" />
      {first ? (
        <>
          <span className="min-w-0 truncate">
            {[...first.path, first.label].join(" › ")}
          </span>
          {rest > 0 && <span className="shrink-0 text-primary">+{rest}</span>}
        </>
      ) : (
        <span>no context</span>
      )}
    </button>
  );
}

/* ── T4 · Dot stack — facepile-sized, for icon rails and table cells ─────── */

export function DotStack({ nodes, onClick, buttonRef }: TriggerProps) {
  const dots = swatches(nodes, 3);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={
        nodes.length === 0 ? "Choose context" : summarizeSelection(nodes)
      }
      title={nodes.length === 0 ? "Choose context" : summarizeSelection(nodes)}
      className="inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border border-border bg-card px-1 hover:bg-muted"
    >
      {nodes.length === 0 ? (
        <Plus className="h-3 w-3 text-muted-foreground" />
      ) : (
        <>
          <span className="flex items-center -space-x-1">
            {dots.map((s) => (
              <span
                key={s}
                className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-card", s)}
              />
            ))}
          </span>
          <span className="px-0.5 text-[10px] font-semibold text-foreground">
            {nodes.length}
          </span>
        </>
      )}
    </button>
  );
}

/* ── T5 · Slot field — a form control that IS the selection ─────────────── */

export function SlotField({ nodes, onClick, buttonRef }: TriggerProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-left text-sm",
        nodes.length === 0
          ? "border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:bg-muted/40"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      {nodes.length === 0 ? (
        <>
          <Plus className="h-3.5 w-3.5" />
          <span>Add context…</span>
        </>
      ) : (
        nodes.slice(0, 6).map((n) => (
          <span
            key={nodeKey(n)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 text-xs",
              n.color?.border ?? "border-border",
              n.color?.fg ?? "text-foreground",
            )}
          >
            <KindGlyph node={n} />
            <span className="max-w-[110px] truncate">{n.label}</span>
          </span>
        ))
      )}
      {nodes.length > 6 && (
        <span className="text-xs text-muted-foreground">
          +{nodes.length - 6} more
        </span>
      )}
    </button>
  );
}

/* ── T6 · Command bar — a search-shaped invitation with a kbd hint ───────── */

export function CommandBarTrigger({ nodes, onClick, buttonRef }: TriggerProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="flex h-8 w-full max-w-[300px] items-center gap-2 rounded-lg border border-border bg-glass px-2.5 text-xs text-muted-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">
        {nodes.length === 0
          ? "Search context…"
          : summarizeSelection(nodes)}
      </span>
      <kbd className="shrink-0 rounded border border-border bg-background px-1 py-0.5 text-[9px]">
        Ctrl K
      </kbd>
    </button>
  );
}

/* ── T7 · Filter control — a toolbar filter face for list surfaces ───────── */

export function FilterControl({ nodes, onClick, buttonRef }: TriggerProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
        nodes.length > 0
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <SlidersHorizontal className="h-3 w-3" />
      <span>Filter</span>
      {nodes.length > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
          {nodes.length}
        </span>
      )}
    </button>
  );
}
