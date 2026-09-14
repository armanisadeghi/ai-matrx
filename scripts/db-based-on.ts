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
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  findReplacedFunctions,
  liveOverloads,
  parseBasedOnLines,
  resolveReplaced,
  type LiveFunction,
  type Query,
} from "./migration-based-on";
import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";

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

async function main(): Promise<number> {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (argv.length !== 1) {
    console.log(
      `${C.bold}pnpm db:based-on <schema.function | schema.function(argtypes) | migrations/file.sql>${C.reset}\n` +
        `  Prints the \`-- based-on:\` header line(s) for a function, from the live catalogue.\n` +
        `  Paste them into the migration that replaces the body; db:apply verifies them before it runs.`,
    );
    return 1;
  }

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.red}[FAIL]${C.reset} No direct database connection — need ${DB_VARS.join(", ")} in the ` +
        `environment or in one of: ${env.looked.join(", ") || "(no env file found)"}, ../aidream/.env.\n` +
        `  This helper reads the LIVE body; it will not print a hash it did not measure.`,
    );
    return 2;
  }
  const client = await connectDirect(env, "matrx-frontend db:based-on");
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
      const replaced = findReplacedFunctions(sql);
      const wanted: LiveFunction[] = [];
      for (const fn of replaced) {
        const r = await resolveReplaced(q, fn);
        if (r.kind === "resolved") wanted.push(r.live);
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
