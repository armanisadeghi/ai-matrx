/**
 * RECORDS AS AN ASSISTANT CAN READ THEM (DATA-V2-BASICS-2 F41).
 *
 * "Copy for AI → Everything, with records" on Harbor Dental's "Insurance Plan Accounts" handed over
 * 24 rows keyed by the store's internal keys (`renews: "Indemnity"`, `annual_max_used: 20`) with
 * no column name anywhere, so an assistant could not tell that `renews` is "Plan Type". Each row
 * now names its values by the column a person reads, the copy opens with the columns (name, kind,
 * key), and a key no column declares stays out of the way under `_other`.
 *
 * Pure: the fields and rows the store answered in, the copy out.
 */
export type CaptureField = { key: string; label?: string | null; name?: string | null; type?: string | null };
export type CaptureRow = { id: string; document?: Record<string, unknown> | null };

export function recordsForAnAssistant(fields: readonly CaptureField[], rows: readonly CaptureRow[]) {
  const nameOf = new Map<string, string>();
  const seen = new Set<string>();
  for (const f of fields) {
    let name = (f.label || f.name || f.key).trim() || f.key;
    // Two columns never share a name on screen (the store refuses it), but a copy never guesses.
    if (seen.has(name)) name = `${name} (${f.key})`;
    seen.add(name);
    nameOf.set(f.key, name);
  }
  return {
    columns: fields.map((f) => ({ name: nameOf.get(f.key)!, key: f.key, kind: f.type ?? null })),
    rows: rows.map((row) => {
      const out: Record<string, unknown> = { id: row.id };
      const other: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row.document ?? {})) {
        if (key.startsWith("_")) continue;
        const name = nameOf.get(key);
        if (name) out[name] = value;
        else other[key] = value;
      }
      if (Object.keys(other).length > 0) out._other = other;
      return out;
    }),
  };
}
