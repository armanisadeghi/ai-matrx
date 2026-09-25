/**
 * GATES-TAIL (VERIFIER-21 #7): opening a table given from outside asked `platform.knob_index`
 * for the table's organization and was refused 403, twice per open. An organization's knobs are
 * its members' to read; she reads the relation option as OFF without asking. Red on the pre-fix.
 */
const fetchKnobIndex = jest.fn(async () => [
  { feature: "data_tables.relation", key: "relation_columns_enabled", effective_value: true },
]);
jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobIndex: (a: unknown) => fetchKnobIndex(a) }));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({ ok: true, data: { memberships: [{ containerId: "org-mine" }] } }),
  },
}));

import { relationColumnsEnabledFor } from "./relation-knob";

it("does not ask the knobs of an organization she is not in", async () => {
  await expect(relationColumnsEnabledFor("org-not-mine")).resolves.toBe(false);
  expect(fetchKnobIndex).not.toHaveBeenCalled();
});

it("reads her own organization's knob as before", async () => {
  await expect(relationColumnsEnabledFor("org-mine")).resolves.toBe(true);
  expect(fetchKnobIndex).toHaveBeenCalledTimes(1);
});
