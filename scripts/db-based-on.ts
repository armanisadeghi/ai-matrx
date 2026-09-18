#!/usr/bin/env npx tsx
/**
 * `pnpm db:based-on <schema.function>` — print the `-- based-on:` header line(s)
 * for a function, read from the LIVE catalogue.
 *
 * Paste the output into the migration that replaces the body. `pnpm db:apply`
 * recomputes the same hash immediately before executing and refuses the whole
 * file when it has moved, so the line is the author's statement of the exact
 * body their edit was based on (DD-220; see scripts/migration-based-on.ts for
 * the defect it closes).
 *
 *   pnpm db:based-on billing.plan_status            all overloads
 *   pnpm db:based-on 'billing.plan_status(uuid)'    one exact overload
 *   pnpm db:based-on migrations/foo.sql             every function foo.sql replaces
 *
 * The third form is the one to reach for while writing a migration: it reads the
 * file, works out which live functions its `CREATE OR REPLACE` statements would
 * overwrite, and prints exactly the lines that file is missing.
 *
 * 🚨 WHICH DATABASE IT MEASURES: `--based-on-target production|branch` (alias
 * `--target`), default `production` — the main database. A `-- based-on:` line is a
 * hash of a body on ONE database, and `db:apply` recomputes it against the database
 * IT is applying to; the two bodies can differ, so a line generated here against the
 * main database and pasted into a file rehearsed on the copy will refuse there, and
 * vice versa. Until this flag existed the helper read only the main database and
 * there was no way to say otherwise.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  findReplaceOccurrences,
  liveOverloads,
  parseBasedOnLines,
  resolveReplaced,
  type LiveFunction,
  type Query,
} from "./migration-based-on";
import { connectDirect, DB_VARS, loadDbEnv, type DbEnv } from "./lib/direct-db";
import { loadBranchDbEnv, loadBranchRef, TargetRefusal } from "./lib/migration-target";

const ROOT = resolve(import.meta.dirname, "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

function line(fn: LiveFunction): string {
  return `-- based-on: ${fn.signature} ${fn.hash}`;
}

/** `--based-on-target` / `--target` — WHICH database the hash is measured on. */
function parseBasedOnTarget(flags: string[]): "production" | "branch" | { bad: string } {
  let picked: "production" | "branch" = "production";
  for (const f of flags) {
    const m = /^--(?:based-on-)?target(?:=(.*))?$/.exec(f);
    if (!m) continue;
    const value = m[1];
    if (value === undefined) return { bad: `${f} needs a value: --based-on-target production|branch` };
    if (value !== "production" && value !== "branch")
      return { bad: `--based-on-target ${value} is not a database. Name production or branch.` };
    picked = value;
  }
  return picked;
}

