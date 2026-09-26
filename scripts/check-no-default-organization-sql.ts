/**
 * check-no-default-organization-sql — THE SAME RULING, ON THE SIDE OF THE WIRE
 * WHERE IT ACTUALLY SURVIVED.
 *
 * Ruling (Arman, 2026-09-19): a "default organization" is at most a per-client
 * DISPLAY preference. Nothing but the org picker and pure UI display may read
 * it. No data read, write, API route, boot ladder, TRIGGER or BILLING QUERY may
 * pick or substitute one — not a cookie, not a preference, not the personal
 * organization, not the system organization.
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * WHY THIS FILE EXISTS (and why the first pass of this campaign needed it)
 * -----------------------------------------------------------------------
 * `check-no-default-organization.ts` scans `app, features, components,
 * providers, hooks, lib` for `.ts`/`.tsx`. It is a good guard and it passes.
 * It also cannot see the database, and the database is where this class was
 * still alive after the campaign declared the frontend clean:
 *
 *   • `billing.entitlement_consume(text,integer,uuid)` filled the usage
 *     ledger's `organization_id` with
 *     `public.ensure_personal_organization(auth.uid())`. EVERY metered action
 *     taken in the browser was billed to a personal workspace nobody chose.
 *     No TypeScript file contained a single suspicious token — the frontend
 *     call site was an innocent three-argument RPC call.
 *   • `billing.resolve_tier` and `billing.tier_no_downgrade` read
 *     `iam.default_organization_id`, deciding ENTITLEMENTS from a pick nobody
 *     made.
 *   • `public._stamp_org_default` is attached to 328 tables and stamps an
 *     org-less insert with the actor's personal organization.
 *
 * A guard that only reads the language the defect is easy to spot in is a
 * guard that certifies the half of the system that was never the problem. So:
 * the same ruling, applied to `migrations/**\/*.sql`.
 *
 * THE THREE SQL RULES
 * -------------------
 *  6. READING A DEFAULT ORGANIZATION. `default_organization_id` appearing in
 *     executable SQL. The column may exist (it is the display preference the
 *     Doctrine keeps, R9–R12/DD-045) and the picker may read it — but a
 *     migration that puts it in a function, view, policy or default is putting
 *     a platform-chosen organization back into a decision path.
 *  7. SUBSTITUTING THE PERSONAL ORGANIZATION. `ensure_personal_organization` or
 *     `current_personal_org_id` in executable SQL. These answer "which
 *     organization?" with "their personal one", which is the substitution
 *     itself. Satisfying a NOT NULL column is an argument for making the CALLER
 *     supply the value, never for inventing one.
 *  8. ATTACHING THE STAMPING TRIGGER. `CREATE TRIGGER … _stamp_org_default`.
 *     Parent-inherit (`platform.inherit_org_from_parent`, which copies the
 *     PARENT ROW's organization and leaves NULL for the NOT NULL constraint to
 *     catch) is fine and is deliberately NOT flagged — it carries an
 *     organization rather than choosing one. `_stamp_org_default` chooses one.
 *
 * COMMENTS ARE STRIPPED BEFORE MATCHING, and that is load-bearing rather than
 * polite. Every migration that REMOVES one of these shapes has to quote the
 * removed statement so the next reader can see what went and why. A guard that
 * reads prose as code punishes exactly the files that fixed the problem and
 * teaches people to delete the explanation. (This is not hypothetical: the
 * in-transaction proof inside
 * `migrations/w1_org_billing_is_organization_keyed.sql` failed on its own
 * explanatory comment the first time it ran.)
 *
 * SUPERSESSION — THE ONE WAY A LEDGERED FILE STOPS BEING A VIOLATION.
 * -------------------------------------------------------------------
 * A migration that ALREADY RAN is applied history. Its bytes are frozen: editing
 * them changes nothing on the database and desynchronises its ledger checksum, so
 * the shape it carries cannot be "fixed" in place. It can only be SUPERSEDED — by
 * a later migration that replaces the same function with a body that does not
 * carry the shape.
 *
 * That is a fact about the DATABASE, so this guard checks the database rather than
 * taking a promise. The LATER file declares the supersession in its own header:
 *
 *     -- supersedes: migrations/campaign/<the ledgered file>.sql
 *     -- supersedes-function: public._library_audit
 *
 * and the violation in the ledgered file is forgiven only when ALL of these hold:
 *
 *   1. the superseding file is itself clean under every rule;
 *   2. it actually replaces each function it names (`create or replace function`
 *      or `drop function`) — a header that claims a supersession nothing carries
 *      out is worth nothing;
 *   3. THE CATALOG AGREES: no overload of any named function has a live body
 *      carrying the offending shape. This is the clause that cannot be talked
 *      into passing.
 *
 * Clause 3 needs the five `SUPABASE_MATRIX_*` variables. Where they are absent —
 * CI's ORGANIZATION CONTEXT job has no database — the guard SAYS SO, by name, on
 * every run, and rests on clauses 1 and 2. A stand-in that announces itself is not
 * a silent pass; an unannounced one is how a guard becomes decoration.
 *
 * This is NOT an allow-list. An allow-list is a promise about a file. A
 * supersession is a claim about the live catalogue, and the catalogue is asked.
 *
 * FROZEN HISTORY IS A RATCHET, NOT AN AMNESTY.
 * `scripts/no-default-organization-sql.allowlist.json` pins the migration files
 * that ALREADY carried these shapes when this guard was written. They are
 * applied history: editing them changes nothing on the database and silently
 * desynchronises their ledger checksum, so they cannot be "fixed" in place —
 * they are superseded by new files (which is what F1 and F2 did). Every file
 * NOT in that list — every file written from now on — must be clean. The list
 * only ever shrinks.
 *
 * THE CENSUS — AND WHY A SUPERSESSION HEADER WAS NEVER ENOUGH (DEFAULT-ORG-4).
 * ---------------------------------------------------------------------------
 * Clause 3 asks the catalogue about the functions a `-- supersedes-function:`
 * header NAMES. On 2026-09-22 this guard exited 0 while SEVENTEEN live function
 * bodies carried the shape, because no header named any of them. A guard that can
 * only see what it was handed is measuring the headers.
 *
 * So the last clause reads EVERY function body in every non-system schema —
 * `pg_get_functiondef` through the same stripping, against the same RULES — and
 * prints the ones still carrying it BY NAME. Two declared ways out: the display
 * preference itself (CENSUS_PRIMITIVES, named one by one) and a body that says, in
 * its own body, `-- personal-organization-creation: <schema.fn> — <why>`.
 * `scripts/no-default-organization-live-bodies.ratchet.json` forgives nothing; it
 * says which lane owns each remaining body, only ever shrinks, and a live body
 * missing from it is reported louder because nobody owns it.
 *
 * Run:  pnpm check:no-default-organization-sql
 *       pnpm check:no-default-organization-sql --self-test   (proves it FAILS)
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import { exitAfterDrain } from "./lib/exit-after-drain";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIR = "migrations";
const ALLOWLIST = join(ROOT, "scripts", "no-default-organization-sql.allowlist.json");
const LIVE_RATCHET = join(ROOT, "scripts", "no-default-organization-live-bodies.ratchet.json");

/**
 * `-- supersedes: <path>` and `-- supersedes-function: <schema.name>`. Built fresh
 * per call: a `/g` regex held in a module constant carries `lastIndex` between
 * files and silently skips every other match.
 */
