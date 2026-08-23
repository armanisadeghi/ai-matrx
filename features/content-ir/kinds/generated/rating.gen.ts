/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "rating" (schema version 6), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types rating
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
  __kind: "rating";
  /**
   * Top of the rating scale.
   */
  best_possible?: number;
}
