"use client";

/**
 * Press Room dense primitives.
 *
 * These are the parts of the console that had to be built rather than reused,
 * and each exists for a stated reason. Everything with a shared primitive
 * behind it (buttons, badges, scroll areas, tooltips, sheets, loading, empty,
 * error) comes from `components/ui`, `components/official` and
 * `features/marketing/components/shared` — see the report.
 *
 * Colour rule (data-dense-rules §1): semantic tokens for everything except
 * status, where a small fixed set of tinted classes with `dark:` variants is
 * sanctioned. That set is declared ONCE here so no row can invent a shade.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  band,
  SCORE_SPECS,
  type Band,
  type StoryAngleRow,
  type Urgency,
} from "../types";

/* ── tone vocabulary ──────────────────────────────────────────────────────── */

export type Tone = "good" | "warn" | "hot" | "cool" | "muted" | "accent";

export const TONE_CHIP: Record<Tone, string> = {
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  hot: "bg-destructive/15 text-destructive border-destructive/30",
  cool: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  accent: "bg-primary/15 text-primary border-primary/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const TONE_FILL: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  hot: "bg-destructive",
  cool: "bg-blue-500",
  accent: "bg-primary",
  muted: "bg-muted-foreground/40",
};

export const BAND_TONE: Record<Band, Tone> = {
  strong: "good",
  fair: "warn",
  weak: "muted",
};

/* ── chips ────────────────────────────────────────────────────────────────── */

