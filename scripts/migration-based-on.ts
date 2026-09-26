#!/usr/bin/env npx tsx
/**
 * DD-220 — A MIGRATION REPLACES ONLY THE FUNCTION BODY IT DECLARES IT SAW.
 *
 * THE DEFECT THIS CLOSES (measured live, 2026-09-14)
 * --------------------------------------------------
 * `billing.plan_status` was rewritten by DD-173 at 06:26:50 to read the plan by
 * its natural key. At 06:39:48 a later lane applied
 * `dd214_an_organizations_plan_is_its_members_to_see.sql`, whose body had been
 * composed from a `pg_get_functiondef` dump taken at THAT lane's session start —
 * i.e. from the pre-DD-173 body. The statement was a valid
 * `CREATE OR REPLACE FUNCTION`, it applied cleanly, and it silently put
 * `where id = v_plan` back. For 3 minutes 21 seconds every signed-in caller of
 * the plan screen got, over HTTPS:
 *
 *     POST /rest/v1/rpc/plan_status -> 404
 *     {"code":"42883","message":"operator does not exist: uuid = text"}
 *
 * `check:migrations`, `check:policy-of-record` and `check:db-guards` were all
 * exit 0 for the whole window. Nothing in the system could see it, because
 * `CREATE OR REPLACE FUNCTION` is a WHOLE-BODY WRITE with no concurrency check:
 * it never asks what it is overwriting. The same class re-broke
 * `mandate.vw_shortcut` on the view side (§6d-5) and cost twelve function bodies
 * in the 2026-08-28 slot incident.
 *
 * THE RULE
 * --------
 * A migration that replaces a function body **that already exists live** must
 * declare the body it was written against, by SHA-256, in a header line:
 *
 *     -- based-on: billing.plan_status(uuid) 9f3c…64 hex chars…
 *
 * The author generates it from the live catalogue with
 *
 *     pnpm db:based-on billing.plan_status
 *
 * and `pnpm db:apply` recomputes the live hash immediately before executing. If
 * they differ, SOMEONE CHANGED THAT BODY SINCE YOU READ IT, and the whole file
 * is refused by name, with both hashes and the remedy. A replaced function with
 * no `based-on` line at all is refused the same way. A function that does not
 * exist yet needs no line — a `CREATE OR REPLACE` of a new function overwrites
 * nothing.
 *
 * WHAT IS DELIBERATELY EXEMPT
 * ---------------------------
 * - **Ledgered files.** A file `public._schema_migrations` has already seen is
 *   frozen history: its bytes ran, and re-judging them today would refuse a
 *   `--reapply` of a file that was correct when it applied. Files applied before
 *   this guard existed are never re-judged.
 * - **New functions and new overloads.** Nothing to clobber.
 * - **A `CREATE FUNCTION` without `OR REPLACE`.** Postgres itself refuses that
 *   when the function exists; there is no silent overwrite to guard.
 *
 * WHY THE SIGNATURE IS RESOLVED BY POSTGRES, NOT BY A REGEX
 * ---------------------------------------------------------
 * `p_org uuid`, `uuid`, `character varying`, `p_x numeric(10,2) default 1`,
 * `variadic text[]`, `out v_total bigint` — telling a parameter NAME from a
 * parameter TYPE cannot be done honestly with a regex, and getting it wrong here
 * means keying the guard on the wrong overload. So every parameter's type text
 * is handed to `to_regtype` and the assembled signature to `to_regprocedure`:
 * the database's own parser decides what the file's statement targets. When that
 * resolution fails AND a function of that name exists live, the file is refused
 * rather than waved through — an unreadable signature over a live body is
 * exactly the case this guard exists for. When no function of that name exists
 * at all, nothing can be clobbered and the statement is left alone.
 */
import { createHash } from "node:crypto";

/** SHA-256 of a string, the same way the applier hashes migration bytes. */
export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export const BASED_ON_SHA_RE = /^[0-9a-f]{64}$/;

const IDENT = `(?:"[^"]*"|[A-Za-z_][A-Za-z0-9_$]*)`;
/**
 * Every occurrence of the keyword, ANYWHERE in the file — the name is captured
 * separately and may well fail to parse, because half the point of this scan is
 * to find the ones that are built at runtime.
 */
const REPLACE_KEYWORD = /\bCREATE\s+OR\s+REPLACE\s+(FUNCTION|PROCEDURE)\s+/gi;
const NAME_AT = new RegExp(`^(${IDENT}(?:\\.${IDENT})*)\\s*\\(`);

