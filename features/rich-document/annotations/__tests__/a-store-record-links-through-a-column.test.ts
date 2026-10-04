/**
 * CHAIR-UI-STORE item 3 (2026-10-03): "Link a record…" between two store records.
 *
 * Harbor Dental Group: on the Patient "Marcus Ellery" a person picks the appointment "Crown
 * fitting". The store refuses a free record → record edge, so the link goes through a link column:
 *   1. Appointments already has "Patient" (one record) pointing at Patients → the link is written on
 *      the appointment through it (record_update {patient: <Marcus>}), no question asked.
 *   2. The tables share no link column → the plan is a new column on Patients ("Appointments",
 *      many records); writing it declares the relation column, then writes through it.
 *   3. A single link column already holding another record → the plan says it replaces.
 * Breaks: dropping the back-side search (1 becomes a needless new column), writing without
 * field_declare (2 refused by the store), or treating a single column as many (3 silent).
 */
const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let world: { appointmentFields: unknown[]; patientFields: unknown[]; crownDoc: Record<string, unknown> } = {
  appointmentFields: [],
  patientFields: [],
  crownDoc: {},
};

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const PATIENTS = "db8c2af8-88f4-4057-9b20-1f6255ba99d4";
const APPOINTMENTS = "6403de63-00af-4f28-9b4a-bd95d10bdf77";
const MARCUS = "3f6a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CROWN = "4a7b2c3d-5e6f-4a71-9b8c-0d1e2f3a4b5c";
const LENA = "5b8c3d4e-6f7a-4b82-8c9d-1e2f3a4b5c6d";
const NEW_FIELD = "6c9d4e5f-7a8b-4c93-9d0e-2f3a4b5c6d7e";

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === "record_table") return { data: args.p_record_id === MARCUS ? PATIENTS : APPOINTMENTS, error: null };
        if (fn === "applicable_fields") {
          return { data: args.p_table_id === APPOINTMENTS ? world.appointmentFields : world.patientFields, error: null };
        }
        if (fn === "read_records_by_ids") {
          if (args.p_table_id === "11111111-0000-4000-8000-000000000001") {
            return { data: [{ id: PATIENTS, document: { name: "Patients" } }, { id: APPOINTMENTS, document: { name: "Appointments" } }], error: null };
          }
          return { data: [{ id: CROWN, document: world.crownDoc }], error: null };
        }
        if (fn === "field_declare") {
          world.patientFields = [...world.patientFields, { id: NEW_FIELD, data: { key: "appointments", label: "Appointments", type: "relation", relation_target: APPOINTMENTS, multi: true } }];
          return { data: NEW_FIELD, error: null };
        }
        if (fn === "record_update") return { data: 2, error: null };
        return { data: null, error: { message: `unexpected ${fn}` } };
      },
    }),
  }),
}));

import { alreadyLinked, linkReplaces, planStoreRecordLink, writeStoreRecordLink } from "../storeRecordLink";

const patientLink = { id: "7d0e5f6a-8b9c-4da4-8e1f-3a4b5c6d7e8f", data: { key: "patient", label: "Patient", type: "relation", relation_target: PATIENTS, multi: false } };

beforeEach(() => {
  calls.length = 0;
});

it("writes through the link column the two tables already share", async () => {
  world = { appointmentFields: [patientLink], patientFields: [], crownDoc: {} };
  const plan = await planStoreRecordLink({ organizationId: ORG, target: { recordId: MARCUS, tableId: PATIENTS }, picked: { recordId: CROWN } });
  expect(plan.kind).toBe("through");
  expect(linkReplaces(plan)).toBe(false);
  await writeStoreRecordLink(plan);
  expect(calls.filter((c) => c.fn === "field_declare")).toHaveLength(0);
  expect(calls.find((c) => c.fn === "record_update")?.args).toMatchObject({ p_record_id: CROWN, p_patch: { patient: MARCUS } });
});

it("offers a new column when the tables share none, then declares it and writes through it", async () => {
  world = { appointmentFields: [], patientFields: [], crownDoc: {} };
  const plan = await planStoreRecordLink({ organizationId: ORG, target: { recordId: MARCUS, tableId: PATIENTS }, picked: { recordId: CROWN } });
  expect(plan.kind).toBe("new_column");
  await writeStoreRecordLink(plan);
  expect(calls.find((c) => c.fn === "field_declare")?.args).toMatchObject({
    p_table_id: PATIENTS,
    p_spec: { type: "relation", relation_target: APPOINTMENTS, multi: true, label: "Appointments" },
  });
  expect(calls.find((c) => c.fn === "record_update")?.args).toMatchObject({ p_record_id: MARCUS, p_patch: { appointments: [CROWN] } });
});

it("says a single link column that holds another record would be replaced, and an existing link is not written twice", async () => {
  world = { appointmentFields: [patientLink], patientFields: [], crownDoc: { patient: LENA } };
  const plan = await planStoreRecordLink({ organizationId: ORG, target: { recordId: MARCUS, tableId: PATIENTS }, picked: { recordId: CROWN } });
  expect(linkReplaces(plan)).toBe(true);
  world.crownDoc = { patient: MARCUS };
  const again = await planStoreRecordLink({ organizationId: ORG, target: { recordId: MARCUS, tableId: PATIENTS }, picked: { recordId: CROWN } });
  expect(alreadyLinked(again)).toBe(true);
});