function declaredSupersedes(source: string): { paths: string[]; functions: string[] } {
  const paths = [...source.matchAll(/^\s*--\s*supersedes:\s*(\S+)\s*$/gim)].map((m) =>
    m[1]!.replace(/\\/g, "/").replace(/^\.\//, ""),
  );
  const functions = [
    ...source.matchAll(/^\s*--\s*supersedes-function:\s*([A-Za-z_][\w$]*\.[A-Za-z_][\w$]*)\s*$/gim),
  ].map((m) => m[1]!.toLowerCase());
  return { paths, functions };
}

/**
 * Does this file actually DO what its `-- supersedes-function:` header claims?
 * A `create or replace` of that exact name, or a `drop function` of it. A header
 * that nothing carries out forgives nothing.
 */
function replacesFunction(code: string, qualified: string): boolean {
  const [schema, name] = qualified.split(".");
  const q = `(?:${schema}\\s*\\.\\s*)?${name}`;
  return (
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+${q}\\s*\\(`, "i").test(code) ||
    new RegExp(`drop\\s+function\\s+(?:if\\s+exists\\s+)?${q}\\s*\\(`, "i").test(code)
  );
}

interface Rule {
  id: number;
  what: string;
  pattern: RegExp;
  remedy: string;
}

const RULES: Rule[] = [
  {
    id: 6,
    what: "reads a default organization in executable SQL",
    pattern: /\bdefault_organization_id\b/i,
    remedy:
      "A default organization is a DISPLAY preference the person states; it may not decide where work lands or what someone is entitled to. Take the organization from the caller, or from the row's own parent.",
  },
  {
    id: 7,
    what: "substitutes the caller's personal organization in executable SQL",
    pattern: /\b(?:ensure_personal_organization|current_personal_org_id)\s*\(/i,
    remedy:
      "Make the caller name the organization and REFUSE when it does not (a 23502 with a hint reads as an honest failure; a silently mis-tenanted row does not). Satisfying NOT NULL is not a reason to invent a tenant. The function's own CREATE OR REPLACE header is the primitive, not a call, and is not this rule.",
  },
  {
    id: 8,
    what: "attaches the personal-org stamping trigger `_stamp_org_default`",
    pattern: /create\s+trigger\s+_stamp_org_default\b/i,
    remedy:
      "Use platform.inherit_org_from_parent (it copies the PARENT ROW's organization and leaves NULL for the NOT NULL constraint to catch) or leave the column to the constraint. _stamp_org_default calls ensure_personal_organization(actor) — it CHOOSES a tenant.",
  },
];

/**
 * Reduce a migration to the SQL that actually DECIDES something, so the guard
 * reads behaviour rather than prose.
 *
 * Four things are removed, each for a reason that cost something to learn:
 *
 *   1. `--` line comments and block comments. Every migration that REMOVES one
 *      of these shapes quotes the removed statement so the next reader can see
 *      what went. Reading that as code punishes the fixing file.
 *   2. Single-quoted string literals — EXCEPT on a line containing `execute`.
 *      A fixing migration has to NAME the shape it forbids: in the `raise
 *      exception` that asserts its absence, in the `ilike '%…%'` census that
 *      refuses to run against a stale body. Those are assertions ABOUT the
 *      defect, not the defect. `execute format('…')` is the one place a quoted
 *      literal really does run, and it is precisely how a substitution would
 *      hide from a guard that trusts quotes — so those lines are kept whole.
 *   3. `COMMENT ON …` statements, which document an object without changing
 *      what it does.
 *
 * Over-stripping can only cause a MISS, never a false alarm. That trade is
 * deliberate: a guard with a false alarm on the files that FIX the problem is a
 * guard somebody deletes, and then it catches nothing at all.
 */
export function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => {
      const bare = line.replace(/--.*$/, "");
      // `COMMENT ON FUNCTION iam.default_organization_id(uuid) IS '…'` names the
      // object in order to DOCUMENT it — including, in this campaign, to
      // document that it is display-only and that nothing may call it. It
      // changes no behaviour, so it is documentation that happens to execute.
      if (/^\s*comment\s+on\b/i.test(bare)) return "";
      // A line that RUNS dynamic SQL is kept whole: `execute format('… default
      // … ')` is the one place a quoted literal really is executable, and it is
      // exactly how a substitution would hide from a guard that trusts quotes.
      if (/\bexecute\b/i.test(bare)) return bare;
      // Otherwise drop single-quoted literals. A migration that REMOVES one of
      // these shapes has to name it — in a `raise exception` that asserts its
      // absence, in a `comment on … is '…'` that forbids it, in an `ilike
      // '%…%'` census. Flagging those makes the guard un-passable for the very
      // files that fix the problem, which is how a guard gets deleted.
      return bare.replace(/'(?:[^']|'')*'/g, "''");
    })
    .join("\n");
}

interface Violation {
  file: string;
  line: number;
  rule: number;
  detail: string;
}

export function scanSource(rel: string, source: string): Violation[] {
  const code = executableSql(source);
  const lines = code.split("\n");
  const found: Violation[] = [];
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      if (!rule.pattern.test(lines[i])) continue;
      // CREATE FUNCTION current_personal_org_id() is the primitive's own
      // header. A call is `select current_personal_org_id()` / `:= ensure_…()`.
      // Treating the header as a call flags every rewrite of the primitive.
      if (
        rule.id === 7 &&
        /create\s+(?:or\s+replace\s+)?function\s+(?:[\w]+\.)?(?:ensure_personal_organization|current_personal_org_id)\s*\(/i.test(
          lines[i],
        )
      ) {
        continue;
      }
      found.push({
        file: rel,
        line: i + 1,
        rule: rule.id,
        detail: lines[i].trim().slice(0, 140),
      });
      break; // one report per rule per file — the file is the unit that gets fixed
    }
  }
  return found;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      // `migrations/inverse/` is the directory no release sweep runs.
      if (entry === "inverse") continue;
      yield* walk(full);
    } else if (/\.sql$/i.test(entry) && !/\.inverse\.sql$/i.test(entry)) {
      // An INVERSE deliberately restores the shape its forward file removed —
      // that is what a rollback IS. Flagging it would mean no non-additive fix
      // in this campaign could ever ship with the inverse the db-change SOP
      // requires. Inverses are never applied by a sweep; they are run by hand,
      // by a person who has read the warning at the top of them.
      yield full;
    }
  }
}

