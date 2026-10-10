/**
 * The scope detail surface's pure rules (`scope-detail-values.ts`): how a cell reads as text for an
 * agent, which items an agent may set from text, and how it names an item.
 * Breaks it catches: an empty cell reported as a value; a structured item (a picklist, a smart
 * input) accepted as plain text; an item named by a slug of another scope's item resolved.
 */
import type { ScopeContextRow } from "@/features/scopes/redux/scopeContextView";
import { scopeValueText, settableByText, valueFor } from "../scope-detail-values";

const row = (over: Partial<ScopeContextRow>): ScopeContextRow =>
  ({
    item_id: "11111111-1111-4111-8111-111111111111",
    key: "primary_contact",
    slug: "primary-contact",
    display_name: "Primary contact",
    value_type: "short_text" as never,
    has_value: false,
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_json: null,
    value_date: null,
    value_timestamp: null,
    value_time: null,
    value_document_url: null,
    version: null,
    updated_at: null,
    ...over,
  }) as ScopeContextRow;

describe("scope detail surface values", () => {
  it("reads an empty cell as null and a filled one as its text", () => {
    expect(scopeValueText(row({}))).toBeNull();
    expect(scopeValueText(row({ has_value: true, value_text: "Luis Rivera, 949 555 0142" }))).toBe("Luis Rivera, 949 555 0142");
    expect(scopeValueText(row({ has_value: true, value_number: 4200 }))).toBe("4200");
    expect(scopeValueText(row({ has_value: true, value_boolean: false }))).toBe("false");
  });

  it("sets only text-shaped items from text", () => {
    expect(settableByText(row({ value_type: "short_text" as never }))).toBe(true);
    expect(settableByText(row({ value_type: "number" as never }))).toBe(true);
    expect(settableByText(row({ value_type: "reference" as never }))).toBe(false);
    expect(settableByText({ value_type: "short_text" as never, custom_component: { type: "picker" } as never })).toBe(false);
  });

  it("finds an item by id first, then by slug or key, and never by nothing", () => {
    const rows = [row({}), row({ item_id: "22222222-2222-4222-8222-222222222222", key: "license_no", slug: "license-number" })];
    expect(valueFor(rows, "22222222-2222-4222-8222-222222222222", undefined)?.key).toBe("license_no");
    expect(valueFor(rows, undefined, "license-number")?.key).toBe("license_no");
    expect(valueFor(rows, undefined, "primary_contact")?.key).toBe("primary_contact");
    expect(valueFor(rows, "33333333-3333-4333-8333-333333333333", "license-number")).toBeNull();
    expect(valueFor(rows, undefined, undefined)).toBeNull();
  });
});
