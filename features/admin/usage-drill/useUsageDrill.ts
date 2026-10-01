"use client";

// features/admin/usage-drill/useUsageDrill.ts — WHAT THE USAGE PAGE ADDS TO THE ONE EXPLORER
// (lane DRILL-USAGE-PAGE; since lane DRILL-EXPLORER the asking itself lives in
// components/official/drill-explorer).
//
// Two things only the usage definition `ai_usage` needs:
//   NAMES — its person / organization / agent groups are ids; `platform.ai_usage_names` reads their
//   words (admin-only), one resolver per Dimension.
//   FRESHNESS — the rollup is kept current by the page itself: when the names door says it was last
//   counted more than ten minutes ago the page asks `platform.ai_usage_recount` for the last 48
//   hours once, then every answer is asked again. This holds until the door says `as_of` on every
//   answer (program DRILL-FINISH decision 26), which the explorer then reads instead.

import { useEffect, useRef, useState } from "react";
import type { DrillSource } from "@ai-matrx/records";

import { supabase } from "@/utils/supabase/client";
import type { DrillExplorerFreshness, DrillNameResolver } from "@/components/official/drill-explorer/types";

import { plainWords } from "@/components/official/drill-explorer/dimensionWords";

import { UNNAMED } from "./usageWords";

export const USAGE_SOURCE: DrillSource = { kind: "entity", token: "ai_usage" };
/**
 * The Dimensions whose values are ids the names door reads. `session` is a sign-in session id (the
 * JWT's session_id on usage executions and model calls): it reads "email · signed in <when>", the
 * words the Spend page gave it (VERIFY-DRILL-WAVE2 W2-4; the door's `session` part is
 * migrations/campaign/drilladopt_a_sign_in_session_reads_as_who_and_when.sql). `request` (the Spend
 * page's most expensive requests, on ai_usage_executions) reads "<conversation> · <when> UTC" once the
 * door's `request` part is applied (PROGRESS-DRILL-PRESETS-RETIRE, owner apply); until then every
 * request says it could not be read, never its id.
 */
export const NAMED_DIMENSIONS = ["organization", "person", "agent", "session", "request", "feature"] as const;
/**
 * A FEATURE is a code, not an id (lane DRILL-CLOSE, VERIFY-DRILL-FINAL "raw feature codes"): the door's
 * `feature` part reads it in its registry's words — a mandate as the mandate's own declared name, an
 * agent service as its agent — (migrations/campaign/drillclose_a_feature_code_reads_as_its_registry_words.sql);
 * a code no registry names, or every code before that part is applied, reads in plain words. A code the
 * definition declares (`sch_run`) reads as its declared choice first (dimensionWords.ts).
 */
const PLAIN_WORDS_DIMENSIONS: ReadonlySet<string> = new Set(["feature"]);
const STALE_AFTER_MS = 10 * 60_000;
/** The recount door refuses more than this many days at a time. */
const RECOUNT_MAX_DAYS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

/** The names door, for one Dimension's ids. */
export function usageNameResolver(organizationId: string, dimension: (typeof NAMED_DIMENSIONS)[number]): DrillNameResolver {
  return {
    emptyLabel:
      dimension === "person" ? "No person" : dimension === "agent" ? "No agent" : dimension === "session" ? "No session" : dimension === "request" ? "No request" : dimension === "feature" ? "No feature recorded" : "No organization",
    missingLabel: "Reading the name…",
    unreadLabel: UNNAMED[dimension],
    resolve: async (ids) => {
      const { data, error } = await supabase
        .schema("platform")
        .rpc("ai_usage_names", { p_organization_id: organizationId, p_ids: { organization: [], person: [], agent: [], session: [], request: [], feature: [], [dimension]: ids } });
      // A door that fails (a timeout on many sign-in sessions) names every id "could not be read" — the
      // cell never keeps saying "Reading the name…" after the read is over.
      const unnamed = (id: string) => (PLAIN_WORDS_DIMENSIONS.has(dimension) ? plainWords(id, { code: true }) : UNNAMED[dimension]);
      if (error) return { ok: true, names: Object.fromEntries(ids.map((id) => [id, unnamed(id)])) };
      // Every id asked comes back with words: its name, or — when the door could not name it — a
      // sentence, never the id (VERIFIER-32 F5).
      const found = stringMap(isRecord(data) ? data[dimension] : null);
      return { ok: true, names: Object.fromEntries(ids.map((id) => [id, found[id] ?? unnamed(id)])) };
    },
  };
}