function loadAllowlist(): Record<string, { rules: number[]; reason: string }> {
  try {
    return JSON.parse(readFileSync(ALLOWLIST, "utf8"));
  } catch {
    return {};
  }
}

export function scan(
  allowlist = loadAllowlist(),
  root = ROOT,
): Violation[] {
  const violations: Violation[] = [];
  for (const [rel, source] of collectFiles(root)) {
    // A file whose header declares `-- personal-organization-creation: <schema.fn>`
    // and really does replace that function is writing a CREATION site: the
    // organization it makes IS the answer, so rule 7 does not apply to it. Rules
    // 6 and 8 still do — creating a workspace is never a reason to read somebody's
    // stated default or to attach the stamping trigger. The claim is only half
    // settled here; the other half is the CENSUS, which requires the same
    // declaration in the LIVE body.
    const declared = declaredCreationSites(source);
    const creationHolds =
      declared.length > 0 &&
      declared.every((d) => replacesFunction(executableSql(source), d.fn));
    for (const v of scanSource(rel, source)) {
      if (v.rule === 7 && creationHolds) continue;
      const entry = allowlist[rel];
      if (entry && entry.rules.includes(v.rule)) continue;
      violations.push(v);
    }
  }
  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.rule - b.rule || a.line - b.line,
  );
}

/**
 * Every scanned migration, read once, keyed by its repo-relative path. `root` is the checkout by
 * default; the self-test passes a private temp dir holding its own `migrations/`.
 */
export function collectFiles(root = ROOT): Map<string, string> {
  const files = new Map<string, string>();
  for (const full of walk(join(root, SCAN_DIR))) {
    const rel = relative(root, full).split("\\").join("/");
    try {
      files.set(rel, readFileSync(full, "utf8"));
    } catch {
      continue;
    }
  }
  return files;
}

export interface Supersession {
  /** The ledgered file whose violation this claims to answer. */
  readonly superseded: string;
  /** The later migration making the claim. */
  readonly by: string;
  /** The functions it says it replaces, lower-cased and schema-qualified. */
  readonly functions: string[];
  /** Null when the claim stands on its own bytes; otherwise why it does not. */
  readonly refusedBecause: string | null;
}

/**
 * Read every `-- supersedes:` claim and judge the SOURCE half of it — clauses 1
 * and 2. The catalog half (clause 3) is asked separately, because it needs a
 * database and this half must be judgeable without one.
 */
export function readSupersessions(
  files: Map<string, string>,
  violationsByFile: Map<string, Violation[]>,
): Supersession[] {
  const out: Supersession[] = [];
  for (const [by, source] of files) {
    const { paths, functions } = declaredSupersedes(source);
    if (paths.length === 0) continue;
    const code = executableSql(source);
    for (const superseded of paths) {
      let refusedBecause: string | null = null;
      if (!files.has(superseded)) {
        refusedBecause = `it names ${superseded}, which is not a migration in this repository`;
      } else if ((violationsByFile.get(by) ?? []).length > 0) {
        refusedBecause =
          "the superseding file carries the same shape itself — a file cannot forgive what it repeats";
      } else if (functions.length === 0) {
        refusedBecause =
          "it names no `-- supersedes-function:`, so there is nothing to check against the catalogue";
      } else {
        const missing = functions.filter((fn) => !replacesFunction(code, fn));
        if (missing.length > 0) {
          refusedBecause = `it claims to supersede ${missing.join(", ")} but replaces no such function`;
        }
      }
      out.push({ superseded, by, functions, refusedBecause });
    }
  }
  return out;
}

/** What the catalogue said about one function name. */
export interface CatalogVerdict {
  readonly fn: string;
  /** Overloads whose LIVE body still carries an offending shape. */
  readonly stillLive: string[];
  /** How many overloads were read (0 = the function is not defined at all). */
  readonly overloads: number;
}