export interface ReplacedFunction {
  /** As written in the file, e.g. `billing.plan_status`; null when computed. */
  readonly name: string | null;
  /** Found as a DROP this same file recreates (rule `dd220-drop-recreate`, dated in
   *  scripts/lib/migration-rule-dates.ts), not as a CREATE OR REPLACE. */
  readonly viaDrop?: boolean;
  /** FUNCTION or PROCEDURE, as written. */
  readonly kind: string;
  /** Parameter-list text, literal-continuations joined; null when computed. */
  readonly args: string | null;
  /** 1-based line in the ORIGINAL file. */
  readonly line: number;
  /**
   * The keyword sits inside a dollar-quoted body or a string literal, i.e. this
   * is DDL built at runtime and handed to `EXECUTE` / `format()`.
   *
   * 🚨 V-84 item 6: the first cut of this guard STRIPPED those regions and
   * justified it as "a CREATE OR REPLACE inside a function body is not a
   * statement this file executes". That is false of `DO $$ … EXECUTE '…' … $$;`,
   * which executes it — and it is a live pattern in this very repo:
   * `ddl_guard_org_backstop_oid_comparison.sql` replaces `platform._ddl_guard()`
   * that way (the guard saw 0 of 1) and `iam_component_lanes_are_the_parents_dd137b10.sql`
   * replaces four more (the guard saw 1 of 5). A silent bypass, invisible to
   * every refusal proof, because it produces no refusal at all. The scan is now
   * conservative: it reads the WHOLE file and asks the same question of a
   * dynamic replace as of a static one.
   */
  readonly dynamic: boolean;
  /** The raw text right after the keyword, for a message about an unparseable one. */
  readonly snippet: string;
}

/** Comments only — the regions that matter are deliberately left in place. */
export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
}

/** [start, end) spans of dollar-quoted bodies and single-quoted literals. */
function quotedSpans(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === "$") {
      const tag = /^\$([A-Za-z_]\w*)?\$/.exec(s.slice(i));
      if (tag) {
        const close = s.indexOf(tag[0], i + tag[0].length);
        const end = close === -1 ? s.length : close + tag[0].length;
        spans.push([i + tag[0].length, close === -1 ? s.length : close]);
        i = end - 1;
        continue;
      }
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'") {
          if (s[j + 1] === "'") j += 2;
          else break;
        } else j += 1;
      }
      spans.push([i + 1, Math.min(j, s.length)]);
      i = Math.min(j, s.length - 1);
    }
  }
  return spans;
}

function inSpan(spans: Array<[number, number]>, i: number): boolean {
  return spans.some(([a, b]) => i >= a && i < b);
}

/**
 * Undo the two things dynamic SQL does to a signature that is otherwise written
 * out in full: adjacent-literal continuation (`'… p_id uuid, '\n'p_next text)…'`,
 * which SQL concatenates) and doubled quotes inside a literal.
 */
function joinLiteralText(t: string): string {
  return t.replace(/'[ \t\r\n]+'/g, "").replace(/''/g, "'");
}

/** True when a fragment was clearly assembled at runtime rather than written. */
function isComputed(t: string): boolean {
  return /\|\||%[IsL]|\bquote_ident\b|\bformat\s*\(/i.test(t);
}

/**
 * EVERY `CREATE OR REPLACE FUNCTION|PROCEDURE` in the file — statements and
 * runtime-built DDL alike. Conservative by design: a false demand for a header
 * costs one `pnpm db:based-on` call, a missed one costs a peer's function body.
 */
export function findReplaceOccurrences(sql: string): ReplacedFunction[] {
  const text = stripComments(sql);
  const spans = quotedSpans(text);
  const out: ReplacedFunction[] = [];
  REPLACE_KEYWORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REPLACE_KEYWORD.exec(text)) !== null) {
    const after = m.index + m[0].length;
    const line = text.slice(0, m.index).split("\n").length;
    const dynamic = inSpan(spans, m.index);
    const window = joinLiteralText(text.slice(after, after + 4000));
    const nm = NAME_AT.exec(window);
    const snippet = text.slice(after, after + 90).replace(/\s+/g, " ").trim();
    if (!nm || isComputed(nm[1]!)) {
      out.push({ name: null, kind: m[1]!.toUpperCase(), args: null, line, dynamic, snippet });
      continue;
    }
    const open = window.indexOf("(", nm[1]!.length - 1);
    const args = open === -1 ? null : balanced(window, open);
    const argsOk = args !== null && !isComputed(args);
    out.push({
      name: nm[1]!,
      kind: m[1]!.toUpperCase(),
      args: argsOk ? args : null,
      line,
      dynamic,
      snippet,
    });
  }
  out.push(...findDropRecreateOccurrences(text, spans));
  return out;
}

/** The statements written out in the file itself (no runtime-built DDL). */
export function findReplacedFunctions(sql: string): ReplacedFunction[] {
  return findReplaceOccurrences(sql).filter((o) => !o.dynamic);
}

// ── DROP FUNCTION/PROCEDURE that this SAME FILE later recreates ─────────────
//
// PROGRESS-S2 (data-doctrine-adoption v5, 2026-09-20): lane S3's file DROPped
// `record_aggregate`/`agg_sql` and re-created them from a stale dump. The scan above
// only looks at `CREATE OR REPLACE`, so a bare `DROP FUNCTION x(...); CREATE FUNCTION
// x(...) ...` — no `OR REPLACE` needed, because the DROP already removed the object —
// was INVISIBLE to it: the file put an older body back over a peer's change, twice,
// with no warning. A DROP this file recreates is now judged exactly like a replace —
// the live body IT DESTROYS must be declared, by hash, the same as `CREATE OR REPLACE
// FUNCTION` requires, and the same refusal sentence names it.
//
// Matched by NAME only, not by argument list: a recreate that changes the parameter
// list still destroys the dropped body, and requiring an exact arg match would let
// that shape through unguarded. `DROP FUNCTION foo;` (no arg list — valid only when
// `foo` has a single overload) resolves through the existing "name-only" arm of
// `resolveReplaced`, exactly as a dynamically-built `CREATE OR REPLACE` argument list
// does today.
const DROP_FN_KEYWORD = /\bDROP\s+(FUNCTION|PROCEDURE)\s+(?:IF\s+EXISTS\s+)?/gi;
const CREATE_FN_ANY_KEYWORD = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+/gi;

