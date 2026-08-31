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

/**
 * Lulu's `LuluCostGroup` — one cost bucket (shipping & handling, or
 * fulfillment). Declared once because the quote carries two of them and a print
 * job's `costs` carries a third.
 */
const COST_GROUP = {
  type: "inline_object",
  fields: {
    total_cost_excl_tax: { type: "string", nullable: true },
    total_cost_incl_tax: { type: "string", nullable: true },
    total_tax: { type: "string", nullable: true },
    tax_rate: { type: "string", nullable: true },
  },
} as const satisfies KindSchema["fields"][string];

const schemas: KindSchema[] = [
  {
    kind: "lulu_print_cost_calculation",
    fields: {
      provider: { type: "string" },
      currency: { type: "string", nullable: true },
      line_item_costs: { type: "json[]", nullable: true },
      // `null` is a real state for both buckets — Lulu has not priced the
      // basket yet — and @ai-matrx/content-ir 0.10.2 honours `nullable` on
      // object-shaped fields, so the true shape is declared here.
      shipping_cost: { ...COST_GROUP, nullable: true },
      fulfillment_cost: { ...COST_GROUP, nullable: true },
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
      // A print job legitimately carries `status`, `costs` and
      // `estimated_shipping_dates` as null until Lulu prices and schedules it.
      status: {
        type: "inline_object",
        nullable: true,
        fields: {
          name: { type: "string", required: true },
          changed: { type: "string", nullable: true },
          message: { type: "string", nullable: true },
        },
      },
      line_items: { type: "json[]" },
      costs: {
        type: "inline_object",
        nullable: true,
        fields: {
          line_item_costs: { type: "json[]", nullable: true },
          shipping_cost: { ...COST_GROUP, nullable: true },
          total_cost_excl_tax: { type: "string", nullable: true },
          total_cost_incl_tax: { type: "string", nullable: true },
          total_tax: { type: "string", nullable: true },
        },
      },
      estimated_shipping_dates: {
        type: "inline_object",
        nullable: true,
        fields: {
          dispatch_min: { type: "string", nullable: true },
          dispatch_max: { type: "string", nullable: true },
          arrival_min: { type: "string", nullable: true },
          arrival_max: { type: "string", nullable: true },
        },
      },
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
