"use client";

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
 * Renders the value when `trustworthy`, an em dash otherwise, and carries the
 * screen-reader explanation itself so a caller cannot forget it: an em dash is
 * mute to a screen reader, so without the label the failure is invisible to
 * exactly the users least able to infer it from context.
 *
 * Styling is entirely the caller's — this owns the VALUE, never the chrome, so
 * it drops unchanged into a stat card, a pill badge, or a sentence.
 */

import React from "react";

export interface UntrustedCountProps {
  /** The derived count. Ignored (never rendered) when not trustworthy. */
  value: number;
  /**
   * Whether the read behind this number succeeded. Pass `!loadFailed` — the
   * same flag that drives the surface's `StaleDataNotice`, so the banner and
   * the number can never disagree.
   */
  trustworthy: boolean;
  /**
   * What this counts, as the user reads it on screen ("Total", "Unresolved").
   * Becomes "<label> unavailable" for screen readers when the read failed.
   */
  label: string;
  className?: string;
}

export function UntrustedCount({
  value,
  trustworthy,
  label,
  className,
}: UntrustedCountProps) {
  if (trustworthy) {
    return <span className={className}>{value}</span>;
  }
  return (
    <span
      className={className}
      aria-label={`${label} unavailable — could not be read`}
      title="Couldn't be read"
    >
      —
    </span>
  );
}
