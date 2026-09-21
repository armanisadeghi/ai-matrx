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
 * FROZEN HISTORY IS A RATCHET, NOT AN AMNESTY.
 * `scripts/no-default-organization-sql.allowlist.json` pins the migration files
 * that ALREADY carried these shapes when this guard was written. They are
 * applied history: editing them changes nothing on the database and silently
 * desynchronises their ledger checksum, so they cannot be "fixed" in place —
 * they are superseded by new files (which is what F1 and F2 did). Every file
 * NOT in that list — every file written from now on — must be clean. The list
 * only ever shrinks.
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
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIR = "migrations";
const ALLOWLIST = join(ROOT, "scripts", "no-default-organization-sql.allowlist.json");

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
function executableSql(source: string): string {
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
): Violation[] {
  const violations: Violation[] = [];
  for (const full of walk(join(ROOT, SCAN_DIR))) {
    const rel = relative(ROOT, full).split("\\").join("/");
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    for (const v of scanSource(rel, source)) {
      const entry = allowlist[rel];
      if (entry && entry.rules.includes(v.rule)) continue;
      violations.push(v);
    }
  }
  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.rule - b.rule || a.line - b.line,
  );
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
};

function selfTest(): number {
  const dir = join(ROOT, SCAN_DIR);
  const written: string[] = [];
  let ok = true;
  const say = (pass: boolean, msg: string) => {
    if (!pass) ok = false;
    console.log(`[self-test] ${pass ? "ok  " : "FAIL"} ${msg}`);
  };
  try {
    for (const [name, body] of Object.entries({ ...PLANTS, ...COMPLIANT })) {
      const p = join(dir, name);
      writeFileSync(p, body, "utf8");
      written.push(p);
    }
    // Scan with an EMPTY allowlist so frozen history cannot mask the plants.
    const found = scan({});
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
  } finally {
    for (const p of written) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  }
  console.log(
    ok
      ? "check-no-default-organization-sql --self-test: OK — it catches a NEW file and spares the ones that only explain the old shape."
      : "check-no-default-organization-sql --self-test: FAILED — the guard does not do what it claims.",
  );
  return ok ? 0 : 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();

  const violations = scan();
  if (violations.length === 0) {
    console.log(
      "check-no-default-organization-sql: OK — no migration picks an organization for the user.",
    );
    return 0;
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
    "A migration that is genuinely an exception goes in\n" +
      "scripts/no-default-organization-sql.allowlist.json WITH A REASON. That list is\n" +
      "frozen applied history and only ever shrinks — a NEW file never belongs in it.\n" +
      "Law: docs/handoffs/default-org-annihilation.md\n",
  );
  return 1;
}

try {
  exitAfterDrain(main());
} catch (err) {
  console.error("check-no-default-organization-sql: unexpected error", err);
  exitAfterDrain(2);
}
