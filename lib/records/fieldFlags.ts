/**
 * lib/records/fieldFlags.ts
 *
 * FieldFlags — the serializable replacement for `Set<keyof T>` used in
 * per-record dirty / loaded tracking. Canonical home for the durable-records
 * system; `features/agents/redux/shared/field-flags.ts` predates this and is
 * the model it was lifted from (that copy re-exports from here over time).
 *
 * `Set` is not JSON-serializable, which blocks Redux persistence, the sync
 * engine's broadcast/IDB layers, and DevTools time-travel. The replacement
 * shape is `Partial<Record<K, true>>`: presence of a key means the flag is set;
 * `true` is the canonical marker; `delete flags[key]` clears it.
 *
 * Use the helpers (not raw object access) so intent stays readable at callsites
 * (`hasField(flags, "title")` over `!!flags.title`).
 */

export type FieldFlags<K extends string = string> = Partial<Record<K, true>>;

export function createFieldFlags<K extends string = string>(): FieldFlags<K> {
  return {};
}

export function hasField<K extends string>(
  flags: FieldFlags<K>,
  field: K,
): boolean {
  return flags[field] === true;
}

export function addField<K extends string>(
  flags: FieldFlags<K>,
  field: K,
): void {
  flags[field] = true;
}

export function removeField<K extends string>(
  flags: FieldFlags<K>,
  field: K,
): void {
  delete flags[field];
}

export function fieldFlagsSize<K extends string>(flags: FieldFlags<K>): number {
  return Object.keys(flags).length;
}

export function fieldFlagsKeys<K extends string>(flags: FieldFlags<K>): K[] {
  return Object.keys(flags) as K[];
}

export function forEachField<K extends string>(
  flags: FieldFlags<K>,
  fn: (field: K) => void,
): void {
  for (const key of Object.keys(flags) as K[]) fn(key);
}