export function Chip({
  children,
  tone = "muted",
  title,
  className,
  icon,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[11px] font-medium leading-4",
        TONE_CHIP[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** A label that is also a filter toggle — the facet rail's unit. */
export function FacetButton({
  label,
  count,
  active,
  onClick,
  tone = "muted",
  disabled,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "bg-accent font-medium text-accent-foreground ring-1 ring-primary/40"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        disabled && "cursor-default opacity-40 hover:bg-transparent",
      )}
    >
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_FILL[tone])}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

/* ── the score comb ───────────────────────────────────────────────────────────
 *
 * THE PROBLEM the brief set: five 0–100 numbers per row is noise if printed.
 *
 * THE ANSWER: print one number and draw the other four. `priority` is the
 * ranking decision, so it gets typographic weight and a real numeral. The
 * remaining four become a 4-bar comb — Tufte's sparkline argument, at
 * table-cell resolution: the SHAPE is the comparison, and a row whose comb is
 * tall on the left and short on the right (newsworthy but unproven) is
 * distinguishable from its opposite at a glance, without reading a digit.
 *
 * The comb is 34px wide. It never becomes the thing you look at first; it is
 * there for the second glance, and the full labelled numbers are one hover or
 * one selection away. Bars are also never the only channel — every value is in
 * the accessible name, so a screen reader gets the numbers verbatim.
 * ────────────────────────────────────────────────────────────────────────── */

const COMB_KEYS = SCORE_SPECS.filter((spec) => spec.key !== "priority");

export function ScoreComb({
  angle,
  className,
}: {
  angle: StoryAngleRow;
  className?: string;
}) {
  const readout = COMB_KEYS.map(
    (spec) => `${spec.label} ${angle[spec.key]}`,
  ).join(", ");

  return (
    <span
      role="img"
      aria-label={readout}
      title={readout}
      className={cn("inline-flex h-4 items-end gap-px", className)}
    >
      {COMB_KEYS.map((spec) => {
        const value = angle[spec.key];
        return (
          <span
            key={spec.key}
            aria-hidden
            className={cn(
              "w-1.5 rounded-t-[1px]",
              TONE_FILL[BAND_TONE[band(value)]],
            )}
            // 3px floor so a zero still reads as a measured zero, not a gap.
            style={{ height: `${3 + (value / 100) * 13}px` }}
          />
        );
      })}
    </span>
  );
}

/** The priority numeral — the one score that gets to be read as a number. */
export function PriorityMark({ value }: { value: number }) {
  const tone = BAND_TONE[band(value)];
  return (
    <span
      title={`Priority ${value} of 100`}
      className={cn(
        "inline-flex h-5 w-7 shrink-0 items-center justify-center rounded border text-[11px] font-semibold tabular-nums",
        TONE_CHIP[tone],
      )}
    >
      {value}
    </span>
  );
}

/** Full labelled meter — the detail-pane form of the same five numbers. */
export function ScoreMeters({ angle }: { angle: StoryAngleRow }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-1 gap-y-1">
        {SCORE_SPECS.map((spec) => {
          const value = angle[spec.key];
          const tone = BAND_TONE[band(value)];
          return (
            <Tooltip key={spec.key}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/50">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {spec.label}
                  </span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        TONE_FILL[tone],
                      )}
                      style={{ width: `${value}%` }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                    {value}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-64">
                <p className="text-xs">{spec.meaning}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/* ── the evidence ledger meter ────────────────────────────────────────────────
 *
 * The brief's hardest constraint: `missing_evidence` must feel like momentum,
 * not like a red error.
 *
 * So it is drawn as a COMPLETION bar, in the visual grammar of a checklist that
 * is partly done — filled segments for proof in hand, hollow segments for proof
 * still to gather. The outstanding segments are `border-primary/40` on a muted
 * ground: the colour of a to-do, never of a fault. Nothing on this surface
 * renders missing evidence in destructive red; the only red in the console is
 * an expired deadline, which is the one thing that is genuinely lost.
 * ────────────────────────────────────────────────────────────────────────── */

export function EvidenceMeter({
  have,
  total,
  size = "sm",
  className,
}: {
  have: number;
  total: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const label =
    total === 0
      ? "No proof needed"
      : have === total
        ? `All ${total} proofs in hand`
        : `${have} of ${total} proofs in hand`;

  // Above eight segments the comb stops being countable; fall back to a bar.
  if (total > 8) {
    return (
      <span
        title={label}
        aria-label={label}
        className={cn("inline-flex items-center gap-1.5", className)}
      >
        <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${(have / total) * 100}%` }}
          />
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {have}/{total}
        </span>
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: Math.max(total, 1) }).map((_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "rounded-[1px] border",
            size === "md" ? "h-3 w-1.5" : "h-2.5 w-1",
            total === 0
              ? "border-border bg-muted"
              : index < have
                ? "border-primary bg-primary"
                : "border-primary/40 bg-primary/10",
          )}
        />
      ))}
    </span>
  );
}

/* ── deadline pip ─────────────────────────────────────────────────────────── */

export const URGENCY_TONE: Record<Urgency["bucket"], Tone> = {
  expired: "hot",
  critical: "hot",
  today: "warn",
  soon: "cool",
  later: "muted",
  none: "muted",
};

export function DeadlinePip({
  urgency,
  showLabel = true,
  className,
}: {
  urgency: Urgency;
  showLabel?: boolean;
  className?: string;
}) {
  const tone = URGENCY_TONE[urgency.bucket];
  const pulses = urgency.bucket === "critical";
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      title={urgency.label}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {pulses ? (
          <span
            aria-hidden
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              TONE_FILL[tone],
            )}
          />
        ) : null}
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            TONE_FILL[tone],
          )}
        />
      </span>
      {showLabel ? (
        <span
          className={cn(
            "text-[11px] font-medium tabular-nums",
            urgency.bucket === "expired" || urgency.bucket === "critical"
              ? "text-destructive"
              : urgency.bucket === "today"
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
          )}
        >
          {urgency.label}
        </span>
      ) : null}
    </span>
  );
}

/* ── layout atoms ─────────────────────────────────────────────────────────── */

export function RailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-px">{children}</div>
    </section>
  );
}

export function KeyValue({
  label,
  children,
  align = "baseline",
}: {
  label: string;
  children: React.ReactNode;
  align?: "baseline" | "center";
}) {
  return (
    <div
      className={cn(
        "flex gap-3 py-0.5",
        align === "center" ? "items-center" : "items-baseline",
      )}
    >
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-xs text-foreground">{children}</div>
    </div>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyPanel({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Skeleton rows sized to the real row, so nothing shifts when data lands. */
export function RowSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 px-2 py-2">
          <div className="h-5 w-7 shrink-0 animate-pulse rounded bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${62 + ((index * 13) % 30)}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-muted/60"
              style={{ width: `${34 + ((index * 7) % 24)}%` }}
            />
          </div>
          <div className="h-4 w-9 shrink-0 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
