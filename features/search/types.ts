/**
 * Search — the shared types for AI Matrx Search (`/search`).
 *
 * The wire shape is aidream's `SearchKindsResultEvent`
 * (`aidream/services/search_kinds/service.py`): a `web_search_results` kind
 * instance plus the adapter's translation report. Nothing here re-declares
 * the kind itself — the kind's shape is owned by the registry and rendered by
 * its registered components; this surface only carries it.
 */

/** Providers the public surface may ask for. Brave is the only public one today. */
export type SearchProvider = "brave";

/** Unknown provider keys the translation adapter could not claim, per section. */
export interface SearchTranslationReport {
  provider: string;
  unknownSections: { section: string; keys: string[] }[];
}

export interface SearchOutcome {
  /** The `web_search_results` kind instance, exactly as the server emitted it. */
  result: Record<string, unknown>;
  translation: SearchTranslationReport | null;
}

export type SearchPhase = "idle" | "searching" | "done" | "error";
