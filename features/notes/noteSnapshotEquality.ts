/** Canonical Notes snapshot equality: object key order is insignificant and array order is data. */
export function canonicalNoteSnapshotValue(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Notes snapshot identity requires finite JSON numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value) || Object.keys(value).length !== value.length) throw new Error("Notes snapshot identity requires serializable arrays.");
    seen.add(value);
    return `[${value.map((item) => canonicalNoteSnapshotValue(item, seen)).join(",")}]`;
  }
  if (!value || typeof value !== "object" || Object.prototype.toString.call(value) !== "[object Object]" || seen.has(value)) throw new Error("Notes snapshot identity requires serializable state.");
  seen.add(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalNoteSnapshotValue(record[key], seen)}`).join(",")}}`;
}

export function equalNoteSnapshotValue(left: unknown, right: unknown): boolean {
  return canonicalNoteSnapshotValue(left) === canonicalNoteSnapshotValue(right);
}
