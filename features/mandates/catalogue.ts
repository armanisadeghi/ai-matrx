"use client";

// features/mandates/catalogue.ts
//
// THE GOAL LIVES IN CODE. `agent.mandate` has no `goal` column — the goal is a
// field of the aidream code declaration (`declare_mandate(..., goal=...)`) and
// reaches this repo through exactly ONE door: `GET /mandates`, the declaration
// catalogue. Every surface that shows a mandate's goal reads it from here; no
// surface substitutes `description` for it and calls that the goal.
//
// Because it is code, it is READ-ONLY here. There is no write path on the
// server (verified 2026-08-28 against aidream services/mandates: the pre-cutover
// `mandate_write_payload` does not even carry the key). Surfaces say so plainly
// rather than rendering an editor that cannot save.
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

/** Test/hot-reload seam — never called by product code. */
export function resetMandateCatalogueCache(): void {
  cached = null;
  inflight = null;
}
