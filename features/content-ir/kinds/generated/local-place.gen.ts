/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "local_place" (schema version 5), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types local_place
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

export interface DayHours {
  /**
   * Full lowercase day name, e.g. 'monday'.
   */
  day: string;
  /**
   * Opening time, 24h 'HH:MM'.
   */
  opens: string;
  /**
   * Closing time, 24h 'HH:MM'.
   */
  closes: string;
}

export interface OpeningHours {
  /**
   * Full weekly schedule when known.
   */
  days?: DayHours[];
  /**
   * Today's hours when the source reports them.
   */
  today?: DayHours | null;
  __kind?: "opening_hours";
}

export interface PostalAddress {
  city?: string | null;
  __kind?: "postal_address";
  region?: string | null;
  street?: string | null;
  country?: string | null;
  /**
   * The full display address string.
   */
  display: string;
  postal_code?: string | null;
}

export interface GeoCoordinates {
  __kind?: "geo_coordinates";
  latitude: number;
  longitude: number;
}

export interface LocalPlace {
  name: string;
  hours?: OpeningHours | null;
  phone?: string | null;
  __kind?: "local_place";
  rating?: Rating | null;
  source: string;
  address?: PostalAddress | null;
  cuisine?: string[];
  /**
   * Provider's canonical place handle.
   */
  place_id?: string | null;
  position: number;
  timezone?: string | null;
  thumbnail?: string | null;
  categories?: string[];
  /**
   * Verbatim hours string when structure was not available.
   */
  hours_text?: string | null;
  /**
   * Verbatim provider price convention ('$$', '$1-10') — deliberately untranslated.
   */
  price_text?: string | null;
  coordinates?: GeoCoordinates | null;
  description?: string | null;
  website_url?: string | null;
}
