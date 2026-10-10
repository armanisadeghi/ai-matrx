"use client";

/**
 * THE CANDIDATES CELL on every mandate list (Mandate Candidates, PLAN §2.6;
 * Arman, 2026-09-28: "each one that comes in showing up as a count on the
 * mandate list and page"). One component for the platform-admin list and the
 * member / organization lists (V1 D4) — "2 of 3 in"; red when a pair failed or
 * came out worse; amber when stalled; empty when no candidate is open. It
 * re-reads itself on the heartbeat while collecting (V1 D3, `../live.ts`) and
 * opens the record's Candidates tab.
 */

import Link from "next/link";
import type { MandateCandidateCell } from "@/features/mandates/admin-list/rpc";
import { useLiveCandidateCell } from "../live";

export function CandidateListCell({
  mandateId,
  cell: listCell,
  href,
}: {
  mandateId: string | null;
  /** `undefined` = the list read did not carry candidates; `null` = none open. */
  cell: MandateCandidateCell | null | undefined;
  /** The record page; the cell adds `?tab=candidates`. */
  href: string;
}) {
  const cell = useLiveCandidateCell(mandateId, listCell);
  if (cell === undefined) {
    return (
      <span className="text-muted-foreground" title="The list read did not carry candidates.">
        —
      </span>
    );
  }
  if (!cell) return null;
  const bad = cell.runs_failed > 0 || cell.runs_regressed > 0;
  const title = bad
    ? `${cell.runs_failed} failed, ${cell.runs_regressed} worse than live.`
    : cell.stalled
      // read-gate-exempt: tooltip wording from the cell's own counters; nothing is read
      ? "No new run for a while."
      : cell.open_count > 1
        ? `${cell.open_count} candidates open; this is the one collecting.`
        : undefined;
  return (
    <Link
      href={`${href}${href.includes("?") ? "&" : "?"}tab=candidates`}
      data-testid="mandate-candidate-cell"
      onClick={(event) => event.stopPropagation()}
      title={title}
      className={
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums hover:underline " +
        (bad
          ? "bg-destructive/10 text-destructive-ink"
          : cell.stalled
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-primary/10 text-primary-ink")
      }
    >
      {cell.runs_in} of {cell.runs_wanted} in
      {cell.open_count > 1 ? <span className="opacity-70">+{cell.open_count - 1}</span> : null}
    </Link>
  );
}
