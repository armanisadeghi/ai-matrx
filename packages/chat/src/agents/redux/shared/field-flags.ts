/**
 * FieldFlags — serializable replacement for `Set<keyof T>` used in per-record
 * dirty/loaded tracking across the agent-definition and agent-shortcuts slices.
 *
 * `Set` is not JSON-serializable, which blocks:
 *   - Redux state persistence (localStorage, AsyncStorage)
 *   - Extracting the agent Redux stack into a framework-agnostic shared package
 *   - DevTools time-travel (Sets render as opaque placeholders)
 *
 * Replacement shape: `Partial<Record<K, true>>`. The presence of a key means
 * the flag is set; `true` is the canonical marker. `delete record[key]` clears.
 *
 * Use the helpers below instead of raw object access so the intent at each
 * callsite remains readable (`hasField(flags, "messages")` vs `!!flags.messages`).
 */

export type FieldFlags<K extends string> = Partial<Record<K, true>>;

export function createFieldFlags<K extends string>(): FieldFlags<K> {
  return {};
}

export function hasField<K extends string>(flags: FieldFlags<K>, field: K): boolean {
  return flags[field] === true;
}

export function addField<K extends string>(flags: FieldFlags<K>, field: K): void {
  flags[field] = true;
}

export function removeField<K extends string>(flags: FieldFlags<K>, field: K): void {
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
  for (const key of Object.keys(flags) as K[]) {
    fn(key);
  }
}

/**
 * Assign a single dynamically-keyed field on a record without an `as any`
 * escape hatch. The generic binds `K extends keyof T` and `value: T[K]`
 * together at the call site, so the write stays type-sound — TypeScript
 * just can't prove `record[field] = value` is safe at a *computed* index
 * without this indirection (a known inference gap for mapped-object writes,
 * not an unsoundness).
 */
export function assignField<T, K extends keyof T>(
  record: T,
  field: K,
  value: T[K],
): void {
  record[field] = value;
}

/**
 * Read a single dynamically-keyed field off a record without an
 * `as unknown as Record<string, unknown>` whole-row cast. Same generic
 * bridging as `assignField`, for the read direction.
 */
export function readField<T, K extends keyof T>(record: T, field: K): T[K] {
  return record[field];
}
