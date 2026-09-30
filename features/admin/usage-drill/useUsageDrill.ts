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

export const USAGE_SOURCE: DrillSource = { kind: "entity", token: "ai_usage" };
/** The Dimensions whose values are ids the names door reads. */
export const NAMED_DIMENSIONS = ["organization", "person", "agent"] as const;
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
    emptyLabel: dimension === "person" ? "No person" : "None",
    resolve: async (ids) => {
      const { data, error } = await supabase
        .schema("platform")
        .rpc("ai_usage_names", { p_organization_id: organizationId, p_ids: { organization: [], person: [], agent: [], [dimension]: ids } });
      if (error) return { ok: false, message: `The names behind these groups could not be read (${error.message}), so they show as ids.` };
      return { ok: true, names: stringMap(isRecord(data) ? data[dimension] : null) };
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
