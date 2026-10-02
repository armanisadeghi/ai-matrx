/**
 * R22 (Matrx Alchemy ALC-14): a binding may name an ITEM value by its dotted key
 * ("table_row.status"). The clicked item's values arrive under the reserved scope
 * key "__item" ({ itemType, identity, values }); a bare key still reads the
 * screen value of that name, and an item key never falls back to it.
 */
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { resolveValueMappings } from "@/features/surfaces/utils/value-mapping-resolver";

const variables = [{ name: "row_status" }, { name: "page_status" }] as unknown as VariableDefinition[];

const scope = {
  status: "screen-level status",
  __item: {
    itemType: "table_row",
    identity: { table_id: "t1", row_id: "r7" },
    values: { status: "Needs pickup" },
  },
} as unknown as ApplicationScope;

describe("value mappings accept dotted item keys", () => {
  it("reads an item value from __item and a bare key from the screen", () => {
    const result = resolveValueMappings(
      scope,
      {
        row_status: { mapType: "surface_value", target: "table_row.status", required: true },
        page_status: { mapType: "surface_value", target: "status" },
      },
      variables,
      [],
      { autoNameMatch: false },
    );
    expect(result.errors).toEqual([]);
    expect(result.variableValues).toEqual({
      row_status: "Needs pickup",
      page_status: "screen-level status",
    });
  });

  it("never lets an item key fall back to the screen value, or read another item type", () => {
    const result = resolveValueMappings(
      scope,
      { row_status: { mapType: "surface_value", target: "chat_message.status", required: true } },
      variables,
      [],
      { autoNameMatch: false },
    );
    expect(result.variableValues).toEqual({});
    expect(result.errors).toEqual([
      'Required surface value "chat_message.status" missing for target "row_status".',
    ]);
  });
});

describe("binding editors list item values under their dotted key", () => {
  it("qualifies a DB value row by its item_type", async () => {
    const { bindingKeyOfValueRow } = await import("@/features/surfaces/services/surfaces.service");
    expect(bindingKeyOfValueRow({ name: "status", item_type: "table_row" })).toBe("table_row.status");
    expect(bindingKeyOfValueRow({ name: "status", item_type: "" })).toBe("status");
    expect(bindingKeyOfValueRow({ name: "status" })).toBe("status");
  });
});
