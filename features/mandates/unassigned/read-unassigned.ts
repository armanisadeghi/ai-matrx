// features/mandates/unassigned/read-unassigned.ts
//
// THE ONE READER of the server's "nobody holds this job yet" signal.
//
// Every aidream door that refuses because a Mandate has no Holder carries
// `{mandate_key, remedy_action: "assign_holder"}` at the root of its error
// envelope (aidream `services/mandates/unassigned.py`). This turns any error a
// client holds — a callApi error with `serverDetail`, a raw envelope, a
// FastAPI `{detail: …}` body — into the job's key, or null. A screen that gets
// a key shows <UnassignedMandateCard> instead of the refusal's paragraph.

export const ASSIGN_HOLDER = "assign_holder";

function keyOf(value: unknown, depth: number): string | null {
  if (!value || typeof value !== "object" || depth > 4) return null;
  const record = value as Record<string, unknown>;
  if (
    record.remedy_action === ASSIGN_HOLDER &&
    typeof record.mandate_key === "string" &&
    record.mandate_key
  ) {
    return record.mandate_key;
  }
  for (const nested of ["serverDetail", "detail", "details", "body", "error"]) {
    const found = keyOf(record[nested], depth + 1);
    if (found) return found;
  }
  return null;
}

/** The Mandate key an "unassigned job" refusal names, or null for any other error. */
export function readUnassignedMandate(error: unknown): string | null {
  return keyOf(error, 0);
}
