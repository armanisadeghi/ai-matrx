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
 * release gates, `--fix` renames any park back to its tracked path.
 *
 * SINCE 2026-08-25 next.config.js enforces THE PARK LAW — parking happens
 * ONLY on Vercel, so nothing local ever renames a tracked route group and
 * case 1 is unreachable on a developer machine. This guard stays as the
 * independent check that says so.
 *
 * Recovery for case 1: `pnpm check:parked-routes:fix`. Recovery for case 2 (a
 * group already committed away): restore from the commit before the deletion,
 * never re-create by hand.
 */
import { existsSync, readdirSync, renameSync } from "node:fs";
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
  const fix = process.argv.includes("--fix");
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
    // `--fix` is the one-command recovery: rename the park back to the
    // tracked path it came from. Only ever moves a park whose live path is
    // MISSING, so it can never clobber real files.
    const group = entry.replace(/^_/, "").replace(/_build_excluded$/, "");
    const live = resolve(APP_DIR, `(${group})`);
    if (fix && PARKABLE.includes(group as (typeof PARKABLE)[number])) {
      if (existsSync(live)) {
        problems.push(
          `app/${entry} and app/(${group}) BOTH exist — not touching it. ` +
            `The live path is the source of truth; inspect the park by hand.`,
        );
        continue;
      }
      renameSync(resolve(APP_DIR, entry), live);
      console.log(`✓ unparked app/${entry} → app/(${group})`);
      continue;
    }
    problems.push(
      `app/${entry} exists — this tree is MID-PARK from a profile build. ` +
        `Do NOT commit with \`git add -A\`/\`git commit -a\` until it is gone: ` +
        `git would record the whole group as deleted. Restore it with ` +
        `\`pnpm check:parked-routes:fix\`.`,
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