interface FnKeywordHit {
  readonly index: number;
  readonly line: number;
  readonly dynamic: boolean;
  readonly kind: string;
  readonly name: string | null;
  readonly args: string | null;
  readonly snippet: string;
}

/** A bare identifier chain right at the cursor — used when DROP FUNCTION omits the
 *  argument list (valid only when the name has exactly one live overload). */
function bareNameAt(window: string): string | null {
  const m = new RegExp(`^(${IDENT}(?:\\.${IDENT})*)`).exec(window);
  return m ? m[1]! : null;
}

function scanFunctionKeyword(text: string, spans: Array<[number, number]>, re: RegExp): FnKeywordHit[] {
  const out: FnKeywordHit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const after = m.index + m[0].length;
    const line = text.slice(0, m.index).split("\n").length;
    const dynamic = inSpan(spans, m.index);
    const window = joinLiteralText(text.slice(after, after + 4000));
    const snippet = text.slice(after, after + 90).replace(/\s+/g, " ").trim();
    const kind = m[1]!.toUpperCase();
    const nmParen = NAME_AT.exec(window);
    if (nmParen && !isComputed(nmParen[1]!)) {
      const name = nmParen[1]!;
      const open = window.indexOf("(", name.length - 1);
      const a = open === -1 ? null : balanced(window, open);
      out.push({ index: m.index, line, dynamic, kind, name, args: a !== null && !isComputed(a) ? a : null, snippet });
      continue;
    }
    const bare = bareNameAt(window);
    out.push({ index: m.index, line, dynamic, kind, name: bare && !isComputed(bare) ? bare : null, args: null, snippet });
  }
  return out;
}

/** Schema-qualified vs unqualified compared as the same name — the same rule
 *  `additiveVerdictOf` already applies to `-- based-on:` names in migration-target.ts. */
