/**
 * check-tsconfig-hygiene.ts — keep generated Next build output OUT of tsc/eslint.
 *
 * The failure this exists to prevent is the worst kind: a checker that reports
 * SUCCESS while checking nothing.
 *
 * How it happened (2026-07-12): `next dev` appends `<distDir>/types/**\/*.ts` to
 * tsconfig.json's `include` on boot. Because `NEXT_DISTDIR` lets parallel agents
 * run their own dev servers, the include list accumulated `.next-preview/`,
 * `.next-preview-cutoverqa/`, … Those dirs hold machine-written type validators,
 * and a dev server killed mid-write leaves one TRUNCATED. A parse error in a
 * file tsc is told to include derails the run: `npx tsc --noEmit` reported 3
 * syntax errors from a stale build dir and NOTHING ELSE — a deliberate
 * `const x: number = "str"` planted in a real source file was not reported. Every
 * type error in the repo was invisible.
 *
 * The fix is a `.next*` exclude glob (exclude beats include, so it holds even
 * when Next re-appends its entry) in both tsconfigs, and a matching `ignores` in
 * the ESLint flat config (which does NOT read .gitignore). This guard fails loudly
 * if any of those three are removed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const FIX = process.argv.includes("--fix");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const problems: string[] = [];

/** tsconfig files are JSONC in principle; ours are plain JSON. Strip // comments defensively. */
function readJsonc(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(raw) as Record<string, unknown>;
}

function checkTsconfig(file: string): void {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const cfg = readJsonc(path);
  const exclude = (cfg.exclude as string[] | undefined) ?? [];

  // The load-bearing line. Anything matching .next* must be unreadable to tsc.
  const hasGuard = exclude.some((e) => e === ".next*/**" || e === ".next*");
  if (!hasGuard) {
    problems.push(
      `${file}: "exclude" is missing the ".next*/**" glob. Generated build output ` +
        `(.next, .next-preview, any NEXT_DISTDIR variant) will be fed to tsc — and a ` +
        `single truncated validator.ts in one of them silences EVERY type error in the repo.`,
    );
  }
}

checkTsconfig("tsconfig.json");
checkTsconfig("tsconfig.typecheck.json");

/**
 * The other half of the same leak. `next dev` doesn't only *read* tsconfig.json —
 * it APPENDS `<distDir>/types/**\/*.ts` to `include` on every boot, and
 * tsconfig.json is a TRACKED file. With one NEXT_DISTDIR per agent session those
 * entries never stop accumulating: 200 of 214 include entries were dead
 * `.next-agent-*` / `.next-preview-*` paths by 2026-07-25, all committed to git.
 *
 * Every one of them is inert — the `.next*` exclude above nullifies them (exclude
 * beats include) — so pruning is always safe and never changes what tsc sees.
 * `--fix` prunes; the reaper in scripts/dev-cleanup.sh calls it, so this
 * self-heals instead of growing forever.
 */
function pruneDistdirIncludes(file: string): void {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as Record<
    string,
    unknown
  >;
  const include = cfg.include as string[] | undefined;
  if (!Array.isArray(include)) return;

  const dead = include.filter((e) => e.startsWith(".next"));
  if (dead.length === 0) return;

  if (!FIX) {
    console.log(
      `${YELLOW}note${RESET} ${file}: ${dead.length} dead ".next*" include entries ` +
        `(inert — the .next* exclude nullifies them — but they accumulate in a ` +
        `tracked file on every dev-server boot). Prune with \`pnpm fix:tsconfig\`.`,
    );
    return;
  }

  cfg.include = include.filter((e) => !e.startsWith(".next"));
  // Preserve the file's trailing newline convention.
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(
    `${GREEN}✓${RESET} ${file}: pruned ${dead.length} dead ".next*" include entries.`,
  );
}

pruneDistdirIncludes("tsconfig.json");
pruneDistdirIncludes("tsconfig.typecheck.json");

// ESLint flat config does not read .gitignore — it needs its own ignores entry.
const eslintPath = join(ROOT, "eslint.config.mjs");
if (existsSync(eslintPath)) {
  const src = readFileSync(eslintPath, "utf8");
  if (!/ignores:\s*\[\s*['"]\.next\*\/\*\*['"]/.test(src)) {
    problems.push(
      `eslint.config.mjs: missing the global \`{ ignores: ['.next*/**'] }\` entry. ` +
        `Flat config does NOT honour .gitignore, so ESLint will walk generated build ` +
        `output and choke on half-written files.`,
    );
  }
}

// Informational: stale alternate build dirs lying around.
const stale = readdirSync(ROOT).filter(
  (d) => d.startsWith(".next") && d !== ".next",
);

if (problems.length > 0) {
  console.error(
    `\n${RED}┌───────────────────────────────────────────────────────────────┐`,
  );
  console.error(
    `│ BUILD-ARTIFACT HYGIENE BROKEN — tsc/eslint may be checking     │`,
  );
  console.error(
    `│ NOTHING while reporting success.                              │`,
  );
  console.error(
    `└───────────────────────────────────────────────────────────────┘${RESET}`,
  );
  for (const p of problems) console.error(`  ${RED}✗${RESET} ${p}`);
  console.error(
    `\n  Fix: restore the ".next*/**" guard. See scripts/check-tsconfig-hygiene.ts.\n`,
  );
  process.exit(STRICT ? 1 : 0);
}

console.log(
  `${GREEN}✓${RESET} tsconfig + eslint keep .next* build output out of the type/lint graph.`,
);
if (stale.length > 0) {
  console.log(
    `${YELLOW}note${RESET} stale alternate build dirs present: ${stale.join(", ")} — ` +
      `harmless now (excluded), remove with \`pnpm clean:next\`.`,
  );
}
