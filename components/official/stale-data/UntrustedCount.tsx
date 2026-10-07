/**
 * UntrustedCount — a number that refuses to be reported when the read that
 * produced it failed.
 *
 * THE DEAD END this kills: every count on a surface is derived from the rows
 * currently in state (`rows.length`, `rows.filter(…).length`). When a fetch
 * fails and the rows are cleared — which is the correct thing to do, since
 * stale rows under a fresh banner are their own defect — every one of those
 * counters silently becomes `0`. A console then reports "Total 0 · Failed 0"
 * in confident bold type, which is not "we couldn't read this": it is a
 * positive claim about the database that nobody is entitled to make. Zero is
 * the single most dangerous default a failed read can produce, because it is
 * indistinguishable from good news.
 *
 * `StaleDataNotice` is the banner half of the same rule and this is the inline
 * half — a surface that shows the notice and still prints `0` beside it is
 * contradicting itself, and the number wins because it looks like data.
 *
 * Renders the value when the read succeeded, an em dash when it failed, and a
 * quiet ellipsis while it is still in flight. It carries the screen-reader
 * explanation itself so a caller cannot forget it: an em dash is mute to a
 * screen reader, so without the label the failure is invisible to exactly the
 * users least able to infer it from context.
 *
 * Tell it the read's outcome ONE of two ways:
 *   - `read={{ status, error }}` — the same `ReadOutcome` a table's `read=`
 *     takes (structurally the design-system `MatrxDataTableRead`);
 *   - `trustworthy={!loadFailed}` — when all you hold is the failure flag.
 *
 * Styling is entirely the caller's — this owns the VALUE, never the chrome, so
 * it drops unchanged into a stat card, a pill badge, or a sentence. The shared
 * count primitives (KpiTile, MetricCell, ResearchFilterBar) take the same
 * `read=` and resolve it with `countReadState` below, so every stat tile on the
 * platform says "—" the same way.
 */

import React from "react";
import type { ReadOutcome } from "@/components/read-state/ReadGate";

/** The read outcome a count primitive is told: a `ReadOutcome` (or a `MatrxDataTableRead`). */
export type CountRead = Pick<ReadOutcome, "status" | "error" | "hasData">;

/** What a count may honestly show for its read: the number, a failure dash, or a loading mark. */
export type CountReadState = "ready" | "loading" | "failed";

/**
 * Fold a count's read input into what it may show.
 * - First load (nothing known yet): "loading" → "…".
 * - A read that failed with nothing known: "failed" → "—".
 * - STALE-WHILE-ERROR (RC-B12 r13 ruling): once a read has produced a value
 *   (`read.hasData`), a refetch in flight or a failed refresh keeps showing the
 *   last known value ("ready") — the surface's stale notice says it may be out
 *   of date; `countIsStale` lets a count mark itself. No flicker to "…" or "—".
 * With neither input the number is shown (nothing was said about a read).
 */
export function countReadState(input: {
  read?: CountRead | null;
  trustworthy?: boolean;
}): CountReadState {
  const { read, trustworthy } = input;
  if (trustworthy === false) return "failed";
  if (read) {
    const failed = read.status === "error" || (read.error != null && read.error !== false && read.error !== "");
    if (read.hasData) return "ready";
    if (failed) return "failed";
    if (read.status === "loading") return "loading";
  }
  return "ready";
}

/** A last-known value shown over a failed refresh (see `countReadState`). */
export function countIsStale(read: CountRead | null | undefined): boolean {
  if (!read?.hasData) return false;
  return read.status === "error" || (read.error != null && read.error !== false && read.error !== "");
}

/** The screen-reader sentence for a count that could not be read. */
export function unavailableCountLabel(label: string): string {
  return `${label} unavailable — could not be read`;
}

type UntrustedCountRead =
  | {
      /**
       * Whether the read behind this number succeeded. Pass `!loadFailed` — the
       * same flag that drives the surface's `StaleDataNotice`, so the banner and
       * the number can never disagree.
       */
      trustworthy: boolean;
      read?: never;
    }
  | {
      /** The read behind this number — `{ status, error }` (a table's `read=` value fits). */
      read: CountRead;
      trustworthy?: never;
    };

export type UntrustedCountProps = UntrustedCountRead & {
  /** The derived count (or its formatted text). Never rendered unless the read succeeded. */
  value: number | string;
  /**
   * What this counts, as the user reads it on screen ("Total", "Unresolved").
   * Becomes "<label> unavailable" for screen readers when the read failed.
   */
  label: string;
  className?: string;
};

export function UntrustedCount({
  value,
  trustworthy,
  read,
  label,
  className,
}: UntrustedCountProps) {
  const state = countReadState({ read, trustworthy });
  if (state === "ready") {
    if (countIsStale(read)) {
      return (
        <span
          className={className}
          aria-label={`${label} ${value} — last known value, couldn't refresh`}
          title="Couldn't refresh — last known value"
        >
          {value}
        </span>
      );
    }
    return <span className={className}>{value}</span>;
  }
  if (state === "loading") {
    return (
      <span className={className} aria-busy="true" aria-label={`${label} loading`}>
        …
      </span>
    );
  }
  return (
    <span
      className={className}
      aria-label={unavailableCountLabel(label)}
      title="Couldn't be read"
    >
      —
    </span>
  );
}