async function main(): Promise<number> {
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const basedOnTarget = parseBasedOnTarget(flags);
  if (typeof basedOnTarget !== "string") {
    console.error(`${C.red}[FAIL]${C.reset} ${basedOnTarget.bad}`);
    return 1;
  }
  if (argv.length !== 1) {
    console.log(
      `${C.bold}pnpm db:based-on <schema.function | schema.function(argtypes) | migrations/file.sql> [--based-on-target production|branch]${C.reset}\n` +
        `  Prints the \`-- based-on:\` header line(s) for a function, from the live catalogue.\n` +
        `  Paste them into the migration that replaces the body; db:apply verifies them before it runs.\n` +
        `  --based-on-target (alias --target) picks WHICH database is measured; default production,\n` +
        `  the main database. db:apply recomputes the hash on the database it applies to, so a line\n` +
        `  taken from one database and checked against the other refuses when the bodies differ.`,
    );
    return 1;
  }

  let env: DbEnv | { missing: string[]; looked: string[] };
  if (basedOnTarget === "branch") {
    try {
      env = { ...loadBranchDbEnv(ROOT, loadBranchRef(ROOT)) };
    } catch (err) {
      console.error(
        `${C.red}[FAIL]${C.reset} ${err instanceof TargetRefusal ? err.message : String(err)}`,
      );
      return 2;
    }
  } else {
    env = loadDbEnv();
  }
  if ("missing" in env) {
    console.error(
      `${C.red}[FAIL]${C.reset} No direct database connection — need ${DB_VARS.join(", ")} in the ` +
        `environment or in one of: ${env.looked.join(", ") || "(no env file found)"}, ../aidream/.env.\n` +
        `  This helper reads the LIVE body; it will not print a hash it did not measure.`,
    );
    return 2;
  }
  console.log(
    `${C.dim}# measuring on ${basedOnTarget} — ${env.host}/${env.database} (${env.from})${C.reset}`,
  );
  const client = await connectDirect(env, `matrx-frontend db:based-on (${basedOnTarget})`);
  const q: Query = async (sql, params) => (await client.query(sql, params as never)).rows;

  try {
    const target = argv[0]!;

    // ── form 3: a migration file ────────────────────────────────────────────
    if (target.endsWith(".sql")) {
      const path = existsSync(target) ? target : resolve(process.cwd(), target);
      if (!existsSync(path)) {
        console.error(`${C.red}[FAIL]${C.reset} No such file: ${target}`);
        return 1;
      }
      const sql = readFileSync(path, "utf8");
      const already = new Set(parseBasedOnLines(sql).lines.map((l) => l.signature.replace(/\s+/g, "")));
      const replaced = findReplaceOccurrences(sql);
      const wanted: LiveFunction[] = [];
      for (const fn of replaced) {
        const r = await resolveReplaced(q, fn);
        if (r.kind === "resolved") wanted.push(r.live);
        else if (r.kind === "name-only") wanted.push(...r.overloads);
        else if (r.kind === "computed")
          console.error(
            `${C.red}[FAIL]${C.reset} line ${fn.line} builds a function NAME at runtime ` +
              `(\`${fn.snippet}…\`). Write the replace statically, or add a \`-- based-on:\` line by hand ` +
              `for the name it will produce.`,
          );
        else if (r.kind === "unresolvable")
          console.error(
            `${C.red}[FAIL]${C.reset} ${fn.name}(…) at line ${fn.line}: ${r.reason}. ` +
              `Schema-qualify it and write plain parameter types.`,
          );
      }
      if (wanted.length === 0) {
        console.log(
          `${C.cyan}[INFO]${C.reset} ${target} replaces no function that already exists live — ` +
            `no \`-- based-on:\` line is needed.`,
        );
        return 0;
      }
      console.log(`${C.dim}# paste into ${target} (order does not matter):${C.reset}`);
      for (const fn of wanted) {
        const have = already.has(fn.signature.replace(/\s+/g, ""));
        console.log(`${have ? C.dim : C.white}${line(fn)}${C.reset}${have ? `  ${C.dim}(already present — regenerate if stale)${C.reset}` : ""}`);
      }
      return 0;
    }

    // ── forms 1 and 2: a function name, optionally with argument types ──────
    const bare = target.replace(/\(.*$/, "");
    const overloads = await liveOverloads(q, bare);
    if (overloads.length === 0) {
      console.error(
        `${C.red}[FAIL]${C.reset} No function named \`${bare}\` exists on this database.\n` +
          `  If you are CREATING it, it needs no \`-- based-on:\` line — a replace that overwrites nothing\n` +
          `  cannot clobber anyone. If you expected it to exist, check the schema qualification.`,
      );
      return 1;
    }
    const wantArgs = target.includes("(");
    const picked = wantArgs
      ? overloads.filter(
          (o) => o.signature.replace(/\s+/g, "").toLowerCase().endsWith(
            target.slice(target.indexOf("(")).replace(/\s+/g, "").toLowerCase(),
          ),
        )
      : overloads;
    if (picked.length === 0) {
      console.error(
        `${C.red}[FAIL]${C.reset} \`${target}\` matches none of the ${overloads.length} live overload(s):\n` +
          overloads.map((o) => `    ${o.signature}`).join("\n"),
      );
      return 1;
    }
    for (const o of picked) console.log(`${C.white}${line(o)}${C.reset}`);
    if (!wantArgs && overloads.length > 1)
      console.log(
        `${C.dim}# ${overloads.length} overloads — keep only the line(s) your migration actually replaces.${C.reset}`,
      );
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:based-on — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);
