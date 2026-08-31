/**
 * The Lulu print mirrors validate Lulu's REAL payloads — nulls included.
 *
 * Both fixtures below are the canonical examples declared on the Python-owned
 * models (`aidream/aidream/kinds/print_lulu.py`, `@kind(... example=...)`),
 * copied verbatim: the quote is a live sandbox call (US Letter, 100pp, qty 1,
 * MAIL to DC) and the job is a freshly created one — `costs: null` and
 * `estimated_shipping_dates: null`, which is a REAL state (Lulu has not priced
 * or scheduled it yet), not an error.
 *
 * That job is the payload that rendered as the `generic_structured` key/value
 * dump on `/shapes/lulu_print_job` while the parser ignored `nullable` on
 * object-shaped fields (FOUND_DEFECTS.md 2026-08-30, fixed in
 * @ai-matrx/content-ir 0.10.2). The mirrors now declare the true
 * `inline_object` shapes again instead of the `json` workaround.
 */

import {
  createKindStreamParser,
  type KindSchema,
  type KindStreamEvent,
} from "@ai-matrx/content-ir";
import { PRINT_LULU_KIND_DEFINITIONS } from "../kinds/print-kinds";

const SCHEMAS: Record<string, KindSchema> = {};
for (const definition of PRINT_LULU_KIND_DEFINITIONS) {
  if (definition.schema) SCHEMAS[definition.kind] = definition.schema;
}

function parse(value: unknown): KindStreamEvent[] {
  const events: KindStreamEvent[] = [];
  const parser = createKindStreamParser({
    schemas: SCHEMAS,
    onEvent: (event) => events.push(event),
  });
  parser.push(JSON.stringify(value));
  parser.end();
  return events;
}

function resolves(value: unknown, kind: string): void {
  const events = parse(value);
  expect(
    events
      .filter((event) => event.type === "raw_object")
      .map((event) => (event.type === "raw_object" ? event.reason : "")),
  ).toEqual([]);
  expect(events.find((event) => event.type === "complete")).toMatchObject({
    kind,
  });
}

const PRICED_QUOTE = {
  __kind: "lulu_print_cost_calculation",
  provider: "lulu",
  currency: "USD",
  line_item_costs: [
    {
      quantity: 1,
      cost_excl_discounts: "6.01",
      unit_tier_cost: "6.01",
      tax_rate: "0.06",
      discounts: [],
      total_cost_excl_discounts: "6.01",
      total_cost_excl_tax: "6.01",
      total_cost_incl_tax: "6.37",
      total_tax: "0.36",
    },
  ],
  shipping_cost: {
    total_cost_excl_tax: "5.69",
    total_cost_incl_tax: "6.04",
    total_tax: "0.35",
    tax_rate: "0.06",
  },
  fulfillment_cost: {
    total_cost_excl_tax: "0.75",
    total_cost_incl_tax: "0.80",
    total_tax: "0.05",
    tax_rate: "0.06",
  },
  fees: [],
  total_cost_excl_tax: "12.45",
  total_cost_incl_tax: "13.21",
  total_discount_amount: "0.00",
  total_tax: "0.76",
};

const NEW_JOB = {
  __kind: "lulu_print_job",
  provider: "lulu",
  id: 328444,
  order_id: "LU-328444",
  external_id: null,
  contact_email: "print@example.com",
  shipping_level: "MAIL",
  production_delay: 120,
  production_due_time: "2026-08-30T14:00:00Z",
  tax_country: "US",
  status: { name: "CREATED", changed: "2026-08-30T12:00:00Z", message: null },
  line_items: [
    {
      id: 1,
      title: "Field Guide",
      external_id: null,
      pod_package_id: "0850X1100BWSTDPB060UW444MXX",
      quantity: 1,
      page_count: 100,
      printable_id: null,
      status: { name: "UNMAPPED", messages: {} },
      tracking_id: null,
      tracking_urls: null,
    },
  ],
  costs: null,
  estimated_shipping_dates: null,
  date_created: "2026-08-30T12:00:00Z",
  date_modified: "2026-08-30T12:00:00Z",
};

describe("lulu print mirrors accept the canonical Lulu payloads", () => {
  it("a priced quote — both cost buckets present", () => {
    resolves(PRICED_QUOTE, "lulu_print_cost_calculation");
  });

  it("an UNPRICED quote — the buckets are null, which is a real state", () => {
    resolves(
      {
        ...PRICED_QUOTE,
        line_item_costs: null,
        shipping_cost: null,
        fulfillment_cost: null,
      },
      "lulu_print_cost_calculation",
    );
  });

  it("a freshly created job — costs and shipping dates are null (the live repro)", () => {
    resolves(NEW_JOB, "lulu_print_job");
  });

  it("a priced, scheduled job — the same fields carry their real objects", () => {
    resolves(
      {
        ...NEW_JOB,
        status: { name: "IN_PRODUCTION", changed: null, message: null },
        costs: {
          line_item_costs: null,
          shipping_cost: {
            total_cost_excl_tax: "5.69",
            total_cost_incl_tax: "6.04",
            total_tax: "0.35",
            tax_rate: "0.06",
          },
          total_cost_excl_tax: "12.45",
          total_cost_incl_tax: "13.21",
          total_tax: "0.76",
        },
        estimated_shipping_dates: {
          dispatch_min: "2026-09-01T00:00:00Z",
          dispatch_max: "2026-09-03T00:00:00Z",
          arrival_min: "2026-09-05T00:00:00Z",
          arrival_max: "2026-09-09T00:00:00Z",
        },
      },
      "lulu_print_job",
    );
  });

  it("still refuses a job whose status object lacks its required name", () => {
    const events = parse({ ...NEW_JOB, status: { changed: null } });
    expect(events.find((event) => event.type === "raw_object")).toMatchObject({
      cause: "invalid",
    });
  });
});
