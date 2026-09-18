/**
 * The topic panel's ONE fixed AI job: `seo.topic_curation` ("Topical Map Topic
 * Agent"), declared in aidream `d2b14cee` (CONTRACTS.md §6).
 *
 * 🚨 A STRING LITERAL, ON PURPOSE AND FOR NOW. The declared key set ships in
 * `@ai-matrx/agents` (`MANDATE_KEYS`), and this key is not in the installed
 * package yet — publishing needs the `npm/agents/v*` tag, a release action.
 * Until it republishes the literal is carried in
 * `scripts/mandate-keys-allowlist.json` with that reason, and the coordinator
 * swaps it for `MANDATE_KEYS.seo__topic_curation` on adoption. Every reader of
 * the key in this lane imports it from HERE, so that swap is one line.
 */
import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";

export const TOPIC_CURATION_MANDATE_KEY = dbAuthoredMandateKey("seo.topic_curation");

/** The surface every host of the panel belongs to (the manifest's `surfaceName`). */
export const TOPICAL_MAP_SURFACE_NAME = "matrx-user/marketing-topical-map";
