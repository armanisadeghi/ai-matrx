/**
 * check-parked-route-groups — the guard for THE PARKED-BUILD DELETION CLASS.
 *
 * WHAT HAPPENED (2026-08-25). `next.config.js` compiles a profile by RENAMING
 * excluded route groups: `app/(admin)` → `app/_admin_build_excluded`. The
 * parked name is gitignored. On this shared checkout — Arman plus dozens of
 * concurrent agents — a session ran a parked-profile build and then committed
 * with `git add -A`. Git saw 381 deletions under `app/(admin)` and nothing to
 * add back, so the ENTIRE administration surface left `main` in one "wip"
 * commit (d17df60895). Nobody noticed; the next admin release would have built
 * manage.aimatrx.com to nothing.
 *
 * next.config.js already warns against this in a comment. A comment cannot
 * stop `git add -A`. This can:
 *
 *   1. A parked directory exists on disk → the working tree is MID-PARK.
 *      Committing broadly right now deletes that group. Screams.
 *   2. A route group git knows about has no files → it is ALREADY deleted.
 *      Screams with the exact restore command.
 *
 * Advisory by default (screams, exit 0) — `--strict` exits non-zero for the
 * release gates. Recovery is always the same: restore from the commit before
 * the deletion, never re-create by hand.
 */
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const APP_DIR = resolve(process.cwd(), "app");

/** Every route group the profiles can park (next.config.js PROFILES.park). */
const PARKABLE = ["admin", "core", "transitional", "public", "popup"] as const;

function trackedFileCount(group: string): number {
  try {
    const out = execFileSync("git", ["ls-files", `app/(${group})`], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean).length;
  } catch {
    return -1; // git unavailable — never fail the repo over tooling
  }
}

function main(): number {
  const strict = process.argv.includes("--strict");
  const problems: string[] = [];

  const parkedOnDisk = existsSync(APP_DIR)
    ? readdirSync(APP_DIR).filter(
        (entry) => entry.startsWith("_") && entry.includes("_build_excluded"),
      )
    : [];
  for (const entry of parkedOnDisk) {
    // A `.stale-` quarantine is next.config.js's own recovery artifact; it is
    // inert (the live path exists beside it) and must not read as mid-park.
    if (entry.includes(".stale-")) continue;
    problems.push(
      `app/${entry} exists — this tree is MID-PARK from a profile build. ` +
        `Do NOT commit with \`git add -A\`/\`git commit -a\` until it is gone: ` +
        `git would record the whole group as deleted. Restore by running a ` +
        `full-profile build, or rename it back to its app/(x) name.`,
    );
  }

  for (const group of PARKABLE) {
    const count = trackedFileCount(group);
    if (count === 0) {
      problems.push(
        `app/(${group}) has ZERO tracked files — the group has already been ` +
          `deleted from git, almost certainly by a parked build. Find the ` +
          `deleting commit and restore it:\n` +
          `      git log --diff-filter=D --name-only -- "app/(${group})" | head\n` +
          `      git checkout <that-commit>^ -- "app/(${group})"`,
      );
    }
  }

  if (problems.length === 0) {
    console.log("✓ Route groups: none parked on disk, none missing from git.");
    return 0;
  }

  console.error(
    `\n\x1b[41m\x1b[97m PARKED ROUTE GROUP \x1b[0m ${problems.length} problem(s) — a whole route group can vanish from main this way:\n`,
  );
  for (const problem of problems) console.error(`  • ${problem}\n`);
  return strict ? 2 : 0;
}

process.exit(main());
