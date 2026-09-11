"use client";

// features/mandates/provenance.ts
//
// PROVENANCE & USAGE — the client seam for the report that answers, on the
// screen itself, the question an owner asked out loud on 2026-09-11 about three
// Mandates the list had flagged:
//
//   "Are these actually used anywhere? I don't want to fix these until
//    something tells me inside of the system exactly what random unknown
//    mandates like this are from and where they're used."
//
// Four facts, one fetch, every rung:
//
//   Origin      what wrote the row — code, a migration, or a person — and when
//   Offered on  the surfaces a HUMAN can launch it from today, as links
//   Runs        how many times it has ever run, when last, and a link to them
//   Held by     every rung of the ladder that carries it, Holder NAMED
//
// 🚨 SERVER TRUTH, NEVER RE-DERIVED HERE. Every sentence on the panel is built
// by `aidream/services/mandates/provenance.py` and printed verbatim. A second
// client-side rule beside the server's is the exact failure class the coverage
// feature was built to avoid (see ./coverage.ts) — and it is worse here,
// because the shortcut test is `mandate.vw_shortcut`'s own three-way join and a
// client that guessed it would send a person to a list the shortcut is not on.
//
// 🚨 AND A COUNT THAT COULD NOT BE READ IS NOT ZERO. The payload answers `null`
// for a ledger that did not respond. "Nothing ever ran this" and "we could not
// count" look identical on a screen and a person acts differently on each, so
// the panel renders them differently and ./workspace/__tests__ pins that.

import { useEffect, useState } from "react";
import type { AppDispatch } from "@/lib/redux/store";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";

export type MandateProvenanceReport =
  components["schemas"]["MandateProvenanceReport"];
export type MandateOriginFacts = components["schemas"]["MandateOriginFacts"];
export type MandateOfferRow = components["schemas"]["MandateOfferRow"];
export type MandateUsageFacts = components["schemas"]["MandateUsageFacts"];
export type MandateHolderRow = components["schemas"]["MandateHolderRow"];

/** The heading this row set wears, in one place. */
export const PROVENANCE_SECTION_TITLE = "Provenance & usage";

/**
 * How each origin reads as a LABEL beside the sentence. The sentence is the
 * server's; this is only the short word the row leads with, and `migration` is
 * spelled out because it is the one a reader would otherwise mistake for a
 * person's work (207 shortcut Mandates carry `origin='user'` and were written
 * by a migration).
 */
export const ORIGIN_LABELS: Record<MandateOriginFacts["kind"], string> = {
  code: "Declared in code",
  migration: "Migrated from an older table",
  user: "Created by a person",
  unknown: "Not recorded",
};

export async function fetchMandateProvenance(
  dispatch: AppDispatch,
  mandateKey: string,
): Promise<MandateProvenanceReport> {
  const response = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/provenance",
      method: "GET",
      pathParams: { mandate_key: mandateKey },
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isProvenanceReport(response.data)) {
    throw new Error(
      "The server did not return a provenance report, so where this Mandate " +
        "came from and whether anything runs it is unknown, not clean.",
    );
  }
  return response.data;
}

function isProvenanceReport(value: unknown): value is MandateProvenanceReport {
  if (typeof value !== "object" || value === null) return false;
  const body = value as {
    mandate_key?: unknown;
    origin?: unknown;
    usage?: unknown;
    offered_on?: unknown;
    held_by?: unknown;
  };
  if (typeof body.mandate_key !== "string") return false;
  if (typeof body.origin !== "object" || body.origin === null) return false;
  if (typeof body.usage !== "object" || body.usage === null) return false;
  if (!Array.isArray(body.offered_on)) return false;
  if (!Array.isArray(body.held_by)) return false;
  return true;
}

/**
 * The ONE fetch the panel makes. Waits for the organization the transport
 * itself requires on every request (the same reason `useMandateCoverageStates`
 * waits) rather than firing at `null` and freezing on a pre-flight error.
 */
export function useMandateProvenance(mandateKey: string | null): {
  report: MandateProvenanceReport | null;
  loading: boolean;
  /** Verbatim server failure — a panel that vanishes on error reads as "fine". */
  error: string | null;
} {
  const dispatch = useAppDispatch();
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const [report, setReport] = useState<MandateProvenanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mandateKey || !activeOrganizationId) return;
    let cancelled = false;
    setLoading(true);
    void fetchMandateProvenance(dispatch, mandateKey)
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReport(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey, activeOrganizationId]);

  return { report, loading, error };
}

/**
 * WHAT THE "Runs" ROW SAYS, as a value — decided here and pinned by
 * `workspace/__tests__/mandate-provenance-panel.test.ts` rather than living
 * inside JSX, because every one of these is a way to get honesty wrong.
 */
export type RunsReading =
  | { kind: "unknown"; text: string }
  | { kind: "never"; text: string }
  | { kind: "ran"; text: string; count: number };

export function runsReading(usage: MandateUsageFacts): RunsReading {
  const conversations = usage.conversation_count;
  const requests = usage.request_count;
  if (conversations == null && requests == null) {
    return {
      kind: "unknown",
      text: "Could not be counted just now — which is not the same as never.",
    };
  }
  // 🚨 A RUN IS A REQUEST, NOT A CONVERSATION. One conversation carries many
  // runs, and a Mandate can run with no conversation of its own — so reading
  // the conversation count alone renders "0 times" for a job that really ran.
  // The larger of the two ledgers wins, exactly as the server's own sentence
  // does (`run_count_of` in aidream/services/mandates/provenance.py), so the
  // number on the row and the sentence under it can never disagree.
  const count = Math.max(conversations ?? 0, requests ?? 0);
  if (count === 0) {
    return { kind: "never", text: "Never — no run has ever been recorded." };
  }
  const times = count === 1 ? "Once" : `${count} times`;
  const when = usage.last_run_at
    ? `, last on ${usage.last_run_at.slice(0, 10)}`
    : "";
  return { kind: "ran", text: `${times}${when}`, count };
}
