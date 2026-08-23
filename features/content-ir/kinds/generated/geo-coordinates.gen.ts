/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "geo_coordinates" (schema version 6), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types geo_coordinates
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface GeoCoordinates {
  __kind: "geo_coordinates";
  latitude: number;
  longitude: number;
}
