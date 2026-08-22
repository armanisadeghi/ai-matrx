/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "entity_card" (schema version 5), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types entity_card
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

/**
 * One label/value fact (entity cards). HTML converted to text + links.
 */
export interface Fact {
  text: string;
  label: string;
  links?: string[];
}

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

export interface ProfileLink {
  url: string;
  name: string;
  favicon?: string | null;
}

export interface GeoCoordinates {
  __kind?: "geo_coordinates";
  latitude: number;
  longitude: number;
}

export interface EntityCard {
  name: string;
  facts?: Fact[];
  image?: string | null;
  __kind?: "entity_card";
  rating?: Rating | null;
  source: string;
  category?: string | null;
  profiles?: ProfileLink[];
  /**
   * The page the card was built from (e.g. Wikipedia).
   */
  source_url?: string | null;
  coordinates?: GeoCoordinates | null;
  description?: string | null;
  website_url?: string | null;
  long_description?: string | null;
}
