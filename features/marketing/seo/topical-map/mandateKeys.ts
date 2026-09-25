/**
 * features/marketing/seo/topical-map/mandateKeys.ts — the ONE literal for the
 * in-map agents until `@ai-matrx/agents` republishes (CONTRACTS.md §6).
 *
 * `seo.map_curation` ("Topical Map Agent") was declared in aidream `d2b14cee`
 * on this branch; its generated client key is `seo__map_curation`, but the
 * package on npm predates it, so `MANDATE_KEYS.seo__map_curation` does not
 * exist yet. The amendment's rule: ONE string literal, allowlisted in
 * `scripts/mandate-keys-allowlist.json` with the reason, and the coordinator
 * removes the row and swaps this constant for `MANDATE_KEYS` on adoption.
 *
 * Every consumer imports the constant — the manifest's `agentRole`, the map
 * window's and the canvas body's "Ask the map" launchers — so the literal
 * exists in exactly one file and one allowlist row.
 */

/** The map-wide agent: reads and edits the whole map through the `topical_map` tool. */
import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

export const MAP_CURATION_MANDATE_KEY = dbAuthoredMandateKey(MANDATE_KEYS.seo__map_curation);

/** The surface the mandate window is opened from (stamped onto notes written there). */
export const TOPICAL_MAP_SURFACE_NAME = "matrx-user/marketing-topical-map";