export type CatalogReader = (functions: string[]) => Promise<CatalogVerdict[]>;

/**
 * Ask the live catalogue whether any overload of these functions still carries a
 * rule shape in its body. `pg_get_functiondef` is run through the SAME comment
 * and literal stripping the file scan uses, so a body that merely documents the
 * removed shape is not read as carrying it.
 */
export async function readCatalog(functions: string[]): Promise<CatalogVerdict[]> {
  const { loadDbEnv, connectDirect } = await import("./lib/direct-db");
  const env = loadDbEnv();
  if ("missing" in env) {
    throw new Error(`no database credentials (${env.missing.join(", ")} absent)`);
  }
  const client = await connectDirect(env, "check-no-default-organization-sql");
  try {
    const verdicts: CatalogVerdict[] = [];
    for (const fn of functions) {
      const [schema, name] = fn.split(".");
      const { rows } = await client.query<{ sig: string; def: string }>(
        `select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1 and p.proname = $2`,
        [schema, name],
      );
      const stillLive = rows
        .filter((r) => {
          const code = executableSql(r.def);
          return RULES.some((rule) => code.split("\n").some((l) => rule.pattern.test(l)));
        })
        .map((r) => r.sig);
      verdicts.push({ fn, stillLive, overloads: rows.length });
    }
    return verdicts;
  } finally {
    await client.end();
  }
}


// ---------------------------------------------------------------------------
// THE CENSUS — EVERY LIVE FUNCTION BODY, NOT ONLY THE ONES A HEADER NAMES.
//
// 🚨 WHY THIS EXISTS (DEFAULT-ORG-4, 2026-09-22). Clause 3 above asks the
// catalogue a question it was HANDED: "is the shape gone from the functions this
// `-- supersedes-function:` header names?" Every function nobody thought to name
// is outside the question, so the guard reported OK on a database carrying
// SEVENTEEN live bodies with the shape. DEFAULT-ORG-3 found them by hand and
// wrote them into a BUILD-LOG row, which is a note, not a guard.
//
// A guard that can only see what a header points at measures the headers. This
// clause measures THE DATABASE: `pg_get_functiondef` for every function in every
// non-system schema, through the same comment/literal stripping the file scan
// uses, matched against the same RULES. Nobody has to remember to declare a
// function for it to be counted — it is counted because it is live.
//
// Two ways out, both declared and both checkable:
//
//   • CENSUS_PRIMITIVES — the display preference itself and the constraint that
//     keeps it honest. `iam.default_organization_id` IS the preference a person
//     states; forbidding it from naming itself would forbid the preference from
//     existing. Named one by one, with the reason, never a pattern.
//
//   • `-- personal-organization-creation: <schema.fn> — <why>` INSIDE THE BODY.
//     Creating a person's own personal organization at provisioning is not
//     substituting one: the organization being created IS the answer, and there
//     is nothing to guess. The declaration lives in the body, so
//     `pg_get_functiondef` carries it and the claim is read off the live
//     database rather than off a promise in a file.
//
// Everything else live is RED, BY NAME. The ratchet
// (`scripts/no-default-organization-live-bodies.ratchet.json`) does not forgive
// anything — it says WHO OWNS each remaining body, so a red run is a work list
// rather than a mystery. A live body absent from it is louder: nobody owns it,
// so it is new. A ratchet entry whose body is no longer live is itself an error:
// the list only ever shrinks, and the guard is what makes it shrink.
//
// NEVER A COUNT. "17 violations" is a number somebody argues down; seventeen
// names are seventeen pieces of work.
// ---------------------------------------------------------------------------

/**
 * The live bodies that are ALLOWED to name a default organization, one by one,
 * with the reason. Keyed by `schema.name` — every overload of these is exempt,
 * because the exemption is about what the function IS.
 */
export const CENSUS_PRIMITIVES: Record<string, string> = {
  "iam.default_organization_id":
    "THE display preference itself. This is the primitive the law permits: a per-client " +
    "preference a person states, readable by the org picker and pure UI display. A guard " +
    "that flagged it would forbid the one permitted shape from existing.",
  "iam._default_organization_is_a_membership":
    "The constraint trigger that keeps that preference honest — it refuses a stated default " +
    "that is not an organization the person is actually a member of. It names the column in " +
    "order to police it.",
};

/** `-- personal-organization-creation: <schema.fn> — <why>`, in a file or in a live body. */
export function declaredCreationSites(source: string): { fn: string; why: string }[] {
  return [
    ...source.matchAll(
      /^\s*--\s*personal-organization-creation:\s*([A-Za-z_][\w$]*\.[A-Za-z_][\w$]*)\s*(?:[-—–:]\s*)?(.*)$/gim,
    ),
  ].map((m) => ({ fn: m[1]!.toLowerCase(), why: (m[2] ?? "").trim() }));
}

/** One live function body, as the census read it. */
export interface CensusEntry {
  /** `public.wsp_upsert_system_task(text,text,...)` — the identity, never a bare name. */
  readonly sig: string;
  /** `schema.name`, for the primitive exemption and the ratchet's readability. */
  readonly qualified: string;
  /** Which RULES its executable body matched. */
  readonly rules: number[];
  /** The `-- personal-organization-creation:` reason found in the body, if any. */
  readonly creationDeclared: string | null;
}

export type CensusReader = () => Promise<CensusEntry[]>;

/**
 * Read EVERY function body in the database and match it against the RULES. No
 * argument: there is no list to pass, which is the entire point of this clause.
 */
