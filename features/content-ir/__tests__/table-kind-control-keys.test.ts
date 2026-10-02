/**
 * GUARD 5 (b3) — A REFERENCE AND A BATCH KEEP THEIR CONTROL KEYS THROUGH THE REAL TABLE PATH
 * (KINDS-GLUE wave 3 §2.4a, §7.2).
 *
 * `@ai-matrx/records` `tableRenderSchema` is Fields-only; the caller (`table-kind-source.ts`)
 * wraps it with content-ir's `withControlKeyFields`. Without the wrap, Cedar Ridge's dropped
 * reference `{"__kind": "table:…", "_record_id": "…"}` parses with `_record_id` in the residue
 * — the card would then draw an empty record instead of reading it. Plant: drop the wrap → red.
 * The census half (no unwrapped `tableRenderSchema(` call anywhere) is in
 * `scripts/shape/one-record-card.ts`.
 */

import { normalizeJsonRegion } from "@ai-matrx/content-ir";

const TABLE = "7c1e4a52-3b9d-4f60-8a21-5e0d9c3b7f14";
const KIND = `table:${TABLE}`;
const RECORD = "c4a1d2e3-0b9f-4e8d-a7c6-5b4a39281706";

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  tableKindFacts: jest.fn(async () => ({
    ok: true,
    data: {
      organization_id: "0a54df90-eab8-4d07-ab29-81a45fb41e04",
      table_id: TABLE,
      name: "Home Exercise Programs",
      title_field: "exercise",
      agent_writable: true,
      purpose: null,
      version: 1,
      type_field: null,
      stamp: "s1",
      fields: [
        { id: "f0000000-0000-4000-8000-000000000001", key: "exercise", label: "Exercise", type: "text", sort: 1 },
        { id: "f0000000-0000-4000-8000-000000000002", key: "sets", label: "Sets", type: "number", sort: 2 },
      ],
      choices: {},
    },
  })),
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/unified-data/realtime/recordsRealtimePort", () => ({
  createRecordsRealtimePort: () => ({ subscribeRecords: () => () => undefined }),
}));

import { readTableKind } from "../registry/table-kind-source";

async function schemaFromTheRealPath() {
  const answer = await readTableKind(KIND, TABLE);
  if (!answer.ok) throw new Error("the fixture Table should answer");
  return answer.schema;
}

describe("the table kind schema keeps the control keys (the caller's wrap)", () => {
  it("a reference keeps _record_id in the value, not the residue", async () => {
    const schema = await schemaFromTheRealPath();
    const envelope = normalizeJsonRegion(JSON.stringify({ __kind: KIND, _record_id: RECORD }), {
      schemas: { [KIND]: schema },
    });
    expect((envelope.root.value as Record<string, unknown>)._record_id).toBe(RECORD);
    expect(JSON.stringify(envelope.root.residue ?? null)).not.toContain("_record_id");
  });

  it("a batch keeps _records in the value, not the residue", async () => {
    const schema = await schemaFromTheRealPath();
    const batch = { __kind: KIND, _records: [{ exercise: "Clamshell", sets: 3 }, { exercise: "Bridge", sets: 2 }] };
    const envelope = normalizeJsonRegion(JSON.stringify(batch), { schemas: { [KIND]: schema } });
    expect((envelope.root.value as Record<string, unknown>)._records).toEqual(batch._records);
    expect(JSON.stringify(envelope.root.residue ?? null)).not.toContain("_records");
  });
});
