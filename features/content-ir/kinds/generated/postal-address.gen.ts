/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "postal_address" (schema version 4), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types postal_address
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

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
