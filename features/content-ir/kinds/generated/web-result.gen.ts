/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "web_result" (schema version 6), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types web_result
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface Rating {
  /**
   * Number of ratings/reviews behind the value.
   */
  count?: number | null;
  /**
   * The rating value on the scale [0, best_possible].
   */
  value: number;
  __kind?: "rating";
  /**
   * Top of the rating scale.
   */
  best_possible?: number;
}

export interface SiteLink {
  url: string;
  title: string;
}

export interface WebResult {
  url: string;
  title: string;
  __kind?: "web_result";
  author?: string | null;
  rating?: Rating | null;
  /**
   * Provider that returned this result, e.g. 'brave' | 'google'.
   */
  source: string;
  favicon?: string | null;
  is_live?: boolean | null;
  snippet?: string | null;
  /**
   * Provider's verbatim relative age when that is all it gave.
   */
  age_text?: string | null;
  language?: string | null;
  /**
   * 1-based rank. Derived from array order when the provider gives none.
   */
  position: number;
  publisher?: string | null;
  /**
   * Human name of the source site; derived from hostname when absent.
   */
  site_name: string;
  sitelinks?: SiteLink[];
  thumbnail?: string | null;
  /**
   * ISO-8601 date(time); may be approximate.
   */
  published_at?: string | null;
  /**
   * The 'site › path' display form; derived from url when absent.
   */
  displayed_url: string;
  extra_snippets?: string[];
  family_friendly?: boolean | null;
  highlighted_terms?: string[];
  source_description?: string | null;
}
