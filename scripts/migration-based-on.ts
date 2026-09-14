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

/**
 * Comments, dollar-quoted bodies and single-quoted literals removed.
 *
 * Dollar bodies matter in both directions: a `CREATE OR REPLACE FUNCTION` that
 * appears INSIDE a function body (dynamic DDL built with `format()`) is not a
 * statement this file executes, and the real statement's own header and
 * parameter list sit BEFORE its `$$`, so stripping bodies keeps every genuine
 * one and drops every quoted one.
 */
export function stripForFunctionDetection(sql: string): string {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  s = s.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, " '' ");
  s = s.replace(/'(?:[^']|'')*'/g, " '' ");
  return s;
}

const IDENT = `(?:"[^"]*"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = new RegExp(
  `\\bCREATE\\s+OR\\s+REPLACE\\s+(FUNCTION|PROCEDURE)\\s+(${IDENT}(?:\\.${IDENT})*)\\s*\\(`,
  "gi",
);

export interface ReplacedFunction {
  /** As written in the file, e.g. `billing.plan_status`. */
  readonly name: string;
  /** FUNCTION or PROCEDURE, as written. */
  readonly kind: string;
  /** Raw parameter-list text between the parentheses. */
  readonly args: string;
  /** 1-based line of the CREATE statement in the ORIGINAL file. */
  readonly line: number;
}

/** Character offset -> 1-based line number in `original`. */
function lineOf(original: string, stripped: string, index: number): number {
  // The strippers preserve length only approximately, so locate by the name
  // text instead: good enough for a human-facing message, never load-bearing.
  const head = stripped.slice(0, index);
  return head.split("\n").length;
}

/** Every `CREATE OR REPLACE FUNCTION|PROCEDURE` this file actually executes. */
export function findReplacedFunctions(sql: string): ReplacedFunction[] {
  const stripped = stripForFunctionDetection(sql);
  const out: ReplacedFunction[] = [];
  QUALIFIED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUALIFIED.exec(stripped)) !== null) {
    const open = m.index + m[0].length - 1;
    const args = balanced(stripped, open);
    if (args === null) continue;
    out.push({
      name: m[2]!,
      kind: m[1]!.toUpperCase(),
      args,
      line: lineOf(sql, stripped, m.index),
    });
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
  /** Signature as written, e.g. `billing.plan_status(uuid)`. */
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

export function parseBasedOnLines(sql: string): {
  lines: BasedOnLine[];
  malformed: { raw: string; line: number }[];
} {
  const lines: BasedOnLine[] = [];
  const malformed: { raw: string; line: number }[] = [];
  sql.split("\n").forEach((raw, i) => {
    if (!/^\s*--\s*based-on:/i.test(raw)) return;
    const m = raw.match(BASED_ON_RE);
    if (!m) {
      malformed.push({ raw: raw.trim(), line: i + 1 });
      return;
    }
    lines.push({
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
  | { kind: "unresolvable"; reason: string; overloads: LiveFunction[] }
> {
  const overloads = await liveOverloads(q, fn.name);
  if (overloads.length === 0) return { kind: "new" };

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
  /** `missing` | `stale` | `unresolvable` | `phantom` | `malformed` */
  readonly kind: "missing" | "stale" | "unresolvable" | "phantom" | "malformed";
  readonly signature: string;
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
  const replaced = findReplacedFunctions(sql);
  const { lines, malformed } = parseBasedOnLines(sql);

  for (const bad of malformed)
    findings.push({
      kind: "malformed",
      signature: bad.raw,
      message:
        `line ${bad.line} is a \`-- based-on:\` line this runner cannot read: ${bad.raw}\n` +
        `    The shape is exactly:  -- based-on: <schema>.<name>(<argtypes>) <64 hex sha256>\n` +
        `    Generate it: pnpm db:based-on <schema>.<name>`,
    });

  if (replaced.length === 0 && lines.length === 0) return { findings, verified };

  // Declared lines, keyed by the live function they name.
  const declared = new Map<number, { hash: string; line: BasedOnLine }>();
  for (const l of lines) {
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

  for (const fn of replaced) {
    const r = await resolveReplaced(q, fn);
    if (r.kind === "new") continue;
    if (r.kind === "unresolvable") {
      findings.push({
        kind: "unresolvable",
        signature: fn.name,
        message:
          `line ${fn.line} replaces \`${fn.name}(…)\` and ${r.overloads.length} function(s) of that name\n` +
          `    already exist live, but this runner could not work out WHICH one it targets:\n` +
          `    ${r.reason}.\n` +
          `    It will not execute a whole-body overwrite it cannot identify. Schema-qualify the name and\n` +
          `    write plain parameter types (\`p_org uuid\`, not a domain alias built in this same file), then\n` +
          `    declare the body: pnpm db:based-on ${fn.name}`,
      });
      continue;
    }
    const { live } = r;
    const decl = declared.get(live.oid);
    if (!decl) {
      findings.push({
        kind: "missing",
        signature: live.signature,
        message:
          `line ${fn.line} replaces \`${live.signature}\`, which ALREADY EXISTS on this database, and the\n` +
          `    file never says which body it was written against.\n` +
          `    \`CREATE OR REPLACE FUNCTION\` is a whole-body write with no concurrency check: it silently\n` +
          `    discards every change another migration made to that function since you read it. That is how\n` +
          `    billing.plan_status went 42883 for every signed-in caller on 2026-09-14 (DD-220).\n` +
          `    Re-read the live body, re-base your change on it, and add the header line:\n` +
          `        pnpm db:based-on ${live.signature.replace(/\(.*$/, "")}\n` +
          `    (live body right now: sha256 ${live.hash})`,
      });
      continue;
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
      continue;
    }
    verified.push(live.signature);
  }
  return { findings, verified };
}
