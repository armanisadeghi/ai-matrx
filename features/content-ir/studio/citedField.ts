// features/content-ir/studio/citedField.ts
//
// A saved-result citation names its place with the part key the server wrote
// (`saved_result_text.py`): `summary` = the result's top-level scalar fields,
// `<list>-<n>` = the n-th (1-based) item of the top-level list `<list>`. This
// turns that key + the instance's data into the words the rendered instance
// shows for that place, so the page can find the element and scroll to it.
// Pure — the DOM search lives in `CitedFieldHighlight`.

const SKIP_KEYS = new Set(["trust", "citations", "provenance", "_meta", "metadata"]);

function isSkipped(key: string): boolean {
  return key.startsWith("__") || SKIP_KEYS.has(key);
}

/** Every non-empty string (and number) leaf of a value, in reading order. */
function leaves(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const t = value.replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  } else if (typeof value === "number") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const v of value) leaves(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!isSkipped(k)) leaves(v, out, depth + 1);
    }
  }
}

/**
 * The texts that identify the cited place, best first (longest first, capped).
 * `[]` when the key names nothing in this data — the caller then does nothing.
 */
export function citedFieldProbes(data: unknown, field: string | null | undefined): string[] {
  if (!field || !data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const gathered: string[] = [];
  const item = /^(.+)-(\d+)$/.exec(field);
  if (item && Array.isArray(record[item[1]!])) {
    const list = record[item[1]!] as unknown[];
    const n = Number.parseInt(item[2]!, 10);
    if (n < 1 || n > list.length) return [];
    leaves(list[n - 1], gathered);
  } else if (field === "summary") {
    for (const [k, v] of Object.entries(record)) {
      if (isSkipped(k)) continue;
      if (typeof v === "string" || typeof v === "number") leaves(v, gathered);
    }
  } else if (field in record && !isSkipped(field)) {
    leaves(record[field], gathered);
  }
  return [...new Set(gathered)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .map((t) => t.slice(0, 80));
}
