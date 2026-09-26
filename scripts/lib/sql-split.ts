/**
 * THE statement splitter for anything that EXECUTES a migration statement by statement.
 *
 * Mirror: `../aidream/db/sql_split.py` — same rules, same shared corpus
 * (`scripts/lib/sql-split-corpus.json`), proven by both repos' tests
 * (`pnpm db:apply --sql-split-self-test`, aidream `db/tests/test_sql_split.py`).
 *
 * WHY (FOUND_DEFECTS D351, 2026-09-26). aidream's rehearse measure pass collapsed whitespace
 * after a comment strip that was not quote-aware, so two adjacent string literals on separate
 * lines (`'a '\n'b'`, concatenated by PostgreSQL ONLY across a newline) became `'a ' 'b'`: a
 * syntax error. This repo's `topLevelStatementsVerbatim` kept newlines but read `E'it\'s'` as a
 * closed string after `\'`. A rehearsal must execute each statement's bytes EXACTLY as written.
 *
 * Rules at the top level: `--` and nested `/* … *\/` comments (kept verbatim, never read for
 * `;`); `'…'` with `''`; `E'…'` with backslash escapes too; `"…"` identifiers; `$tag$ … $tag$`
 * (a `$` after an identifier character, or `$1`, is not a quote); a top-level `;` ends a
 * statement. A statement of only whitespace and comments is dropped.
 */

const TAG_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

interface Scan {
  /** index just past the quoted/commented span starting at i, or -1 when none starts there */
  end: number;
  comment: boolean;
}

function spanAt(sql: string, i: number): Scan {
  const n = sql.length;
  const ch = sql[i]!;
  const nxt = sql[i + 1] ?? "";
  if (ch === "-" && nxt === "-") {
    const j = sql.indexOf("\n", i);
    return { end: j < 0 ? n : j, comment: true };
  }
  if (ch === "/" && nxt === "*") {
    let depth = 1;
    let k = i + 2;
    while (k < n && depth) {
      if (sql.startsWith("/*", k)) { depth += 1; k += 2; }
      else if (sql.startsWith("*/", k)) { depth -= 1; k += 2; }
      else k += 1;
    }
    return { end: k, comment: true };
  }
  const boundary = i === 0 || !IDENT_CHAR.test(sql[i - 1]!);
  if ((ch === "e" || ch === "E") && nxt === "'" && boundary) {
    let k = i + 2;
    while (k < n) {
      if (sql[k] === "\\") { k += 2; continue; }
      if (sql[k] === "'") {
        if (sql[k + 1] === "'") { k += 2; continue; }
        k += 1;
        break;
      }
      k += 1;
    }
    return { end: k, comment: false };
  }
  if (ch === "'" || ch === '"') {
    let k = i + 1;
    while (k < n) {
      if (sql[k] === ch) {
        if (sql[k + 1] === ch) { k += 2; continue; }
        k += 1;
        break;
      }
      k += 1;
    }
    return { end: k, comment: false };
  }
  if (ch === "$" && boundary) {
    const m = TAG_RE.exec(sql.slice(i, i + 256));
    if (m) {
      const close = sql.indexOf(m[0], i + m[0].length);
      return { end: close < 0 ? n : close + m[0].length, comment: false };
    }
  }
  return { end: -1, comment: false };
}

/** `sql` with every comment replaced by one space; strings and dollar bodies untouched. */
export function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const s = spanAt(sql, i);
    if (s.end >= 0) {
      out += s.comment ? " " : sql.slice(i, s.end);
      i = s.end;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Every top-level statement of `sql`, verbatim (trailing `;` removed), in order. */
export function sqlStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const push = (stmt: string) => {
    if (stripComments(stmt).trim()) out.push(stmt.trim());
  };
  while (i < sql.length) {
    const s = spanAt(sql, i);
    if (s.end >= 0) { i = s.end; continue; }
    if (sql[i] === ";") {
      push(sql.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  push(sql.slice(start));
  return out;
}