function fnNamesMatch(a: string, b: string): boolean {
  const na = a.replace(/"/g, "").toLowerCase();
  const nb = b.replace(/"/g, "").toLowerCase();
  return na === nb || na.endsWith(`.${nb}`) || nb.endsWith(`.${na}`);
}

function findDropRecreateOccurrences(text: string, spans: Array<[number, number]>): ReplacedFunction[] {
  const drops = scanFunctionKeyword(text, spans, DROP_FN_KEYWORD);
  if (drops.length === 0) return [];
  const creates = scanFunctionKeyword(text, spans, CREATE_FN_ANY_KEYWORD);
  const out: ReplacedFunction[] = [];
  for (const d of drops) {
    // An unreadable DROP target: the deny-list already refuses the bare DROP by
    // name ("a DROP"); this guard has nothing to look up.
    if (d.name === null) continue;
    const recreated = creates.some((c) => c.index > d.index && c.name !== null && fnNamesMatch(c.name, d.name!));
    if (!recreated) continue;
    out.push({ name: d.name, kind: d.kind, args: d.args, line: d.line, dynamic: d.dynamic, snippet: `DROP … ${d.snippet}`, viaDrop: true });
  }
  return out;
}

/** Text inside the parentheses starting at `open`, or null when unbalanced. */
function balanced(s: string, open: number): string | null {
  let depth = 0;
  let inQuote = false;
  for (let i = open; i < s.length; i += 1) {
    const ch = s[i]!;
    if (inQuote) {
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return null;
}

/** Split a parameter list on TOP-LEVEL commas only. */
export function splitParams(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i]!;
    if (inQuote) {
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  const tail = args.slice(start);
  if (tail.trim() || out.length) out.push(tail);
  return out.map((p) => p.trim()).filter((p) => p.length > 0);
}

export interface ParamCandidate {
  /** null = an OUT parameter: not part of the function's identity arguments. */
  readonly candidates: readonly string[] | null;
}

/**
 * The two readings of one parameter: "the whole text is a type" and "the first
 * token was a parameter name". Postgres decides between them, never this file.
 */
export function paramCandidates(param: string): ParamCandidate {
  let p = param.trim();
  const mode = p.match(/^(in|out|inout|variadic)\s+/i);
  if (mode) {
    if (mode[1]!.toLowerCase() === "out") return { candidates: null };
    p = p.slice(mode[0].length).trim();
  }
  const def = p.search(/\s+default\s+/i);
  if (def >= 0) p = p.slice(0, def).trim();
  else {
    const eq = topLevelIndex(p, "=");
    if (eq >= 0) p = p.slice(0, eq).trim();
  }
  const withoutFirst = p.replace(new RegExp(`^${IDENT}\\s+`), "").trim();
  const candidates = withoutFirst && withoutFirst !== p ? [p, withoutFirst] : [p];
  return { candidates };
}

function topLevelIndex(s: string, ch: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!;
    if (inQuote) {
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

export interface BasedOnLine {
  /**
   * `function` (the original DD-220 shape) or `trigger`/`view` (PROGRESS-S2:
   * the DROP-then-recreate class, whose objects carry no `pg_get_functiondef`).
   */
  readonly kind: "function" | "trigger" | "view";
  /** Signature as written, e.g. `billing.plan_status(uuid)`, `mytrig on sch.tbl`, `sch.myview`. */
  readonly signature: string;
  readonly hash: string;
  readonly line: number;
  readonly raw: string;
}

/**
 * `-- based-on: <schema.name>(<argtypes>) <sha256>` anywhere in the file.
 *
 * The signature half is matched up to its LAST `)` so parameterised types
 * (`numeric(10,2)`) survive; the hash is the trailing 64 hex characters.
 */
const BASED_ON_RE = /^\s*--\s*based-on:\s*(\S.*\))\s+([0-9a-fA-F]{64})\s*$/;
/**
 * `-- based-on: trigger <name> on <schema.table> <sha256>` — PROGRESS-S2. A trigger's
 * identity is (name, table), not a signature with an argument list, so it needs its
 * own shape rather than overloading the function one.
 */
const BASED_ON_TRIGGER_RE =
  /^\s*--\s*based-on:\s*trigger\s+(\S+)\s+on\s+(\S+)\s+([0-9a-fA-F]{64})\s*$/i;
/** `-- based-on: view <schema.name> <sha256>` — PROGRESS-S2. A view has no arguments. */
const BASED_ON_VIEW_RE = /^\s*--\s*based-on:\s*view\s+(\S+)\s+([0-9a-fA-F]{64})\s*$/i;

export function parseBasedOnLines(sql: string): {
  lines: BasedOnLine[];
  malformed: { raw: string; line: number }[];
} {
  const lines: BasedOnLine[] = [];
  const malformed: { raw: string; line: number }[] = [];
  sql.split("\n").forEach((raw, i) => {
    if (!/^\s*--\s*based-on:/i.test(raw)) return;
    const trig = raw.match(BASED_ON_TRIGGER_RE);
    if (trig) {
      lines.push({
        kind: "trigger",
        signature: `${trig[1]!.replace(/"/g, "")} on ${trig[2]!.replace(/"/g, "")}`,
        hash: trig[3]!.toLowerCase(),
        line: i + 1,
        raw: raw.trim(),
      });
      return;
    }
    const view = raw.match(BASED_ON_VIEW_RE);
    if (view) {
      lines.push({
        kind: "view",
        signature: view[1]!.replace(/"/g, ""),
        hash: view[2]!.toLowerCase(),
        line: i + 1,
        raw: raw.trim(),
      });
      return;
    }
    const m = raw.match(BASED_ON_RE);
    if (!m) {
      malformed.push({ raw: raw.trim(), line: i + 1 });
      return;
    }
    lines.push({
      kind: "function",
      signature: m[1]!.trim(),
      hash: m[2]!.toLowerCase(),
      line: i + 1,
      raw: raw.trim(),
    });
  });
  return { lines, malformed };
}

/** The one shape this module needs from a live connection. */
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface LiveFunction {
  readonly oid: number;
  /** `schema.name(identity args)` exactly as the catalogue spells it. */
  readonly signature: string;
  /** SHA-256 of `pg_get_functiondef(oid)`. */
  readonly hash: string;
}

/** Every live overload of a (possibly unqualified) function name, with body hashes. */
export async function liveOverloads(q: Query, name: string): Promise<LiveFunction[]> {
  const parts = splitQualified(name);
  const rows =
    parts.schema === null
      ? await q(
          `select p.oid::int as oid,
                  n.nspname || '.' || p.proname || '(' || coalesce(
                    (select string_agg(format_type(t, null), ', ' order by ord)
                       from unnest(p.proargtypes) with ordinality as u(t, ord)), '') || ')' as signature,
                  encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') as hash
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.proname = $1 and p.prokind in ('f','p')
              and n.nspname = any (current_schemas(true))`,
          [parts.name],
        )
      : await q(
          `select p.oid::int as oid,
                  n.nspname || '.' || p.proname || '(' || coalesce(
                    (select string_agg(format_type(t, null), ', ' order by ord)
                       from unnest(p.proargtypes) with ordinality as u(t, ord)), '') || ')' as signature,
                  encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') as hash
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = $1 and p.proname = $2 and p.prokind in ('f','p')`,
          [parts.schema, parts.name],
        );
  return rows as unknown as LiveFunction[];
}

function unquote(part: string): string {
  return part.startsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part.toLowerCase();
}

export function splitQualified(name: string): { schema: string | null; name: string } {
  const parts = name.match(new RegExp(IDENT, "g")) ?? [name];
  if (parts.length >= 2)
    return { schema: unquote(parts[parts.length - 2]!), name: unquote(parts[parts.length - 1]!) };
  return { schema: null, name: unquote(parts[0]!) };
}

// ── DROP TRIGGER / DROP VIEW that this SAME FILE later recreates ────────────
//
// The identical PROGRESS-S2 class as the FUNCTION case above, generalized to the
// two other object kinds the incident named. Neither a trigger nor a view has a
// `pg_get_functiondef`, so each gets its own live-hash source
// (`pg_get_triggerdef` / `pg_get_viewdef`) and its own `-- based-on:` shape —
// see `parseBasedOnLines` above.

export interface LiveTrigger {
  readonly oid: number;
  /** `<name> on <schema>.<table>`, exactly the shape a based-on line declares. */
  readonly signature: string;
  readonly hash: string;
}

export interface LiveView {
  readonly oid: number;
  /** `<schema>.<name>`. */
  readonly signature: string;
  readonly hash: string;
}

const DROP_TRIGGER_RE = new RegExp(
  `\\bDROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${IDENT}(?:\\.${IDENT})*)`,
  "gi",
);
const CREATE_TRIGGER_RE = new RegExp(
  `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+(${IDENT})\\b[\\s\\S]{0,400}?\\bON\\s+(${IDENT}(?:\\.${IDENT})*)`,
  "gi",
);
const DROP_VIEW_RE = new RegExp(
  `\\bDROP\\s+(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})*)`,
  "gi",
);
const CREATE_VIEW_RE = new RegExp(
  `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(${IDENT}(?:\\.${IDENT})*)`,
  "gi",
);

interface NamedHit {
  readonly index: number;
  readonly line: number;
  readonly a: string;
  readonly b: string | null;
  readonly snippet: string;
}

function scanNamed(text: string, re: RegExp): NamedHit[] {
  const out: NamedHit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const line = text.slice(0, m.index).split("\n").length;
    out.push({
      index: m.index,
      line,
      a: m[1]!.replace(/"/g, ""),
      b: m[2] ? m[2].replace(/"/g, "") : null,
      snippet: text.slice(m.index, m.index + 90).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

export interface DroppedTrigger {
  readonly name: string;
  /** Schema-qualified table, as written; null when the DROP could not be read that way. */
  readonly table: string | null;
  readonly line: number;
  readonly snippet: string;
}

export interface DroppedView {
  /** Schema-qualified, as written. */
  readonly name: string;
  readonly line: number;
  readonly snippet: string;
}

/** Every `DROP TRIGGER` this file's own, later text recreates (name AND table match —
 *  a trigger's identity is the pair, never the name alone). */
export function findDroppedTriggersRecreated(sql: string): DroppedTrigger[] {
  const text = stripComments(sql);
  const drops = scanNamed(text, DROP_TRIGGER_RE);
  if (drops.length === 0) return [];
  const creates = scanNamed(text, CREATE_TRIGGER_RE);
  const out: DroppedTrigger[] = [];
  for (const d of drops) {
    const recreated = creates.some(
      (c) => c.index > d.index && fnNamesMatch(c.a, d.a) && c.b !== null && fnNamesMatch(c.b, d.b!),
    );
    if (recreated) out.push({ name: d.a, table: d.b, line: d.line, snippet: d.snippet });
  }
  return out;
}

/** Every `DROP VIEW` this file's own, later text recreates. */
export function findDroppedViewsRecreated(sql: string): DroppedView[] {
  const text = stripComments(sql);
  const drops = scanNamed(text, DROP_VIEW_RE);
  if (drops.length === 0) return [];
  const creates = scanNamed(text, CREATE_VIEW_RE);
  const out: DroppedView[] = [];
  for (const d of drops) {
    const recreated = creates.some((c) => c.index > d.index && fnNamesMatch(c.a, d.a));
    if (recreated) out.push({ name: d.a, line: d.line, snippet: d.snippet });
  }
  return out;
}

/** The live trigger a DROP names, by (name, table), with its `pg_get_triggerdef` hash. */
export async function liveTrigger(q: Query, name: string, table: string): Promise<LiveTrigger | null> {
  const parts = splitQualified(table);
  if (parts.schema === null) return null; // an unqualified table: ambiguous, refused by the caller
  const rows = await q(
    `select t.oid::int as oid,
            t.tgname || ' on ' || n.nspname || '.' || c.relname as signature,
            encode(sha256(convert_to(pg_get_triggerdef(t.oid), 'utf8')), 'hex') as hash
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and t.tgname = $1 and n.nspname = $2 and c.relname = $3`,
    [unquote(name), parts.schema, parts.name],
  );
  return (rows[0] as unknown as LiveTrigger) ?? null;
}

/** The live view a DROP names, with its `pg_get_viewdef` hash. */
export async function liveView(q: Query, name: string): Promise<LiveView | null> {
  const parts = splitQualified(name);
  if (parts.schema === null) return null; // an unqualified view: ambiguous, refused by the caller
  const rows = await q(
    `select c.oid::int as oid,
            n.nspname || '.' || c.relname as signature,
            encode(sha256(convert_to(pg_get_viewdef(c.oid), 'utf8')), 'hex') as hash
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('v', 'm') and n.nspname = $1 and c.relname = $2`,
    [parts.schema, parts.name],
  );
  return (rows[0] as unknown as LiveView) ?? null;
}

/** `to_regtype` / `to_regprocedure`, each in its own statement so a syntax
 *  error in one candidate never poisons anything else. */
async function tryResolve(q: Query, fn: string, text: string): Promise<string | null> {
  try {
    const rows = await q(`select ${fn}($1)::text as v`, [text]);
    const v = rows[0]?.v;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Resolve a file's CREATE statement to the live function it would overwrite. */
export async function resolveReplaced(
  q: Query,
  fn: ReplacedFunction,
): Promise<
  | { kind: "new" }
  | { kind: "resolved"; live: LiveFunction }
  | { kind: "name-only"; overloads: LiveFunction[] }
  | { kind: "computed" }
  | { kind: "unresolvable"; reason: string; overloads: LiveFunction[] }
> {
  // A name built at runtime: there is nothing to look up, and a whole-body write
  // at a name we cannot even read is the worst case this guard has.
  if (fn.name === null) return { kind: "computed" };

  const overloads = await liveOverloads(q, fn.name);
  if (overloads.length === 0) return { kind: "new" };

  // The name is written out but the argument list is assembled at runtime. We
  // cannot say WHICH overload it lands on, so every live one must be declared.
  if (fn.args === null) return { kind: "name-only", overloads };

  const types: string[] = [];
  for (const param of splitParams(fn.args)) {
    const { candidates } = paramCandidates(param);
    if (candidates === null) continue; // OUT: not an identity argument
    let hit: string | null = null;
    for (const c of candidates) {
      hit = await tryResolve(q, "to_regtype", c);
      if (hit) break;
    }
    if (!hit)
      return {
        kind: "unresolvable",
        reason: `Postgres could not read the parameter \`${param.trim()}\` as a type`,
        overloads,
      };
    types.push(hit);
  }

  const signature = `${fn.name}(${types.join(",")})`;
  const oid = await resolveProcOid(q, signature);
  // The name exists but this exact argument list does not: a NEW overload.
  if (oid === null) return { kind: "new" };
  const live = overloads.find((o) => Number(o.oid) === oid);
  if (live) return { kind: "resolved", live };

  // It resolved to something the name query did not return — an aggregate or a
  // window function, which has no `pg_get_functiondef` to hash.
  return {
    kind: "unresolvable",
    reason: `\`${signature}\` resolves to an object that is not a plain function or procedure`,
    overloads,
  };
}

/** The oid a signature names, or null when nothing of that shape exists. */
export async function resolveProcOid(q: Query, signature: string): Promise<number | null> {
  try {
    const rows = await q(`select to_regprocedure($1)::oid::int as oid`, [signature]);
    const v = rows[0]?.oid;
    return typeof v === "number" && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export interface BasedOnFinding {
  /** Human sentence, already carrying the remedy. */
  readonly message: string;
  readonly kind:
    | "missing"
    | "stale"
    | "unresolvable"
    | "phantom"
    | "malformed"
    /** runtime-built DDL whose argument list could not be read statically */
    | "dynamic-name-only"
    /** runtime-built DDL whose FUNCTION NAME could not be read statically */
    | "dynamic-computed";
  readonly signature: string;
  /** The dated rule that raised it when it is younger than DD-220 itself (lane
   *  CLONE-LEDGER-VERDICTS): a finding from a DROP this file recreates. */
  readonly rule?: "dd220-drop-recreate";
}

export interface BasedOnResult {
  readonly findings: BasedOnFinding[];
  /** Signatures this file replaces whose declared hash == the live body's. */
  readonly verified: string[];
}

/**
 * THE GUARD. An empty `findings` means every function this file replaces is one
 * whose CURRENT live body the file declares, by hash.
 */
export async function basedOnCheck(q: Query, sql: string): Promise<BasedOnResult> {
  const findings: BasedOnFinding[] = [];
  const verified: string[] = [];
  const replaced = findReplaceOccurrences(sql);
  const { lines, malformed } = parseBasedOnLines(sql);

  for (const bad of malformed)
    findings.push({
      kind: "malformed",
      signature: bad.raw,
      message:
        `line ${bad.line} is a \`-- based-on:\` line this runner cannot read: ${bad.raw}\n` +
        `    The shape is exactly one of:\n` +
        `        -- based-on: <schema>.<name>(<argtypes>) <64 hex sha256>          (function/procedure)\n` +
        `        -- based-on: trigger <name> on <schema>.<table> <64 hex sha256>   (trigger)\n` +
        `        -- based-on: view <schema>.<name> <64 hex sha256>                 (view)\n` +
        `    Generate it: pnpm db:based-on <schema>.<name>`,
    });

  const droppedTriggers = findDroppedTriggersRecreated(sql);
  const droppedViews = findDroppedViewsRecreated(sql);

  if (
    replaced.length === 0 &&
    lines.length === 0 &&
    droppedTriggers.length === 0 &&
    droppedViews.length === 0
  )
    return { findings, verified };

  const fnLines = lines.filter((l) => l.kind === "function");
  const triggerLines = lines.filter((l) => l.kind === "trigger");
  const viewLines = lines.filter((l) => l.kind === "view");

  // Declared lines, keyed by the live function they name.
  const declared = new Map<number, { hash: string; line: BasedOnLine }>();
  for (const l of fnLines) {
    const oid = await resolveProcOid(q, l.signature);
    if (oid === null) {
      findings.push({
        kind: "phantom",
        signature: l.signature,
        message:
          `line ${l.line} declares \`-- based-on: ${l.signature}\`, but no such function exists on this database.\n` +
          `    A based-on line nobody can check is worth less than no line at all. Fix the signature\n` +
          `    (regenerate it: pnpm db:based-on ${l.signature.replace(/\(.*$/, "")}), or delete the line if\n` +
          `    the function is genuinely new.`,
      });
      continue;
    }
    declared.set(oid, { hash: l.hash, line: l });
  }

  const where = (fn: ReplacedFunction) =>
    `line ${fn.line}${fn.dynamic ? " (inside runtime-built DDL — a DO block or EXECUTE/format string)" : ""}`;

  for (const fn of replaced) {
    const before = findings.length;
    await judgeOne(fn);
    if (fn.viaDrop)
      for (let i = before; i < findings.length; i++) findings[i] = { ...findings[i]!, rule: "dd220-drop-recreate" };
  }
  async function judgeOne(fn: ReplacedFunction): Promise<void> {
    const r = await resolveReplaced(q, fn);
    if (r.kind === "new") return;

    // A name assembled at runtime. Nothing can be looked up, so the file must at
    // least carry a declaration the author stands behind — and every line it
    // carries has already been checked against the live body above.
    if (r.kind === "computed") {
      if (lines.length > 0 && findings.length === 0) {
        console.warn(
          `      NOTE ${where(fn)} builds a function NAME at runtime (\`${fn.snippet}…\`).\n` +
            `      This runner cannot check what that overwrites; it is trusting the ` +
            `${lines.length} verified \`-- based-on:\` line(s) in this file.`,
        );
        return;
      }
      findings.push({
        kind: "dynamic-computed",
        signature: fn.snippet,
        message:
          `${where(fn)} replaces a function whose NAME is built at runtime:\n` +
          `        ${fn.snippet}…\n` +
          `    A whole-body write at a name this runner cannot even read is the worst case of the\n` +
          `    DD-220 class: it clobbers whatever is there, and no proof in this repo would see it.\n` +
          `    Write the replace STATICALLY (a plain \`create or replace function <schema>.<name>(…)\`\n` +
          `    statement, which is also what makes the file reviewable), or carry an explicit\n` +
          `    \`-- based-on:\` line for the name it will produce:\n` +
          `        pnpm db:based-on <schema>.<the name this builds>`,
      });
      return;
    }

    // The name is written out but the arguments are assembled at runtime: we
    // cannot say which overload it lands on, so ALL of them must be declared.
    if (r.kind === "name-only") {
      const undeclared = r.overloads.filter((o) => !declared.has(Number(o.oid)));
      if (undeclared.length === 0) {
        for (const o of r.overloads) {
          const decl = declared.get(Number(o.oid))!;
          if (decl.hash !== o.hash)
            findings.push({
              kind: "stale",
              signature: o.signature,
              message:
                `line ${decl.line.line} declares \`${o.signature}\` based on sha256 ${decl.hash},\n` +
                `    but the body live on this database RIGHT NOW is sha256 ${o.hash}. Somebody replaced\n` +
                `    that function after you read it (DD-220). Regenerate: pnpm db:based-on ${o.signature.replace(/\(.*$/, "")}`,
            });
          else verified.push(o.signature);
        }
        return;
      }
      findings.push({
        kind: "dynamic-name-only",
        signature: fn.name ?? "",
        message:
          `${where(fn)} replaces \`${fn.name}\` with an argument list built at runtime, so this runner\n` +
          `    cannot tell WHICH of the ${r.overloads.length} live overload(s) it lands on. Every one of them\n` +
          `    must therefore be declared; ${undeclared.length} ${undeclared.length === 1 ? "is" : "are"} not:\n` +
          undeclared.map((o) => `        ${o.signature}  (live sha256 ${o.hash})`).join("\n") +
          `\n    Write the parameter list out in full so the target is unambiguous, or declare them all:\n` +
          `        pnpm db:based-on ${fn.name}`,
      });
      return;
    }

    if (r.kind === "unresolvable") {
      findings.push({
        kind: "unresolvable",
        signature: fn.name ?? "",
        message:
          `${where(fn)} replaces \`${fn.name}(…)\` and ${r.overloads.length} function(s) of that name\n` +
          `    already exist live, but this runner could not work out WHICH one it targets:\n` +
          `    ${r.reason}.\n` +
          `    It will not execute a whole-body overwrite it cannot identify. Schema-qualify the name and\n` +
          `    write plain parameter types (\`p_org uuid\`, not a domain alias built in this same file), then\n` +
          `    declare the body: pnpm db:based-on ${fn.name}`,
      });
      return;
    }
    const { live } = r;
    const decl = declared.get(live.oid);
    if (!decl) {
      findings.push({
        kind: "missing",
        signature: live.signature,
        message:
          `${where(fn)} replaces \`${live.signature}\`, which ALREADY EXISTS on this database, and the\n` +
          `    file never says which body it was written against.\n` +
          `    \`CREATE OR REPLACE FUNCTION\` is a whole-body write with no concurrency check: it silently\n` +
          `    discards every change another migration made to that function since you read it. That is how\n` +
          `    billing.plan_status went 42883 for every signed-in caller on 2026-09-14 (DD-220).\n` +
          `    Re-read the live body, re-base your change on it, and add the header line:\n` +
          `        pnpm db:based-on ${live.signature.replace(/\(.*$/, "")}\n` +
          `    (live body right now: sha256 ${live.hash})`,
      });
      return;
    }
    if (decl.hash !== live.hash) {
      findings.push({
        kind: "stale",
        signature: live.signature,
        message:
          `line ${decl.line.line} declares \`${live.signature}\` based on sha256 ${decl.hash},\n` +
          `    but the body live on this database RIGHT NOW is sha256 ${live.hash}.\n` +
          `    Somebody replaced that function after you read it. Applying this file would silently throw\n` +
          `    their change away — the DD-220 class, and the exact way billing.plan_status went 42883 for\n` +
          `    every signed-in caller for 3m21s on 2026-09-14.\n` +
          `    Remedy: re-read the live body, re-base your edit on it, and regenerate the header line:\n` +
          `        pnpm db:based-on ${live.signature.replace(/\(.*$/, "")}`,
      });
      return;
    }
    verified.push(live.signature);
  }

  // ── PROGRESS-S2: DROP TRIGGER that this file recreates ────────────────────
  for (const dt of droppedTriggers) {
    if (dt.table === null) {
      findings.push({
        kind: "unresolvable",
        rule: "dd220-drop-recreate",
        signature: dt.name,
        message:
          `line ${dt.line} DROPs trigger \`${dt.name}\` and this file recreates it, but the DROP\n` +
          `    does not name a schema-qualified table (\`DROP TRIGGER ${dt.name} ON <schema>.<table>\`),\n` +
          `    so the live body it destroys cannot be looked up. It will not execute a whole-object\n` +
          `    overwrite it cannot identify. Schema-qualify the table, then declare the body.`,
      });
      continue;
    }
    const live = await liveTrigger(q, dt.name, dt.table);
    if (!live) continue; // nothing live by that name on that table: nothing to clobber
    const decl = triggerLines.find((l) => l.signature.toLowerCase() === live.signature.toLowerCase());
    if (!decl) {
      findings.push({
        kind: "missing",
        rule: "dd220-drop-recreate",
        signature: live.signature,
        message:
          `line ${dt.line} DROPs trigger \`${live.signature}\`, which this file then recreates, and the\n` +
          `    file never says which body the DROP destroyed.\n` +
          `    A DROP-then-recreate is a whole-object write with no concurrency check, exactly like\n` +
          `    \`CREATE OR REPLACE FUNCTION\` (DD-220/PROGRESS-S2): it silently discards whatever another\n` +
          `    migration did to that trigger since you read it.\n` +
          `    Re-read the live definition, re-base your change on it, and add the header line:\n` +
          `        pnpm db:based-on ${live.signature}\n` +
          `    (live body right now: sha256 ${live.hash})`,
      });
      continue;
    }
    if (decl.hash !== live.hash) {
      findings.push({
        kind: "stale",
        rule: "dd220-drop-recreate",
        signature: live.signature,
        message:
          `line ${decl.line} declares \`trigger ${live.signature}\` based on sha256 ${decl.hash},\n` +
          `    but the body live on this database RIGHT NOW is sha256 ${live.hash}. Somebody replaced\n` +
          `    that trigger after you read it. Applying this file's DROP-then-recreate would silently\n` +
          `    throw their change away.\n` +
          `    Remedy: re-read the live definition, re-base your edit on it, and regenerate the header\n` +
          `    line: pnpm db:based-on ${live.signature}`,
      });
      continue;
    }
    verified.push(`trigger ${live.signature}`);
  }

  // ── PROGRESS-S2: DROP VIEW that this file recreates ────────────────────────
  for (const dv of droppedViews) {
    const live = await liveView(q, dv.name);
    if (!live) continue; // nothing live by that name: nothing to clobber
    const decl = viewLines.find((l) => l.signature.toLowerCase() === live.signature.toLowerCase());
    if (!decl) {
      findings.push({
        kind: "missing",
        rule: "dd220-drop-recreate",
        signature: live.signature,
        message:
          `line ${dv.line} DROPs view \`${live.signature}\`, which this file then recreates, and the\n` +
          `    file never says which body the DROP destroyed.\n` +
          `    A DROP-then-recreate is a whole-object write with no concurrency check, exactly like\n` +
          `    \`CREATE OR REPLACE FUNCTION\` (DD-220/PROGRESS-S2): it silently discards whatever another\n` +
          `    migration did to that view since you read it.\n` +
          `    Re-read the live definition, re-base your change on it, and add the header line:\n` +
          `        pnpm db:based-on ${live.signature}\n` +
          `    (live body right now: sha256 ${live.hash})`,
      });
      continue;
    }
    if (decl.hash !== live.hash) {
      findings.push({
        kind: "stale",
        rule: "dd220-drop-recreate",
        signature: live.signature,
        message:
          `line ${decl.line} declares \`view ${live.signature}\` based on sha256 ${decl.hash},\n` +
          `    but the body live on this database RIGHT NOW is sha256 ${live.hash}. Somebody replaced\n` +
          `    that view after you read it. Applying this file's DROP-then-recreate would silently\n` +
          `    throw their change away.\n` +
          `    Remedy: re-read the live definition, re-base your edit on it, and regenerate the header\n` +
          `    line: pnpm db:based-on ${live.signature}`,
      });
      continue;
    }
    verified.push(`view ${live.signature}`);
  }

  return { findings, verified };
}
