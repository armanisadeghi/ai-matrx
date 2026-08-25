/**
 * Classify the platform's deliberate governed-write refusal without confusing
 * it with an infrastructure 42501 (missing table/function grants, schema
 * permissions, or a broken policy). Only the trigger's human contract is an
 * actionable owner/full-access denial.
 */

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorChain(error: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  let cursor = objectRecord(error);
  const seen = new Set<Record<string, unknown>>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    result.push(cursor);
    cursor = objectRecord(cursor.cause);
  }
  return result;
}

export function isGovernedActionDenial(error: unknown): boolean {
  const chain = errorChain(error);
  const code = chain
    .map((entry) => entry.code)
    .find((value): value is string => typeof value === "string");
  if (code !== "42501") return false;

  const prose = chain
    .flatMap((entry) => [
      entry.message,
      entry.details,
      entry.detail,
      entry.hint,
    ])
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return (
    /access does not include (?:deleting|removing|archiving|restoring|moving|updating)/i.test(
      prose,
    ) ||
    /(?:deleting|removing|archiving|restoring|moving) someone else(?:'|’)s work needs full access/i.test(
      prose,
    )
  );
}
