/**
 * Compiled parser mirrors for the Python-owned Lulu print kind family
 * (`print_lulu`).
 *
 * Source of truth: `aidream/aidream/kinds/print_lulu.py` (registered through
 * the `@kind` SDK). The registry-generated payload types live in
 * `kinds/generated/kinds.generated.ts`; these schemas exist only so a streaming
 * `__kind` payload reaches the same canonical renderer before the
 * database-backed registry warm completes.
 *
 * Every money field is a decimal STRING on purpose — see the renderers in
 * `components/mardown-display/blocks/print-kinds/print-kind-blocks.tsx`.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

const schemas: KindSchema[] = [
  {
    kind: "lulu_print_cost_calculation",
    fields: {
      provider: { type: "string" },
      currency: { type: "string", nullable: true },
      line_item_costs: { type: "json[]", nullable: true },
      // `json`, not a nullable `inline_object`: the mirror's validator honours
      // `nullable` for scalars and `json[]` but NOT for `inline_object` /
      // `object` / `record` — a genuinely-null bucket would degrade the whole
      // instance to the generic viewer. `null` is a real state for every one of
      // these (Lulu has not priced the basket yet). Class defect + the 23 other
      // sites: FOUND_DEFECTS.md.
      shipping_cost: { type: "json", nullable: true },
      fulfillment_cost: { type: "json", nullable: true },
      fees: { type: "json[]" },
      total_cost_excl_tax: { type: "string", nullable: true },
      total_cost_incl_tax: { type: "string", nullable: true },
      total_discount_amount: { type: "string", nullable: true },
      total_tax: { type: "string", nullable: true },
    },
  },
  {
    kind: "lulu_shipping_options",
    fields: {
      provider: { type: "string" },
      country_code: { type: "string", required: true },
      state_code: { type: "string", nullable: true },
      currency: { type: "string" },
      options: { type: "json[]" },
    },
  },
  {
    kind: "lulu_cover_dimensions",
    fields: {
      provider: { type: "string" },
      width: { type: "string", required: true },
      height: { type: "string", required: true },
      unit: { type: "string", required: true },
    },
  },
  {
    kind: "lulu_print_product_matches",
    fields: {
      provider: { type: "string" },
      match_count: { type: "number", required: true },
      returned_count: { type: "number", required: true },
      truncated: { type: "boolean", required: true },
      catalog_source: { type: "string", required: true },
      catalog_retrieved_at: { type: "string", required: true },
      products: { type: "json[]" },
    },
  },
  {
    kind: "lulu_print_job",
    fields: {
      provider: { type: "string" },
      id: { type: "number", nullable: true },
      order_id: { type: "string", nullable: true },
      external_id: { type: "string", nullable: true },
      contact_email: { type: "string", nullable: true },
      shipping_level: { type: "string", nullable: true },
      production_delay: { type: "number", nullable: true },
      production_due_time: { type: "string", nullable: true },
      tax_country: { type: "string", nullable: true },
      // `json` for the same reason as the quote's buckets above — a print job
      // legitimately carries `costs: null` and `estimated_shipping_dates: null`
      // until Lulu prices and schedules it, and a nullable `inline_object`
      // would fail that instance outright.
      status: { type: "json", nullable: true },
      line_items: { type: "json[]" },
      costs: { type: "json", nullable: true },
      estimated_shipping_dates: { type: "json", nullable: true },
      date_created: { type: "string", nullable: true },
      date_modified: { type: "string", nullable: true },
    },
  },
];

export const PRINT_LULU_KIND_DEFINITIONS: KindDefinition[] = schemas.map(
  (schema): KindDefinition => ({
    kind: schema.kind,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: schema.kind,
    toLegacyServerData: makeSearchKindBridge(schema.kind),
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema,
  }),
);