export async function readLiveCensus(): Promise<CensusEntry[]> {
  const { loadDbEnv, connectDirect } = await import("./lib/direct-db");
  const env = loadDbEnv();
  if ("missing" in env) {
    throw new Error(`no database credentials (${env.missing.join(", ")} absent)`);
  }
  const client = await connectDirect(env, "check-no-default-organization-sql --census");
  try {
    const { rows } = await client.query<{ sig: string; qualified: string; def: string }>(
      // The signature is built rather than taken from ::regprocedure, which drops
      // the schema for anything on the search_path — and a ratchet keyed by name has
      // to name the thing unambiguously. ARGUMENT TYPES, never argument names:
      // renaming a parameter must not silently orphan a ratchet row.
      `select n.nspname || '.' || p.proname || '(' ||
                coalesce(pg_catalog.oidvectortypes(p.proargtypes), '') || ')' as sig,
              n.nspname || '.' || p.proname   as qualified,
              pg_get_functiondef(p.oid)       as def
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname not in ('pg_catalog', 'information_schema')
          and p.prokind = 'f'`,
    );
    const out: CensusEntry[] = [];
    for (const r of rows) {
      const code = executableSql(r.def);
      const lines = code.split("\n");
      const rules = RULES.filter((rule) =>
        lines.some((l) => {
          // The primitive's own CREATE header is not a call — same carve-out the
          // file scan makes, for the same reason.
          if (
            rule.id === 7 &&
            /create\s+(?:or\s+replace\s+)?function\s+(?:[\w]+\.)?(?:ensure_personal_organization|current_personal_org_id)\s*\(/i.test(
              l,
            )
          ) {
            return false;
          }
          return rule.pattern.test(l);
        }),
      ).map((rule) => rule.id);
      if (rules.length === 0) continue;
      // The declaration is read from the RAW definition: `executableSql` strips
      // comments, and the declaration is deliberately a comment so that it
      // travels with the body instead of doing anything.
      const declared = declaredCreationSites(r.def).find((d) => d.fn === r.qualified.toLowerCase());
      out.push({
        sig: r.sig,
        qualified: r.qualified,
        rules,
        creationDeclared: declared ? declared.why || "(no reason given)" : null,
      });
    }
    return out.sort((a, b) => a.sig.localeCompare(b.sig));
  } finally {
    await client.end();
  }
}

export interface RatchetEntry {
  readonly lane: string;
  readonly note?: string;
}

export function loadLiveRatchet(): Record<string, RatchetEntry> {
  try {
    return JSON.parse(readFileSync(LIVE_RATCHET, "utf8"));
  } catch {
    return {};
  }
}

export interface CensusVerdict {
  /** Live bodies that must stop carrying the shape, by name, in catalogue order. */
  readonly open: { sig: string; rules: number[]; lane: string | null }[];
  /** Bodies exempt because they ARE the permitted primitive. */
  readonly primitives: string[];
  /** Bodies exempt because the body itself declares it CREATES the organization. */
  readonly creation: { sig: string; why: string }[];
  /** Ratchet names no longer live — the list only shrinks, so these must go. */
  readonly stale: string[];
}

/**
 * The judgement, as a pure function of what the catalogue said and what the
 * ratchet claims — so the self-test can prove it RED and GREEN without a
 * database, which is the only way anybody ever watches a guard fail.
 */
export function censusVerdict(
  entries: CensusEntry[],
  ratchet: Record<string, RatchetEntry>,
): CensusVerdict {
  const open: { sig: string; rules: number[]; lane: string | null }[] = [];
  const primitives: string[] = [];
  const creation: { sig: string; why: string }[] = [];
  for (const e of entries) {
    if (CENSUS_PRIMITIVES[e.qualified.toLowerCase()]) {
      primitives.push(e.sig);
      continue;
    }
    if (e.creationDeclared) {
      creation.push({ sig: e.sig, why: e.creationDeclared });
      continue;
    }
    open.push({ sig: e.sig, rules: e.rules, lane: ratchet[e.sig]?.lane ?? null });
  }
  const live = new Set(open.map((o) => o.sig));
  const stale = Object.keys(ratchet)
    .filter((sig) => !live.has(sig))
    .sort();
  return { open, primitives, creation, stale };
}

/** Print the verdict the way it has to be read: names, never a count. */
export function reportCensus(v: CensusVerdict): number {
  for (const c of v.creation) {
    console.log(
      `check-no-default-organization-sql: ${c.sig} CREATES the personal organization it names — ` +
        `declared in its own body: ${c.why}`,
    );
  }
  for (const p of v.primitives) {
    console.log(
      `check-no-default-organization-sql: ${p} is the display preference itself (CENSUS_PRIMITIVES).`,
    );
  }
  if (v.open.length === 0 && v.stale.length === 0) {
    console.log(
      "check-no-default-organization-sql: THE CENSUS IS CLEAN — every live function body in the " +
        "database was read, and none of them answers 'which organization?' with the caller's own.",
    );
    return 0;
  }
  if (v.open.length > 0) {
    console.error(
      `\ncheck-no-default-organization-sql: THE LIVE CATALOGUE STILL CARRIES THE SHAPE.\n` +
        `Every function body in the database was read. These answer "which organization?"\n` +
        `with the caller's own personal workspace, or read a stated default to route a write:\n`,
    );
    for (const o of v.open) {
      console.error(
        `  ${o.sig}  [rule ${o.rules.join(", ")}]  ` +
          (o.lane
            ? `owned by ${o.lane}`
            : `🚨 NO LANE OWNS THIS — it is not in scripts/no-default-organization-live-bodies.ratchet.json, ` +
              `so it is NEW. Fix it here, or add it with the lane that will.`),
      );
    }
    console.error(
      `\n  Remedy: the organization comes from the record, from the membership ladder, or from the\n` +
        `  door's own argument — and where none of those answers, the call is REFUSED (23502 naming\n` +
        `  the argument). A body that legitimately CREATES a person's personal organization at\n` +
        `  provisioning says so in its own body:\n` +
        `      -- personal-organization-creation: <schema.fn> — <why the created org IS the answer>\n`,
    );
  }
  for (const sig of v.stale) {
    console.error(
      `\ncheck-no-default-organization-sql: the ratchet still lists ${sig}, which no longer carries\n` +
        `  the shape. The list only ever SHRINKS — remove that entry.\n`,
    );
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Self-test — it must FLAG a newly written violating file and must NOT flag a
// compliant one, including the ones that merely EXPLAIN the removed shape in a
// comment. A guard nobody has watched fail is not a guard.
// ---------------------------------------------------------------------------

const PLANTS: Record<string, string> = {
  "__self_test_r6__.sql": `create or replace function x.y() returns uuid language sql as $$
  select default_organization_id from users.user_preferences where user_id = auth.uid();
$$;`,
  "__self_test_r7__.sql": `create or replace function x.y() returns trigger language plpgsql as $$
begin
  new.organization_id := public.ensure_personal_organization(auth.uid());
  return new;
end $$;`,
  "__self_test_r8__.sql": `create trigger _stamp_org_default before insert on some.table
  for each row execute function public._stamp_org_default();`,
};

const COMPLIANT: Record<string, string> = {
  // The shape every FIXING migration has: it quotes what it removed.
  "__self_test_ok_comment__.sql": `-- This used to read default_organization_id and call
-- ensure_personal_organization(actor), and attached _stamp_org_default.
-- create trigger _stamp_org_default before insert on some.table ...
create or replace function x.y() returns uuid language sql as $$
  select organization_id from iam.memberships where user_id = auth.uid() limit 1;
$$;`,
  // Parent-inherit is explicitly fine: it CARRIES an organization.
  "__self_test_ok_inherit__.sql": `create trigger _inherit_org before insert on child.table
  for each row execute function platform.inherit_org_from_parent('parent','table','parent_id');`,
  // Rewriting the primitive's own header is not a caller substituting a tenant.
  "__self_test_ok_define__.sql": `create or replace function public.current_personal_org_id()
returns uuid language sql as $$
  select iam.personal_org_id((select auth.uid()));
$$;`,
  // A DECLARED CREATION SITE that really does replace what it names. Creating the
  // person's own personal organization at provisioning is not substituting one.
  "__self_test_ok_creation__.sql": `-- personal-organization-creation: zz_selftest.provision — the organization being created IS the answer.
create or replace function zz_selftest.provision() returns trigger language plpgsql as $$
begin
  perform public.ensure_personal_organization(new.id);
  return new;
end $$;`,
};

/**
 * The creation declaration must not become an allow-list with a nicer name. Each
 * of these carries it and must STILL be flagged.
 */
const CREATION_NEAR_MISSES: Record<string, number> = {
  // Declares a function it does not touch — the header points at nothing.
  "__self_test_creation_empty__.sql": 7,
  // Declares creation and then reads somebody's STATED default (rule 6), which is
  // a different thing entirely and is never what provisioning needs.
  "__self_test_creation_reads_default__.sql": 6,
};

const CREATION_NEAR_MISS_BODIES: Record<string, string> = {
  "__self_test_creation_empty__.sql": `-- personal-organization-creation: zz_selftest.not_here — claims a creation site it never writes.
create or replace function zz_selftest.something_entirely_else() returns trigger language plpgsql as $$
begin
  new.organization_id := public.ensure_personal_organization(new.created_by);
  return new;
end $$;`,
  "__self_test_creation_reads_default__.sql": `-- personal-organization-creation: zz_selftest.provision_reads — provisioning does not read a preference.
create or replace function zz_selftest.provision_reads() returns trigger language plpgsql as $$
begin
  new.organization_id := iam.default_organization_id(new.id);
  return new;
end $$;`,
};

/**
 * The supersession half of the self-test. Four pairs: one that must be forgiven
 * and three near-misses that must not be, because every one of them is a way a
 * `-- supersedes:` header could become an allow-list by another name.
 */
const SUPERSESSION_PLANTS: Record<string, string> = {
  // FORGIVEN: a clean later file that really does replace the named function.
  "__self_test_sup_old_good__.sql": `create or replace function zz_selftest.audit_writer(p_actor uuid)
returns void language sql as $$
  select iam.default_organization_id(p_actor);
$$;`,
  "__self_test_sup_new_good__.sql": `-- supersedes: migrations/__self_test_sup_old_good__.sql
-- supersedes-function: zz_selftest.audit_writer
create or replace function zz_selftest.audit_writer(p_actor uuid, p_org uuid)
returns void language sql as $$
  select p_org;
$$;`,

  // NOT FORGIVEN: the superseding file carries the same shape itself.
  "__self_test_sup_old_dirty__.sql": `create or replace function zz_selftest.dirty_writer(p_actor uuid)
returns void language sql as $$
  select iam.default_organization_id(p_actor);
$$;`,
  "__self_test_sup_new_dirty__.sql": `-- supersedes: migrations/__self_test_sup_old_dirty__.sql
-- supersedes-function: zz_selftest.dirty_writer
create or replace function zz_selftest.dirty_writer(p_actor uuid, p_org uuid)
returns void language sql as $$
  select coalesce(p_org, iam.default_organization_id(p_actor));
$$;`,

  // NOT FORGIVEN: the header claims a supersession the file never carries out.
  "__self_test_sup_old_empty__.sql": `create or replace function zz_selftest.empty_writer(p_actor uuid)
returns void language sql as $$
  select iam.default_organization_id(p_actor);
$$;`,
  "__self_test_sup_new_empty__.sql": `-- supersedes: migrations/__self_test_sup_old_empty__.sql
-- supersedes-function: zz_selftest.empty_writer
create or replace function zz_selftest.something_else(p_org uuid)
returns void language sql as $$
  select p_org;
$$;`,

  // NOT FORGIVEN: no `-- supersedes-function:` at all, so the catalogue cannot be asked.
  "__self_test_sup_old_unnamed__.sql": `create or replace function zz_selftest.unnamed_writer(p_actor uuid)
returns void language sql as $$
  select iam.default_organization_id(p_actor);
$$;`,
  "__self_test_sup_new_unnamed__.sql": `-- supersedes: migrations/__self_test_sup_old_unnamed__.sql
create or replace function zz_selftest.unnamed_writer(p_actor uuid, p_org uuid)
returns void language sql as $$
  select p_org;
$$;`,
};

/** file -> is its violation expected to survive supersession? */
const SUPERSESSION_EXPECT: Record<string, boolean> = {
  "__self_test_sup_old_good__.sql": false,
  "__self_test_sup_old_dirty__.sql": true,
  "__self_test_sup_old_empty__.sql": true,
  "__self_test_sup_old_unnamed__.sql": true,
};

function selfTest(): number {
  // The plants live in a PRIVATE temp checkout, never in migrations/: a file there is seen by
  // every other check scripts/checks/run.mjs runs in parallel (and by the release's migration
  // sweep), and a concurrent `git add` of this shared checkout could commit it.
  const box = mkdtempSync(join(tmpdir(), "no-default-org-sql-selftest-"));
  const dir = join(box, SCAN_DIR);
  mkdirSync(dir, { recursive: true });
  let ok = true;
  const say = (pass: boolean, msg: string) => {
    if (!pass) ok = false;
    console.log(`[self-test] ${pass ? "ok  " : "FAIL"} ${msg}`);
  };
  try {
    for (const [name, body] of Object.entries({
      ...PLANTS,
      ...COMPLIANT,
      ...SUPERSESSION_PLANTS,
      ...CREATION_NEAR_MISS_BODIES,
    })) {
      writeFileSync(join(dir, name), body, "utf8");
    }
    // Scan with an EMPTY allowlist so frozen history cannot mask the plants.
    const found = scan({}, box);
    for (const name of Object.keys(PLANTS)) {
      const rule = Number(name.match(/r(\d+)/)![1]);
      const hit = found.some((v) => v.file.endsWith(name) && v.rule === rule);
      say(hit, `rule ${rule}: a NEWLY ADDED violating migration is FLAGGED = ${hit} (expected true)`);
    }
    for (const name of Object.keys(COMPLIANT)) {
      const hit = found.some((v) => v.file.endsWith(name));
      say(
        !hit,
        `compliant: ${name} is flagged = ${hit} (expected false)`,
      );
    }
    for (const [name, rule] of Object.entries(CREATION_NEAR_MISSES)) {
      const hit = found.some((v) => v.file.endsWith(name) && v.rule === rule);
      say(
        hit,
        `creation declaration is not an allow-list: ${name} is STILL flagged on rule ${rule} = ${hit} (expected true)`,
      );
    }

    // SUPERSESSION. Every plant violates rule 6 on its own bytes — the question
    // is only whether a later file's claim answers it. The catalogue half is
    // stubbed here (these functions do not exist anywhere), so what is measured
    // is exactly clauses 1 and 2.
    const files = collectFiles(box);
    const byFile = new Map<string, Violation[]>();
    for (const v of found) byFile.set(v.file, [...(byFile.get(v.file) ?? []), v]);
    const claims = readSupersessions(files, byFile);
    for (const [name, expectKept] of Object.entries(SUPERSESSION_EXPECT)) {
      const rel = `migrations/${name}`;
      const flagged = found.some((v) => v.file === rel);
      const claim = claims.find((c) => c.superseded === rel);
      const forgiven = flagged && claim != null && claim.refusedBecause === null;
      const kept = flagged && !forgiven;
      say(
        flagged,
        `supersession: ${name} violates rule 6 on its own bytes = ${flagged} (expected true)`,
      );
      say(
        kept === expectKept,
        expectKept
          ? `supersession: ${name} is NOT forgiven = ${kept} (expected true — ${claim?.refusedBecause ?? "no claim"})`
          : `supersession: ${name} IS forgiven by its superseding file = ${forgiven} (expected true)`,
      );
    }
    // ── THE CENSUS, proved RED and GREEN without a database ────────────────
    // `censusVerdict` is a pure function of what the catalogue said and what the
    // ratchet claims, precisely so that it can be watched failing here. Nobody
    // trusts a clause they have only ever seen pass.
    const entry = (
      sig: string,
      qualified: string,
      creationDeclared: string | null = null,
    ): CensusEntry => ({ sig, qualified, rules: [7], creationDeclared });

    const red = censusVerdict(
      [
        entry("public.wsp_upsert_system_task(text)", "public.wsp_upsert_system_task"),
        entry("public.somebody_elses_new_door(uuid)", "public.somebody_elses_new_door"),
        entry("iam.default_organization_id(uuid)", "iam.default_organization_id"),
        entry(
          "public._provision_new_user_profile()",
          "public._provision_new_user_profile",
          "the organization being created IS the answer",
        ),
      ],
      {
        "public.wsp_upsert_system_task(text)": { lane: "DEFAULT-ORG-4" },
        "public.a_body_that_is_no_longer_live()": { lane: "SOME-OLD-LANE" },
      },
    );
    say(
      red.open.length === 2 &&
        red.open[0]!.lane === "DEFAULT-ORG-4" &&
        red.open[1]!.lane === null,
      `census: a live body is OPEN and carries its owning lane; one nobody owns carries none ` +
        `(open = ${red.open.map((o) => `${o.sig}:${o.lane ?? "UNOWNED"}`).join(", ")})`,
    );
    say(
      red.primitives.length === 1 && red.primitives[0] === "iam.default_organization_id(uuid)",
      `census: the display preference itself is NOT a violation (primitives = ${red.primitives.join(", ")})`,
    );
    say(
      red.creation.length === 1 &&
        red.creation[0]!.sig === "public._provision_new_user_profile()",
      `census: a body that DECLARES it creates the organization is not a violation ` +
        `(creation = ${red.creation.map((c) => c.sig).join(", ")})`,
    );
    say(
      red.stale.length === 1 &&
        red.stale[0] === "public.a_body_that_is_no_longer_live()",
      `census: a ratchet entry whose body is gone is an ERROR — the list only shrinks ` +
        `(stale = ${red.stale.join(", ")})`,
    );

    // The verdict, not just its parts: RED must exit 1, GREEN must exit 0.
    const quiet = { log: console.log, error: console.error };
    console.log = () => {};
    console.error = () => {};
    const redCode = reportCensus(red);
    const greenCode = reportCensus(
      censusVerdict(
        [entry("iam.default_organization_id(uuid)", "iam.default_organization_id")],
        {},
      ),
    );
    console.log = quiet.log;
    console.error = quiet.error;
    say(redCode === 1, `census: a dirty catalogue exits ${redCode} (expected 1)`);
    say(greenCode === 0, `census: a clean catalogue exits ${greenCode} (expected 0)`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
  console.log(
    ok
      ? "check-no-default-organization-sql --self-test: OK — it catches a NEW file and spares the ones that only explain the old shape."
      : "check-no-default-organization-sql --self-test: FAILED — the guard does not do what it claims.",
  );
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();

  const found = scan();
  const files = collectFiles();
  const byFile = new Map<string, Violation[]>();
  for (const v of found) byFile.set(v.file, [...(byFile.get(v.file) ?? []), v]);

  const claims = readSupersessions(files, byFile).filter((c) => byFile.has(c.superseded));
  const standing = claims.filter((c) => c.refusedBecause === null);

  // CLAUSE 3 — the catalogue. It is the half a header cannot argue with, so it is
  // asked whenever the credentials are here, and its absence is SAID rather than
  // assumed away.
  const wanted = [...new Set(standing.flatMap((c) => c.functions))];
  let catalog: CatalogVerdict[] | null = null;
  let catalogSkipped: string | null = null;
  if (wanted.length > 0) {
    try {
      catalog = await readCatalog(wanted);
    } catch (err) {
      catalogSkipped = err instanceof Error ? err.message : String(err);
    }
  }

  const stillLive = new Map<string, string[]>();
  for (const v of catalog ?? []) if (v.stillLive.length > 0) stillLive.set(v.fn, v.stillLive);

  const forgiven: Supersession[] = [];
  const forgivenFiles = new Set<string>();
  for (const c of standing) {
    const live = c.functions.filter((fn) => stillLive.has(fn));
    if (live.length > 0) {
      console.error(
        `\ncheck-no-default-organization-sql: ${c.by} claims to supersede ${c.superseded},\n` +
          `  but the LIVE catalogue still holds that shape in: ${live
            .flatMap((fn) => stillLive.get(fn)!)
            .join(", ")}.\n` +
          `  Remedy: apply the superseding migration, or fix the body that is actually live.\n`,
      );
      continue;
    }
    forgiven.push(c);
    forgivenFiles.add(c.superseded);
  }

  const violations = found.filter((v) => !forgivenFiles.has(v.file));

  for (const c of claims) {
    if (c.refusedBecause === null) continue;
    console.error(
      `\ncheck-no-default-organization-sql: ${c.by}'s \`-- supersedes: ${c.superseded}\` does not hold —\n` +
        `  ${c.refusedBecause}.\n`,
    );
  }

  for (const c of forgiven) {
    console.log(
      `check-no-default-organization-sql: ${c.superseded} is applied history, superseded by ${c.by} ` +
        `(${c.functions.join(", ")}${
          catalog ? " — confirmed gone from the live catalogue" : " — catalogue NOT consulted"
        }).`,
    );
  }
  if (catalogSkipped) {
    console.log(
      `check-no-default-organization-sql: THE CATALOGUE WAS NOT ASKED — ${catalogSkipped}. ` +
        `${forgiven.length} supersession claim(s) rest on their source proof alone here. ` +
        `Run this where the five SUPABASE_MATRIX_* variables resolve (any developer machine, ` +
        `or \`pnpm check:no-default-organization-sql\` locally) to close that half.`,
    );
  }

  // ── THE CENSUS — every live body, not only the ones a header names ─────────
  let censusCode = 0;
  try {
    const entries = await readLiveCensus();
    censusCode = reportCensus(censusVerdict(entries, loadLiveRatchet()));
  } catch (err) {
    console.log(
      `check-no-default-organization-sql: THE CENSUS DID NOT RUN — ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Nothing here has read the live function bodies, so this run cannot say the database is ` +
        `clean — only that the FILES are. Run it where the five SUPABASE_MATRIX_* variables ` +
        `resolve (any developer machine) to close that half.`,
    );
  }

  if (violations.length === 0) {
    if (censusCode === 0) {
      console.log(
        "check-no-default-organization-sql: OK — no migration picks an organization for the user.",
      );
    }
    return censusCode;
  }
  console.error(
    `\ncheck-no-default-organization-sql: ${violations.length} violation(s).\n`,
  );
  for (const v of violations) {
    const rule = RULES.find((r) => r.id === v.rule)!;
    console.error(`  ${v.file}:${v.line}  [rule ${v.rule}] ${rule.what}`);
    console.error(`      ${v.detail}`);
    console.error(`      remedy: ${rule.remedy}\n`);
  }
  console.error(
    "An APPLIED file whose shape a later migration has already replaced is declared in that\n" +
      "later file's header — `-- supersedes: <path>` plus `-- supersedes-function: <schema.fn>` —\n" +
      "and is forgiven only when the live catalogue agrees the body is gone. That is not an\n" +
      "allow-list: it is a claim about the database, and the database is asked.\n" +
      "scripts/no-default-organization-sql.allowlist.json is frozen applied history from before\n" +
      "this guard existed and only ever shrinks — a NEW file never belongs in it.\n" +
      "Law: docs/handoffs/default-org-annihilation.md\n",
  );
  return 1;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error("check-no-default-organization-sql: unexpected error", err);
    exitAfterDrain(2);
  });
