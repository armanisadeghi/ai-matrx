"use client";

// features/mandates/catalogue.ts
//
// THE CODE DECLARATION of every mandate — `declare_mandate(...)` in aidream,
// reaching this repo through exactly ONE door: `GET /mandates`. No surface
// substitutes `description` for a goal and calls that the goal.
//
// 🚨 THIS IS THE GOAL'S FALLBACK, NOT THE GOAL (corrected 2026-09-11, FIX-Q9).
// The comment that used to stand here — "`agent.mandate` has no `goal` column…
// READ-ONLY here… there is no write path on the server" — was true on
// 2026-08-28 and is false now: `goal` is a promoted column post-cutover and
// `PATCH /mandates/{key}/goal` writes it. The STORED goal is the truth and this
// catalogue is the fallback for a row the DB read missed. Resolve the two in
// ONE place — `./goal` (`resolveMandateGoal`) — never here, and never by
// reading this alone.
//
// One in-flight request is shared by every caller — the console asks for the
// whole catalogue while three drawers ask for their own row.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";

export type MandateCatalogueEntry =
  components["schemas"]["MandateSummaryResponse"];

/** mandate_key → the code declaration behind it. */
export type MandateCatalogue = Readonly<Record<string, MandateCatalogueEntry>>;

function isCatalogueBody(
  value: unknown,
): value is { mandates: MandateCatalogueEntry[] } {
  if (typeof value !== "object" || value === null) return false;
  const mandates = (value as { mandates?: unknown }).mandates;
  return (
    Array.isArray(mandates) &&
    mandates.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { mandate_key?: unknown }).mandate_key === "string",
    )
  );
}

let inflight: Promise<MandateCatalogue> | null = null;
let cached: MandateCatalogue | null = null;

/**
 * Every declared mandate, keyed by `mandate_key`. Cached for the page's life —
 * declarations only change when aidream redeploys, so a refetch per drawer
 * would be pure waste. `refresh: true` forces the round trip.
 */
export async function fetchMandateCatalogue(
  dispatch: AppDispatch,
  options: { refresh?: boolean } = {},
): Promise<MandateCatalogue> {
  if (options.refresh) {
    cached = null;
    inflight = null;
  }
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await dispatch(callApi({ path: "/mandates", method: "GET" }));
    if (response.error) throw new Error(response.error.message);
    // Ingress validation: the shape is the generated contract, but a wrong
    // deploy answering this path must fail loudly, not render blank goals.
    if (!isCatalogueBody(response.data)) {
      throw new Error(
        "GET /mandates did not return a mandate catalogue — the goal of every mandate is unknown until it does.",
      );
    }
    const mandates = response.data.mandates;
    const byKey: Record<string, MandateCatalogueEntry> = {};
    for (const entry of mandates) byKey[entry.mandate_key] = entry;
    cached = byKey;
    return byKey;
  })();

  try {
    return await inflight;
  } catch (error) {
    inflight = null;
    throw error;
  }
}

/**
 * SYNCHRONOUS read of one declaration from the page-lifetime catalogue —
 * `null` when the catalogue was never fetched (or holds no such key). Never
 * triggers a request: this is for callers that can use the answer when it is
 * already free and must not pay for it otherwise (the structured-output write
 * guard, `features/agents/redux/execution-system/utils/output-contract-guard.ts`).
 * A caller that MUST have the answer awaits `fetchMandateCatalogue`.
 */
export function peekMandateCatalogueEntry(
  mandateKey: string,
): MandateCatalogueEntry | null {
  return cached?.[mandateKey] ?? null;
}

/**
 * DROP THE PAGE-LIFETIME CATALOGUE.
 *
 * 🚨 A GOAL WRITE STALES THIS CACHE (FIX-Q9, 2026-09-11). `cached` lives for
 * the life of the page because declarations only change when aidream redeploys
 * — which stopped being true when `PATCH /mandates/{key}/goal` shipped. A goal
 * edited in-session left this cache holding the old text (or no entry at all
 * for a UI-created Mandate), so the admin goal pane printed a stale goal, or
 * *"No goal declared"*, until a full reload. `invalidateMandateCache` in
 * `./service` now calls this, so every goal/mandate write clears it.
 */
export function invalidateMandateCatalogueCache(): void {
  cached = null;
  inflight = null;
}

/** Test/hot-reload seam — same drop, named for tests. */
export function resetMandateCatalogueCache(): void {
  invalidateMandateCatalogueCache();
}
