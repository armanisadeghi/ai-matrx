/** Canonical Notes snapshot equality: object key order is insignificant and array order is data. */
export function canonicalNoteSnapshotValue(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Notes snapshot identity requires finite JSON numbers.");
    return JSON.stringify(value);
  }
  if (!value || typeof value !== "object" || seen.has(value) || Object.getOwnPropertySymbols(value).length) throw new Error("Notes snapshot identity requires serializable state.");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  // Structured-clone implementations can return another realm's plain object.
  const plainPrototype = prototype === null || prototype === Object.prototype ||
    (Object.getPrototypeOf(prototype) === null && Object.getOwnPropertyDescriptor(prototype, "constructor")?.value?.name === "Object");
  if (!array && !plainPrototype) throw new Error("Notes snapshot identity requires plain JSON objects.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).filter((key) => !array || key !== "length");
  if (array && (keys.length !== value.length || keys.some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) throw new Error("Notes snapshot identity requires dense JSON arrays.");
  if (keys.some((key) => !("value" in descriptors[key]) || !descriptors[key].enumerable)) throw new Error("Notes snapshot identity requires enumerable data properties.");
  seen.add(value);
  try {
    if (array) return `[${Array.from({ length: value.length }, (_, index) => canonicalNoteSnapshotValue(descriptors[String(index)].value, seen)).join(",")}]`;
    return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonicalNoteSnapshotValue(descriptors[key].value, seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function equalNoteSnapshotValue(left: unknown, right: unknown): boolean {
  return canonicalNoteSnapshotValue(left) === canonicalNoteSnapshotValue(right);
}
