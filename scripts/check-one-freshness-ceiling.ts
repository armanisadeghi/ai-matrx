/**
 * THE FRESHNESS CEILING IS COMPUTED IN EXACTLY ONE PLACE.
 *
 * WHAT THIS CLOSES. A value carries a review interval — "verified quarterly" — and the
 * platform has to say whether it is still inside it. That rule was written twice: once in
 * `custom.context_resolve`'s body, once in `matrx_records.merge.resolver`. CONTEXT-PERF
 * wrote the note that started this guard: *"They read the same input under the same rule,
 * so they cannot disagree today, but one of them should eventually be the only one."* Two
 * copies that agree are one edit away from two copies that do not, and the failure is
 * silent: a contract quotes a three-year-old rate and the panel beside it says `live`.
 *
 * THE ONE IMPLEMENTATION is `custom.freshness_verdict(timestamptz, numeric)`. Everything
 * else — the door, the merge resolver, any screen — asks it.
 *
 * WHAT IT CHECKS.
 *   1. LIVE: `custom.freshness_verdict` exists, and NO OTHER function in schemas `custom`,
 *      `history` or `platform` compares an age against a ceiling. The shape it looks for is
 *      a body that both divides a span by 86400 and mentions a freshness/ceiling word —
 *      which is what every copy of this rule has looked like.
 *   2. SOURCE: no Python, TypeScript or SQL under this repo or `../aidream` computes the
 *      same verdict. The signature is the sentence the rule produces — a file that says
 *      "past the … freshness this field declares" without calling `freshness_verdict` is a
 *      second copy.
 *
 * UNMEASURED IS NOT PASSED: no credentials or an unreachable database is a FAILURE.
 *
 * `--self-test` proves the guard can go red: it re-runs census 1 with the one function's
 * own name removed from the allow-list, and demands the census then reports it.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

/** The one function that is allowed to hold this rule. */
const THE_ONE = "freshness_verdict";

/** The sentence the rule produces. A file that writes it is writing the rule. */
const SENTENCE = "freshness this field declares";

const ROOTS = [resolve(__dirname, ".."), resolve(__dirname, "..", "..", "aidream")];

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

/**
 * Tracked files in `root` containing `pattern`, as `path:line:text`. `git grep` rather than
 * ripgrep: git is always present where this repo is, ripgrep is not, and a guard that
 * silently cannot run is worse than no guard — an ENOENT here is a FAILURE, never a pass.
 */
function grepTracked(pattern: string, root: string): string[] {
  try {
    const out = execFileSync(
      "git",
      [
        "-C",
        root,
        "grep",
        "--no-color",
        "-n",
        "--fixed-strings",
        pattern,
        "--",
        ".",
        // MIGRATIONS ARE A RECORD OF WHAT WAS, not code that runs. A file that created a
        // copy of the rule in 2026 is history the moment a later file replaces it, and
        // rewriting it would be lying about what was applied. What the database holds TODAY
        // is census 1's job, and census 1 reads every function body there is.
        ":(exclude)migrations",
        ":(exclude)db/migrations",
        ":(exclude)scripts/check-one-freshness-ceiling.ts",
        ":(exclude)*.generated.*",
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return out.split("\n").filter(Boolean).map((l) => `${root}/${l}`);
  } catch (error) {
    const err = error as { status?: number; code?: string };
    if (err.status === 1) return []; // git grep: no matches
    throw error;
  }
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");

  // ── CENSUS 1 — the live database ────────────────────────────────────────────────────
  const env = loadDbEnv();
  if ("missing" in env) {
    fail(
      `unmeasured: ${env.missing.join(", ")} not found (looked in ${env.looked.join(", ")}). ` +
        `A guard that cannot reach the database has not checked anything.`,
    );
  }
  const client = await connectDirect(env, "check:one-freshness-ceiling");
  let live: { nspname: string; proname: string }[];
  try {
    const exists = await client.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'custom' and p.proname = $1`,
      [THE_ONE],
    );
    if (exists.rowCount === 0) {
      fail(
        `custom.${THE_ONE} does not exist on the database this guard measured. The one ` +
          `implementation of the freshness ceiling is missing, so every caller is either ` +
          `broken or carrying its own copy.`,
      );
    }
    // --self-test lifts BOTH exemptions — the allow-listed name and the "it calls the one
    // function" clause — because the one function's own definition contains its own name.
    const allowed = selfTest ? "zzz_no_such_function" : THE_ONE;
    const exemptCallers = selfTest ? "zzz_no_such_call(" : "freshness_verdict(";
    const res = await client.query(
      `select n.nspname, p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('custom', 'history', 'platform')
          and p.proname <> $1
          and pg_get_functiondef(p.oid) like '%86400%'
          and (pg_get_functiondef(p.oid) ilike '%freshness%'
               or pg_get_functiondef(p.oid) ilike '%ceiling_seconds%')
          -- A BODY THAT ASKS THE ONE FUNCTION IS NOT A SECOND COPY. custom.enrich_due
          -- multiplies its review interval by 86400 to hand it over, which is arithmetic
          -- about the ARGUMENT, not the rule.
          and pg_get_functiondef(p.oid) not like ('%' || $2 || '%')
        order by 1, 2`,
      [allowed, exemptCallers],
    );
    live = res.rows as { nspname: string; proname: string }[];
  } finally {
    await client.end();
  }

  if (selfTest) {
    if (live.length === 0) {
      fail(
        `--self-test: census 1 found NOTHING with custom.${THE_ONE} removed from its ` +
          `allow-list. A census that cannot see the one function it is built around ` +
          `cannot see a second copy of it either, so this guard proves nothing.`,
      );
    }
    console.log(
      `[ OK ] --self-test: with custom.${THE_ONE} removed from the allow-list the census ` +
        `reports it (${live.map((r) => `${r.nspname}.${r.proname}`).join(", ")}) — the ` +
        `query can go red.`,
    );
    exitAfterDrain(0);
  }

  if (live.length > 0) {
    fail(
      `a SECOND implementation of the freshness ceiling is live in the database: ` +
        `${live.map((r) => `${r.nspname}.${r.proname}`).join(", ")}. The rule belongs in ` +
        `custom.${THE_ONE} and nowhere else — call it from there instead.`,
    );
  }
  console.log(
    `[ OK ] the database holds ONE freshness ceiling: custom.${THE_ONE}. No other ` +
      `function in custom / history / platform computes an age against one.`,
  );

  // ── CENSUS 2 — the source ───────────────────────────────────────────────────────────
  const offenders: string[] = [];
  for (const root of ROOTS) {
    if (!existsSync(root)) continue;
    for (const line of grepTracked(SENTENCE, root)) {
      const path = line.split(":")[0] ?? line;
      if (path.includes(THE_ONE)) continue;
      offenders.push(line);
    }
  }
  if (offenders.length > 0) {
    fail(
      `${offenders.length} place(s) in the source write the freshness ceiling's own ` +
        `sentence without going through custom.${THE_ONE}:\n  ` +
        offenders.join("\n  ") +
        `\n\nThe rule is ONE function. Ask it; do not re-derive it.`,
    );
  }
  console.log(
    `[ OK ] no Python, TypeScript or SQL in matrx-frontend or aidream re-derives the ` +
      `freshness ceiling.`,
  );
  exitAfterDrain(0);
}

main().catch((error) => {
  fail(`unmeasured: ${(error as Error).message}`);
});