export function usageNameResolvers(organizationId: string): Record<string, DrillNameResolver> {
  return Object.fromEntries(NAMED_DIMENSIONS.map((d) => [d, usageNameResolver(organizationId, d)]));
}

async function readFreshness(organizationId: string): Promise<{ ok: true; countedThrough: string | null } | { ok: false; message: string }> {
  const { data, error } = await supabase.schema("platform").rpc("ai_usage_names", { p_organization_id: organizationId, p_ids: {} });
  if (error) return { ok: false, message: `How fresh the usage is could not be read: ${error.message}` };
  const d = isRecord(data) ? data : {};
  return { ok: true, countedThrough: typeof d.counted_through === "string" ? d.counted_through : null };
}

/** Rebuild the rollup for a window (at most 100 days; the door refuses more in words). */
async function askRecount(organizationId: string, range: { from: string; to: string }): Promise<{ ok: true; countedThrough: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.schema("platform").rpc("ai_usage_recount", { p_organization_id: organizationId, p_from: range.from, p_to: range.to });
  if (error) return { ok: false, message: `The usage could not be recounted: ${error.message}` };
  const d = isRecord(data) ? data : {};
  return { ok: true, countedThrough: typeof d.counted_through === "string" ? d.counted_through : new Date().toISOString() };
}

/** The usage rollup's freshness, kept by the page (recount once when stale; the Recount button). */
export function useUsageFreshness(organizationId: string): DrillExplorerFreshness {
  const [state, setState] = useState<{ countedThrough: string | null; recounting: boolean; error: string | null; version: number }>({
    countedThrough: null,
    recounting: false,
    error: null,
    version: 0,
  });
  const recountedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readFreshness(organizationId).then(async (got) => {
      if (cancelled) return;
      if (!got.ok) {
        setState((s) => ({ ...s, error: got.message }));
        return;
      }
      setState((s) => ({ ...s, countedThrough: got.countedThrough }));
      const age = got.countedThrough ? Date.now() - new Date(got.countedThrough).getTime() : Infinity;
      if (age <= STALE_AFTER_MS || recountedOnce.current) return;
      recountedOnce.current = true;
      setState((s) => ({ ...s, recounting: true, error: null }));
      const done = await askRecount(organizationId, { from: new Date(Date.now() - 48 * 3_600_000).toISOString(), to: new Date().toISOString() });
      if (cancelled) return;
      setState((s) => ({ ...s, recounting: false, ...(done.ok ? { countedThrough: done.countedThrough, version: s.version + 1 } : { error: done.message }) }));
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const recount = (range: { from: string; to: string }) => {
    const from = new Date(Math.max(new Date(range.from).getTime(), Date.now() - RECOUNT_MAX_DAYS * 86_400_000)).toISOString();
    setState((s) => ({ ...s, recounting: true, error: null }));
    void askRecount(organizationId, { from, to: range.to }).then((done) =>
      setState((s) => ({ ...s, recounting: false, ...(done.ok ? { countedThrough: done.countedThrough, version: s.version + 1 } : { error: done.message }) })),
    );
  };

  return {
    countedThrough: state.countedThrough,
    recounting: state.recounting,
    error: state.error,
    version: state.version,
    recount,
    recountTitle: `Count this window again from the ledger (at most ${RECOUNT_MAX_DAYS} days at a time)`,
  };
}
