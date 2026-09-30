"use client";

// features/mandates/record-next/useCandidateCount.ts
//
// THE CANDIDATES TAB'S BADGE (Mandate Candidates, PLAN §2.6; Arman,
// 2026-09-28: "each one that comes in showing up as a count on the mandate list
// and page"). Read from the same door the tab body reads
// (`GET /mandates/{key}/candidates` → `active.counts`), so the page's badge,
// the window's badge and the tab never disagree. The panel announces a change
// (set / promote / put back / discard) with `announceCandidatesChanged`, and
// every badge for that mandate re-reads.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import {
  fetchLiveCandidates,
  type LiveCandidate,
} from "@/features/mandates/candidate-dialog/api";
import type { RecordTabCount } from "./record-tabs";

const CHANGED = "matrx:mandate-candidates-changed";

export function announceCandidatesChanged(mandateKey: string): void {
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { mandateKey } }));
}

export function onCandidatesChanged(
  mandateKey: string,
  listener: () => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ mandateKey?: string }>).detail;
    if (!detail?.mandateKey || detail.mandateKey === mandateKey) listener();
  };
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}

/** The badge for one open candidate. Pure — shared with the list cell's rules. */
export function candidateTabCount(candidate: LiveCandidate | null | undefined): RecordTabCount | null {
  if (!candidate) return null;
  const { counts } = candidate;
  const runsIn = counts.runs_in ?? 0;
  const bad = (counts.runs_failed ?? 0) > 0 || (counts.verdicts?.regressed ?? 0) > 0;
  return {
    value: `${runsIn}/${counts.runs_wanted}`,
    tone: bad ? "danger" : candidate.stalled ? "warning" : "neutral",
    title: bad
      ? "A run failed or came out worse."
      : candidate.stalled
        ? "No new run for a while."
        : `${runsIn} of ${counts.runs_wanted} runs in.`,
  };
}

/** Null while reading, when there is no open candidate, or when the read failed. */
export function useCandidateCount(mandateKey: AnyMandateKey | null): RecordTabCount | null {
  const dispatch = useAppDispatch();
  const [count, setCount] = useState<{ key: string; count: RecordTabCount | null } | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!mandateKey) return;
    return onCandidatesChanged(mandateKey, () => setReads((n) => n + 1));
  }, [mandateKey]);

  useEffect(() => {
    if (!mandateKey) return;
    let cancelled = false;
    fetchLiveCandidates(dispatch, mandateKey).then(
      (answer) => {
        if (!cancelled) setCount({ key: mandateKey, count: candidateTabCount(answer.active) });
      },
      (error: unknown) => {
        // The badge is a convenience; the tab body says the failure in full.
        if (!cancelled) setCount({ key: mandateKey, count: null });
        console.warn("[mandate candidates] tab count unread:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey, reads]);

  // Held with its key, so a window switching mandates never shows the
  // previous one's badge.
  return count && count.key === mandateKey ? count.count : null;
}
