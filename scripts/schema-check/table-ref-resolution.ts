/**
 * Shared `.from()/.table()` table-name resolution for direct-from-schema AND
 * dead-relations — both need to see through a local `const TABLE = "the_name"`
 * string constant, not just a string literal argument.
 *
 * This is exactly how `page_extraction_jobs` (registered in dead-relations.json)
 * hid from every prior check pass: `features/page-extraction/api/jobs.ts` held
 * the table name in `const TABLE = "page_extraction_jobs"` and called
 * `db.from(TABLE)` — a literal-only regex never sees it. See
 * docs/db_changes/canonicalization_worklog.md.
 */

// `const TABLE = "page_extraction_jobs";` (optionally typed) in a file.
// Unanchored (a preceding comment line — e.g. the `// eslint-disable-next-line`
// that sits above almost every `as any` cast — would break a statement-start
// anchor), so this relies on the `const|let|var` keyword alone.
const CONST_STRING_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\2\s*(?:as\s+const)?\s*[;,]/g;

/** Local `const IDENT = "table_name"` declarations in a file, ident -> table name. */
export function buildTableConsts(content: string): Map<string, string> {
  const consts = new Map<string, string>();
  for (const m of content.matchAll(CONST_STRING_RE)) consts.set(m[1], m[3]);
  return consts;
}

/** Matches `.from("x")`, `.from(\`x\`)`, and `.from(IDENT)` (identifier, resolved via `tableConsts`). */
export const FROM_CALL_RE =
  /\.(from|table)\(\s*(?:(['"`])([A-Za-z_][A-Za-z0-9_]*)\2|([A-Za-z_$][\w$]*))\s*\)/g;

/** Every `.from()/.table()` call on a line, table name resolved (literal or local const alias). Unresolved variables are omitted — ambiguous, not a false positive. */
export function resolveFromCalls(
  text: string,
  tableConsts: Map<string, string>,
): Array<{ index: number; rel: string }> {
  const out: Array<{ index: number; rel: string }> = [];
  FROM_CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FROM_CALL_RE.exec(text))) {
    const rel = m[3] ?? (m[4] ? tableConsts.get(m[4]) : undefined);
    if (rel) out.push({ index: m.index, rel });
  }
  return out;
}
