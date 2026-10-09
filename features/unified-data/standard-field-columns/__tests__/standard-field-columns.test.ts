// features/unified-data/standard-field-columns/__tests__/standard-field-columns.test.ts
//
// The pure half of the generic custom-field column source (lane 7 wave 2, T2.1/T2.2): which
// fields become columns (the field rule), and that every filter, search and sort is a SERVER
// predicate on `custom_fields` — captured from a recorder that chains like PostgREST.

import {
  applyCustomFieldFilters,
  columnIdFor,
  customFieldOrderColumn,
  customFieldSearchClauses,
  customFiltersToTable,
  displayCustomValue,
  keyOfColumnId,
  mergeFieldDefinitions,
  optionsInDeclaredOrder,
  parseCustomFieldFilters,
  splitCustomFilters,
  type StandardFieldColumn,
} from "../standardFieldColumns";
import { applyPartyListPredicates } from "@/features/crm/service";
import { DEFAULT_RECORD_CLASS_FILTER, type PartyListQuery } from "@/features/crm/types";

function recorder() {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "neq", "in", "is", "not", "ilike", "gte", "lte", "gt", "lt", "or"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return { builder, calls };
}

const CLINIC: StandardFieldColumn = {
  key: "preferred_clinic_location",
  label: "Preferred clinic location",
  behavior: "list",
  multi: false,
  isDate: false,
  options: [
    { key: "downtown", label: "Downtown" },
    { key: "westside", label: "Westside" },
  ],
  fieldIds: ["f1"],
};

describe("which custom fields become list columns", () => {
  const defs = [
    { id: "a", key: "preferred_clinic_location", label: "Preferred clinic location", type: "list", sensitivity: "internal" },
    { id: "b", key: "preferred_clinic_location", label: "Clinic", type: "list", sensitivity: "internal" },
    { id: "c", key: "insurance_verified", label: "Insurance verified", type: "boolean", sensitivity: "public" },
    { id: "d", key: "diagnosis_notes", label: "Diagnosis notes", type: "text", sensitivity: "confidential" },
    { id: "e", key: "ssn_last4", label: "SSN", type: "text", sensitivity: "restricted" },
    { id: "f", key: "referral_source", label: "Referral source", type: "relation", sensitivity: "internal" },
    { id: "g", key: "Bad Key;drop", label: "Injected", type: "text", sensitivity: "internal" },
    { id: "h", key: "retired_field", label: "Retired", type: "text", sensitivity: "internal", deleted_at: "2026-10-01" },
  ];

  it("keeps readable, listable fields, one column per key across organizations", () => {
    const merged = mergeFieldDefinitions(
      defs,
      new Map([["a", [{ key: "westside", label: "Westside" }]], ["b", [{ key: "harbor", label: "Harbor" }]]]),
    );
    expect(merged.map((f) => f.key)).toEqual(["preferred_clinic_location", "insurance_verified"]);
    expect(merged[0].fieldIds).toEqual(["a", "b"]);
    expect(merged[0].options.map((o) => o.key)).toEqual(["westside", "harbor"]);
  });

  it("never offers a confidential or restricted field (the field rule)", () => {
    const keys = mergeFieldDefinitions(defs).map((f) => f.key);
    expect(keys).not.toContain("diagnosis_notes");
    expect(keys).not.toContain("ssn_last4");
  });
});

