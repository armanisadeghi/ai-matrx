/**
 * THE CLIENT NEVER WRITES A TABLE IT HAS NO GRANT ON.
 *
 * WHAT THIS CLOSES. On 2026-09-17 `/acquisition/blocks` shipped a bulk "Try again"
 * that marked rows `retrying` with supabase-js. `platform.acquisition_block` is the
 * `ledger` variant, and a ledger grants `authenticated` SELECT and nothing else — so
 * EVERY press failed with `42501 permission denied for table acquisition_block`,
 * silently, into the browser console. Nobody found it for a day, and only then
 * because an independent verifier pressed the button for the first time. Type-check
 * was green, the build was green, the row read fine, and the write could never work.
 *
 * WHY THIS CLASS IS INVISIBLE TO EVERY OTHER GATE. A supabase-js write is a string
 * and a method chain: nothing in TypeScript knows what `authenticated` may do, the
 * PostgREST call is made at run time, and `{ error }` is a value a caller is free to
 * ignore. The only thing that can answer "may the browser really do this?" is the
 * live catalog — so this check reads it.
 *
 * WHAT IT DOES. Finds every schema-qualified supabase write in client code
 * (`.schema("x").from("y")…insert|update|upsert|delete(`), asks the live database
 * which privileges `authenticated` actually holds on that table, and fails on any
 * write the role cannot perform.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials, an unreachable database, or an empty
 * answer is a FAILURE with the `LIVE PULL FAILED` banner, never a silent green — a
 * guard that quietly downgrades to "could not check" is how this class got in.
 *
 *   pnpm check:client-writes-are-granted
 *   pnpm check:client-writes-are-granted:self-test   # plant the 2026-09-17 shape, prove RED
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

// pnpm runs every script from the repo root; a scripts-relative path would break
// the moment this is invoked through a different runner.
const ROOT = process.cwd();
const SCANNED = ["features", "lib", "components", "app", "hooks"];
const SKIP = new Set(["node_modules", ".next", "__tests__", "__fixtures__"]);

/**
 * BROWSER CODE ONLY. `app/api/**` runs on the server, and a module that reaches for the
 * service-role client is not speaking as `authenticated` at all — judging either against
 * this role would red-flag code that is correct, and a guard that cries wolf is a guard
 * somebody mutes.
 */
const SERVER_ONLY_PATH = /(^|\/)app\/api\//;
const SERVER_CLIENT = /createAdminClient|service_role|SUPABASE_SERVICE|from ["'`]@\/utils\/supabase\/server["'`]/;

/** PostgREST verb → the SQL privilege it needs. */
const VERB_PRIVILEGE: Record<string, string> = {
  insert: "INSERT",
  upsert: "INSERT",
  update: "UPDATE",
  delete: "DELETE",
};

interface Write {
  file: string;
  line: number;
  schema: string;
  table: string;
  verb: string;
  privilege: string;
}

/**
 * `.schema("s")` … `.from("t")` … `.update(` — the three parts can sit on separate
 * lines with anything in between (a `// comment`, a `@ts-expect-error`), which is
 * exactly how the real offender was written, so the match spans lines rather than
 * requiring one expression on one line.
 */
const WRITE_CHAIN =
  /\.schema\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)[\s\S]{0,400}?\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)[\s\S]{0,400}?\.(insert|upsert|update|delete)\s*\(/g;

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) yield path;
  }
}

