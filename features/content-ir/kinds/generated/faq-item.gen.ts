/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "faq_item" (schema version 3), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types faq_item
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

/**
 * Merged with the pre-existing `faq_item` kind (seo_package.faq nests it):
 * `source`/`position` are OPTIONAL here because authored FAQs have neither —
 * the search adapters always fill both.
 */
export interface FaqItem {
  __kind?: "faq_item";
  /**
   * Inline answer when the provider ships one (Brave does; Google PAA does not).
   */
  answer?: string | null;
  source?: string | null;
  favicon?: string | null;
  position?: number | null;
  question: string;
  source_url?: string | null;
  source_title?: string | null;
}
