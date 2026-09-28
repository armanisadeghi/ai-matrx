/**
 * offer-values.ts — the one helper marketing call sites use to send a
 * provision's declared offered values: absent facts are OMITTED (never sent
 * as "" / null / NaN / []), so a key present in `variables` is always a real
 * fact the call site held.
 */

/** Drop absent facts — a missing value is OMITTED, never sent as "" / null. */
export function compactOfferValues<T extends object>(values: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T)[]) {
    const value = values[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}
