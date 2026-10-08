// components/official/kpi/KpiTile.tsx
//
// THE KPI TILE — one number, its label, an optional one-line hint, and an
// optional drill-in. The shared primitive for KPI pages (Spend's TotalsStrip
// tile is the model it was lifted from). A tile with `href` is a link: every
// number that names a set of records opens that set.
//
// A number that could not be measured is never shown as 0: pass
// `value={null}` and the tile renders "—" with the hint saying why. A number
// read from the database takes that read's outcome — `read={{ status, error }}`
// (a table's `read=` value fits): a failed read renders "—" with an
// "unavailable" label for screen readers, an in-flight read renders loading.
//
// `title` is the number's one-sentence definition. It renders through
// `components/official/InfoHint.tsx` — an info icon right after the label that
// opens on hover, keyboard focus, and tap — never as a native `title=` on the
// tile, which phones and keyboard users can't reach.

"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { InfoHint } from "@/components/official/InfoHint";
import { cn } from "@/lib/utils";
import {
  countReadState,
  unavailableCountLabel,
  type CountRead,
} from "@ai-matrx/design-system";

export type KpiTone = "neutral" | "good" | "warn" | "bad";

const TONE_VALUE: Record<KpiTone, string> = {
  neutral: "text-foreground",
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-rose-700 dark:text-rose-400",
};

const TONE_DOT: Record<KpiTone, string | null> = {
  neutral: null,
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
};

export interface KpiTileProps {
  label: string;
  /** `null` = not measured; renders "—", never 0. */
  value: ReactNode | null;
  hint?: ReactNode;
  tone?: KpiTone;
  /** Drill-in destination. The whole tile becomes the link. */
  href?: string;
  /** Definition — what the number counts, in one sentence (≤ 140 chars). Renders as an InfoHint after the label. */
  title?: string;
  loading?: boolean;
  /** The read behind `value`. Failed → "—" (never 0); loading → the loading bar. */
  read?: CountRead | null;
  className?: string;
}

export function KpiTile({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  title,
  loading: loadingProp = false,
  read,
  className,
}: KpiTileProps) {
  const readState = countReadState({ read });
  const loading = loadingProp || readState === "loading";
  const failed = readState === "failed";
  const shown = failed ? null : value;
  const dot = TONE_DOT[tone];
  const body = (
    <>
      {/* A label wraps to a second line rather than being cut ("NO DEFAULT
          MANDA…" on a phone, punch list 2026-09-26) — a KPI whose name is
          unreadable is a number without a meaning. */}
      <div className="flex min-w-0 items-start gap-1.5 type-meta font-medium uppercase tracking-wide text-muted-foreground">
        {dot ? (
          <span aria-hidden className={cn("mt-1 inline-block h-2 w-2 shrink-0 rounded-sm", dot)} />
        ) : null}
        <span className="line-clamp-2 break-words">
          {label}
          {title ? (
            <>
              {" "}
              <InfoHint text={title} label={`What ${label} means`} />
            </>
          ) : null}
        </span>
      </div>
      {loading ? (
        <div className="my-0.5 h-6 w-12 animate-pulse rounded bg-muted" aria-hidden />
      ) : (
        <div
          className={cn(
            "truncate text-lg font-semibold leading-tight tabular-nums",
            shown === null ? "text-muted-foreground" : TONE_VALUE[tone],
          )}
          aria-label={failed ? unavailableCountLabel(label) : undefined}
          title={failed ? "Couldn't be read" : undefined}
        >
          {shown === null ? "—" : shown}
        </div>
      )}
      {hint ? (
        <div className="truncate type-meta text-muted-foreground">{hint}</div>
      ) : null}
    </>
  );

  const shell = cn(
    "flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2",
    className,
  );

  if (href && !loading && shown !== null) {
    return (
      <Link
        href={href}
        className={cn(
          shell,
          "transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={shell} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}

/** The standard responsive tile row. */
export function KpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
