/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). In Cedar Ridge Physical Therapy's chat, admin asked the
 * assistant to add a "Hydrotherapy Pool" room that holds 4 patients. The assistant proposed a
 * Patient Capacity column, a number, and the approval card read "HOLDS Range" — the store's
 * behaviour word, not the type a person picks on the table ("Number"). The card now says the
 * column's type in the same word the table's field panel uses.
 *
 * RED before the lane: APPROVAL_READER_UNDER_TEST points at the HEAD copy.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fieldTypeSentence } = require(process.env.APPROVAL_READER_UNDER_TEST ?? "../recordChangeApproval") as typeof import("../recordChangeApproval");
import { fieldTypeLabel } from "@ai-matrx/records-ui";

const held = (declaration: Record<string, unknown>) => ({
  change: "field" as const,
  tableId: "t",
  key: String(declaration.key),
  label: String(declaration.label ?? declaration.key),
  parityType: (declaration.parity_type as string | undefined) ?? null,
  behaviour: (declaration.type as string | undefined) ?? null,
  declaration,
});

it("a number column is said the way the table says it, never as the store's behaviour word", () => {
  const capacity = { key: "patient_capacity", label: "Patient Capacity", type: "range" };
  const said = fieldTypeSentence(held(capacity));
  expect(said).not.toBe("Range");
  expect(said).toBe(fieldTypeLabel(capacity as never));
});

it("every declaration reads the same word as the table's own header", () => {
  for (const d of [
    { key: "pool_lift", label: "Pool Lift", type: "boolean", parity_type: "checkbox" },
    { key: "day_rate", label: "Day rate", type: "range", parity_type: "currency" },
    { key: "notes", label: "Notes", type: "text" },
  ]) {
    expect(fieldTypeSentence(held(d))).toBe(fieldTypeLabel(d as never));
  }
});