describe("column ids, filter bags and saved views", () => {
  it("round-trips a custom filter through the table state", () => {
    const state = {
      display_name: { kind: "text" as const, value: "Vega" },
      [columnIdFor("preferred_clinic_location")]: { kind: "select" as const, value: "westside", values: ["westside"] },
    };
    const { custom, rest } = splitCustomFilters(state);
    expect(Object.keys(rest)).toEqual(["display_name"]);
    expect(customFiltersToTable(custom)).toEqual({ "cf:preferred_clinic_location": state["cf:preferred_clinic_location"] });
    expect(parseCustomFieldFilters(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });

  it("refuses a column id that is not a field key", () => {
    expect(keyOfColumnId("cf:preferred_clinic_location")).toBe("preferred_clinic_location");
    expect(keyOfColumnId("cf:x,or(id.neq.0)")).toBeNull();
    expect(customFieldOrderColumn("cf:x->>y")).toBeNull();
    expect(customFieldOrderColumn("display_name")).toBeNull();
  });

  it("shows a choice's label for the key the cell holds", () => {
    expect(displayCustomValue(CLINIC, "westside")).toBe("Westside");
    expect(displayCustomValue({ ...CLINIC, behavior: "boolean", options: [] }, true)).toBe("Yes");
  });
});

describe("every custom filter is a server predicate", () => {
  it("Choice = Westside matches the option KEY the cell holds, exactly", () => {
    const { builder, calls } = recorder();
    applyCustomFieldFilters(builder as never, { preferred_clinic_location: { kind: "select", value: "westside", values: ["westside"] } }, [CLINIC]);
    expect(calls).toEqual([{ method: "in", args: ["custom_fields->>preferred_clinic_location", ["westside"]] }]);
  });


  it("a Choice filter of ALL its options is no filter (rows with no value stay)", () => {
    const { builder, calls } = recorder();
    applyCustomFieldFilters(builder as never, { preferred_clinic_location: { kind: "select", value: "downtown", values: ["downtown", "westside"] } }, [CLINIC]);
    expect(calls).toEqual([]);
  });

  it("text contains, has-no-value, numbers and yes/no", () => {
    const { builder, calls } = recorder();
    applyCustomFieldFilters(builder as never, {
      preferred_clinic_location: { kind: "text", value: "Costa Mesa" },
      account_tier: { kind: "select", value: "__none__", values: ["__none__"] },
      visits: { kind: "number", min: 3, max: 10 },
      insurance_verified: { kind: "boolean", value: true },
    });
    expect(calls).toEqual([
      { method: "ilike", args: ["custom_fields->>preferred_clinic_location", "%Costa Mesa%"] },
      { method: "is", args: ["custom_fields->>account_tier", null] },
      { method: "gte", args: ["custom_fields->visits", 3] },
      { method: "lte", args: ["custom_fields->visits", 10] },
      { method: "eq", args: ["custom_fields->>insurance_verified", "true"] },
    ]);
  });

  it("search reaches the words of text and choice fields", () => {
    expect(customFieldSearchClauses([CLINIC], "Costa Mesa")).toEqual([
      "custom_fields->>preferred_clinic_location.ilike.%Costa Mesa%",
    ]);
  });

  it("sorts on the jsonb value", () => {
    expect(customFieldOrderColumn("cf:preferred_clinic_location")).toBe("custom_fields->preferred_clinic_location");
  });
});

describe("the CRM people list's own predicates carry the custom filter and search", () => {
  const query: PartyListQuery = {
    scope: { kind: "mine" },
    orgId: null,
    search: "Costa Mesa",
    kind: "all",
    filters: {
      record_class: DEFAULT_RECORD_CLASS_FILTER,
      custom: { preferred_clinic_location: { kind: "select", value: "westside", values: ["westside"] } },
    },
    page: 1,
    view: "active",
  };

  it("filters server-side and searches the field's words", () => {
    const { builder, calls } = recorder();
    applyPartyListPredicates(builder as never, query, { userId: "u", orgIds: ["o"] } as never, [CLINIC]);
    expect(calls).toContainEqual({ method: "in", args: ["custom_fields->>preferred_clinic_location", ["westside"]] });
    const search = calls.filter((c) => c.method === "or").map((c) => c.args[0] as string);
    expect(search.some((s) => s.includes("custom_fields->>preferred_clinic_location.ilike.%Costa Mesa%"))).toBe(true);
  });
});

describe("optionsInDeclaredOrder — the across door's choices in the order the person declared them", () => {
  it("orders by position, not by jsonb key order, drops retired, unpositioned last", () => {
    // The live shape of custom.choice_options (2026-10-08): keys come back shortest-first.
    const answered = {
      brakes: { label: "Brakes", position: 1 },
      battery: { label: "Battery", position: 2 },
      ac_repair: { label: "AC Repair", position: 6 },
      legacy: { label: "Legacy", retired: true, position: 0 },
      diagnostic: { label: "Diagnostic", position: 4 },
      oil_change: { label: "Oil Change", position: 3 },
      unplaced: { label: "Unplaced", position: null },
      engine_repair: { label: "Engine Repair", position: 5 },
    };
    expect(optionsInDeclaredOrder(answered).map((o) => o.label)).toEqual([
      "Brakes",
      "Battery",
      "Oil Change",
      "Diagnostic",
      "Engine Repair",
      "AC Repair",
      "Unplaced",
    ]);
  });
});