function findWrites(extraFiles: { path: string; source: string }[] = []): Write[] {
  const found: Write[] = [];
  const sources: { path: string; source: string }[] = [...extraFiles];
  for (const base of SCANNED) {
    for (const path of walk(join(ROOT, base))) {
      const source = readFileSync(path, "utf8");
      const rel = relative(ROOT, path);
      if (SERVER_ONLY_PATH.test(rel) || SERVER_CLIENT.test(source)) continue;
      sources.push({ path, source });
    }
  }
  for (const { path, source } of sources) {
    WRITE_CHAIN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WRITE_CHAIN.exec(source)) !== null) {
      const [, schema, table, verb] = match;
      found.push({
        file: relative(ROOT, path),
        line: source.slice(0, match.index).split("\n").length,
        schema,
        table,
        verb,
        privilege: VERB_PRIVILEGE[verb],
      });
    }
  }
  return found;
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  exitAfterDrain(1);
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");

  // THE SELF-TEST plants the exact shape that shipped on 2026-09-17 — the schema, the
  // table and the verb, with a comment between the links of the chain — and requires
  // this checker to find and refuse it. A guard nobody has watched fail is a wish.
  const planted = selfTest
    ? [
        {
          path: join(ROOT, "features/__planted__/plantedWrite.ts"),
          source: [
            'await supabase',
            '  .schema("platform")',
            '  // @ts-expect-error — the register is read and written by name',
            '  .from("acquisition_block")',
            '  .update({ status: "retrying" })',
            '  .in("id", ids);',
          ].join("\n"),
        },
      ]
    : [];

  const writes = findWrites(planted);

  if (selfTest && !writes.some((w) => w.table === "acquisition_block")) {
    fail(
      "SELF-TEST FAILED: the planted `platform.acquisition_block` UPDATE was not detected.\n" +
        "This checker can no longer see the shape it exists to catch.",
    );
  }

  const env = loadDbEnv();
  if ("missing" in env) {
    fail(
      "LIVE PULL FAILED — this check is UNMEASURED, which is a failure, not a pass.\n" +
        `Missing: ${env.missing.join(", ")}\nLooked in: ${env.looked.join(", ")}`,
    );
  }

  const client = await connectDirect(env, "check-client-writes-are-granted").catch(
    (error: unknown) => {
      fail(`LIVE PULL FAILED — could not reach the database: ${String(error)}`);
    },
  );

  try {
    const wanted = [...new Set(writes.map((w) => `${w.schema}.${w.table}`))];
    if (wanted.length === 0) {
      console.log("No schema-qualified client writes found. Nothing to check.");
      return;
    }

    const { rows } = await client.query<{
      tbl: string;
      privilege_type: string;
    }>(
      `select tbl, privilege_type from (
           select table_schema || '.' || table_name as tbl, privilege_type
             from information_schema.role_table_grants
            where grantee = 'authenticated'
           union
           -- A COLUMN-LEVEL GRANT IS STILL A GRANT. Several tables here deliberately
           -- grant INSERT/UPDATE on a subset of columns (the governed-column design);
           -- role_table_grants does not report those at all, so reading only that view
           -- would fail six lanes' correct code.
           select table_schema || '.' || table_name, privilege_type
             from information_schema.role_column_grants
            where grantee = 'authenticated'
         ) g
        where tbl = any($1::text[])`,
      [wanted],
    );

    if (rows.length === 0) {
      fail(
        "LIVE PULL FAILED — the catalog answered with no grants at all for any of the\n" +
          `${wanted.length} tables the client writes. That is not a real answer.`,
      );
    }

    const held = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = held.get(row.tbl) ?? new Set<string>();
      set.add(row.privilege_type);
      held.set(row.tbl, set);
    }

    const allOffenders = writes.filter(
      (w) => !held.get(`${w.schema}.${w.table}`)?.has(w.privilege),
    );

    // THE BASELINE ONLY SHRINKS. An entry that is no longer an offender fails too, so a
    // fix cannot leave a stale excuse behind for the next reader to trust.
    const baseline: { offenders: { file: string; table: string; verb: string }[] } = JSON.parse(
      readFileSync(join(ROOT, "scripts/client-writes-granted-baseline.json"), "utf8"),
    );
    const key = (o: { file: string; table: string; verb: string }) =>
      `${o.file}::${o.table}::${o.verb}`;
    const known = new Set(baseline.offenders.map(key));
    const offenders = allOffenders.filter(
      (w) => !known.has(key({ file: w.file, table: `${w.schema}.${w.table}`, verb: w.verb })),
    );
    const seen = new Set(
      allOffenders.map((w) =>
        key({ file: w.file, table: `${w.schema}.${w.table}`, verb: w.verb }),
      ),
    );
    const stale = baseline.offenders.filter((o) => !seen.has(key(o)));
    if (stale.length > 0 && !selfTest) {
      fail(
        `${stale.length} baseline entr(y/ies) no longer match anything — delete them:\n` +
          stale.map((o) => `  ${o.file} · ${o.verb} on ${o.table}`).join("\n"),
      );
    }

    console.log(
      `Scanned ${writes.length} client write(s) across ${wanted.length} table(s). ` +
        `${baseline.offenders.length} known-broken write(s) in the baseline.`,
    );

    if (offenders.length > 0) {
      const lines = offenders
        .map(
          (w) =>
            `  ${w.file}:${w.line}\n` +
            `    .${w.verb}() on ${w.schema}.${w.table} needs ${w.privilege}; ` +
            `authenticated holds ${[...(held.get(`${w.schema}.${w.table}`) ?? [])].join(", ") || "nothing"}`,
        )
        .join("\n");
      fail(
        `${offenders.length} client write(s) the browser can never perform:\n\n${lines}\n\n` +
          "This fails at RUN time with 42501, in the console, where nobody looks.\n" +
          "The fix is almost never a new grant: a table the client may not write is a\n" +
          "table the SERVER writes — move the call behind an aidream endpoint. Widening a\n" +
          "variant's grants for one button is how an access model rots.",
      );
    }

    if (selfTest) {
      fail(
        "SELF-TEST FAILED: the planted write was detected but NOT refused.\n" +
          "authenticated apparently holds UPDATE on platform.acquisition_block — either the\n" +
          "grant was widened (read the note above) or this checker's comparison is broken.",
      );
    }

    console.log("✅ Every client write is one the authenticated role actually holds.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nUNEXPECTED FAILURE — this check is UNMEASURED, which is a failure:\n${String(error)}\n`);
  exitAfterDrain(1);
});
