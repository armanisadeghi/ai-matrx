/**
 * check-doc-claims.ts — CLAUDE.md must not lie to agents.
 *
 * The failure this exists to prevent: an instruction doc that asserts a fact the
 * configuration no longer backs. Agents cannot see next.config.js while writing a
 * component; they act on what CLAUDE.md tells them. A doc claim that has silently
 * gone false is therefore not a typo — it is a bug that every future agent inherits.
 *
 * How it happened (D62, 2026-07-18): `reactCompiler` was flipped to `false` in April
 * 2026 behind a `TEMP:` comment promising a build-time measurement that was never
 * taken. CLAUDE.md went on telling every agent "React Compiler is on — no manual
 * useMemo/useCallback/React.memo" for ~3 months. Agents wrote unmemoized render paths
 * against a compiler that was not running, and at least one seam had to hand-roll a
 * `useMemo` to compensate. The same sweep found `'use cache'` documented as the
 * caching path while the flag that makes the directive legal was never enabled, two
 * route groups documented after deletion, and 28 skills stranded where no agent
 * could invoke them.
 *
 * The registry below is deliberately EXPLICIT rather than prose-parsing: each claim
 * names the doc text, the reality check, and the resolution. Adding a load-bearing
 * claim to CLAUDE.md means adding it here. A claim nobody can check is a claim that
 * will rot.
 *
 * Loud, non-blocking by default; `--strict` exits 1 (for CI, once CI exists).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const readIfExists = (p: string): string | null =>
  existsSync(join(ROOT, p)) ? read(p) : null;

const CLAUDE_MD = read("CLAUDE.md");
const NEXT_CONFIG = read("next.config.js");
const PKG = JSON.parse(read("package.json")) as {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Installed version from node_modules, not the declared range (many deps are "latest"). */
function installedVersion(pkg: string): string | null {
  const p = join(ROOT, "node_modules", pkg, "package.json");
  if (!existsSync(p)) return null;
  return (
    (JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version ??
    null
  );
}

/**
 * Read a top-level `key: value` out of next.config.js as TEXT. We deliberately do not
 * import the module: it reads env vars, logs, and branches on MATRX_PROFILE, so
 * executing it to inspect it would make this guard depend on the thing it audits.
 * Comment lines are stripped first so a commented-out setting never reads as live.
 */
function nextConfigSetting(key: string): string | null {
  const live = NEXT_CONFIG.split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const m = new RegExp(`\\b${key}\\s*:\\s*([^,\\n]+)`).exec(live);
  return m ? m[1].trim() : null;
}

interface Claim {
  id: string;
  /** What CLAUDE.md asserts, quoted closely enough to find with a search. */
  claim: string;
  where: string;
  /** null = claim holds. A string = the reality that contradicts it. */
  check: () => string | null;
  /** What to do when it fails. */
  fix: string;
}

const claims: Claim[] = [
  {
    id: "react-compiler",
    claim:
      "React Compiler is on — no manual useMemo / useCallback / React.memo",
    where: "CLAUDE.md § Core invariants",
    check: () => {
      const v = nextConfigSetting("reactCompiler");
      if (v === null)
        return "next.config.js declares no `reactCompiler` setting at all";
      return v.startsWith("true")
        ? null
        : `next.config.js has reactCompiler: ${v}`;
    },
    fix: "Set reactCompiler: true, or rewrite the memoization doctrine in CLAUDE.md AND PRINCIPLES.md. Do not leave them disagreeing — that is D62.",
  },
  {
    id: "use-cache-flag",
    claim: "opt into caching with 'use cache' + cacheTag() / revalidateTag()",
    where: "CLAUDE.md § Core invariants",
    check: () => {
      // Next 16 makes the `'use cache'` directive a BUILD ERROR unless cacheComponents
      // (formerly dynamicIO) is enabled. Documenting it without the flag hands agents
      // a directive that cannot compile.
      const enabled =
        /\bcacheComponents\s*:\s*true/.test(NEXT_CONFIG) ||
        /\bdynamicIO\s*:\s*true/.test(NEXT_CONFIG) ||
        /\buseCache\s*:\s*true/.test(NEXT_CONFIG);
      if (enabled) return null;
      // Flag is OFF. Two things must hold: the doc must say so (not present the
      // directive as usable), and no source file may actually use it.
      // Tolerate the surrounding markdown (backticks, bold) between the directive
      // and the negation — the doc writes: **`'use cache'` is NOT available**
      const docAdmitsUnavailable =
        /use cache['"`*\s]+is\s+NOT\s+available/i.test(CLAUDE_MD);
      const problems: string[] = [];
      if (!docAdmitsUnavailable) {
        problems.push(
          "CLAUDE.md presents 'use cache' as the caching path, but neither cacheComponents nor dynamicIO is enabled — the directive is a build error",
        );
      }
      return problems.length ? problems.join("; ") : null;
    },
    fix: "Enable experimental.cacheComponents, or state in CLAUDE.md that caching is currently off and 'use cache' is unavailable.",
  },
  {
    id: "route-groups",
    claim: "the route-group table lists the groups that exist under app/",
    where: "CLAUDE.md § Route groups",
    check: () => {
      const documented = new Set(
        [...CLAUDE_MD.matchAll(/^\|\s*`(\([a-z-]+\))`\s*\|/gm)].map(
          (m) => m[1],
        ),
      );
      if (documented.size === 0) return null; // table restructured; nothing to compare
      const onDisk = new Set(
        readdirSync(join(ROOT, "app"), { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^\(.+\)$/.test(d.name))
          .map((d) => d.name),
      );
      const ghosts = [...documented].filter((g) => !onDisk.has(g));
      const undocumented = [...onDisk].filter((g) => !documented.has(g));
      const parts: string[] = [];
      if (ghosts.length)
        parts.push(
          `documented but NOT on disk: ${ghosts.join(", ")} (agents are told to create files there)`,
        );
      if (undocumented.length)
        parts.push(`on disk but undocumented: ${undocumented.join(", ")}`);
      return parts.length ? parts.join("; ") : null;
    },
    fix: "Update the route-group table. A ghost group also means dead redirects in next.config.js pointing at 404s — check those too.",
  },
  {
    id: "skills-invocable",
    claim: "every skill CLAUDE.md tells agents to invoke is invocable",
    where: "CLAUDE.md (various § — 'invoke the `x` skill')",
    check: () => {
      const named = new Set(
        [...CLAUDE_MD.matchAll(/`([a-z0-9-]+)`\s+skill/gi)].map((m) => m[1]),
      );
      if (named.size === 0) return null;
      const dir = join(ROOT, ".claude", "skills");
      const available = existsSync(dir)
        ? new Set(readdirSync(dir))
        : new Set<string>();
      // A skill may legitimately be user-global rather than repo-local; only flag ones
      // that exist NOWHERE, plus any still stranded in the pre-2026-07 .cursor location.
      const stranded = [...named].filter(
        (s) =>
          !available.has(s) && existsSync(join(ROOT, ".cursor", "skills", s)),
      );
      return stranded.length
        ? `stranded in .cursor/skills (invisible to Claude Code): ${stranded.join(", ")}`
        : null;
    },
    fix: "git mv .cursor/skills/<name> .claude/skills/<name>. Skills live in ONE place; .cursor/skills is not read by Claude Code.",
  },
  {
    id: "proxy-not-middleware",
    claim: "proxy.ts (not middleware.ts) — auth, route guards, redirects only",
    where: "CLAUDE.md § Core invariants",
    check: () => {
      if (!existsSync(join(ROOT, "proxy.ts"))) return "proxy.ts does not exist";
      return existsSync(join(ROOT, "middleware.ts"))
        ? "middleware.ts exists alongside proxy.ts — two competing request interceptors"
        : null;
    },
    fix: "Keep exactly one. proxy.ts is the Next 16 replacement for middleware.ts.",
  },
  {
    id: "typecheck-is-the-gate",
    claim:
      "TypeScript 5.9 (strict, no `any`) / typecheck with `pnpm type-check`",
    where: "CLAUDE.md § Architecture, § Core invariants",
    check: () => {
      // Not a contradiction to fix in config (flipping it can red a deploy), but the doc
      // must not imply the BUILD type-checks when it does not. We assert the doc admits it.
      const ignoring = /ignoreBuildErrors\s*:\s*true/.test(
        NEXT_CONFIG.split("\n")
          .filter((l) => !l.trim().startsWith("//"))
          .join("\n"),
      );
      if (!ignoring) return null;
      const admitted = /ignoreBuildErrors/.test(CLAUDE_MD);
      return admitted
        ? null
        : "next.config.js sets typescript.ignoreBuildErrors: true (production builds never type-check) and CLAUDE.md does not say so";
    },
    fix: "Either remove ignoreBuildErrors (measure first with `pnpm type-check`) or state plainly in CLAUDE.md that the build does not gate on types and `pnpm type-check` is the only gate.",
  },
  {
    id: "typecheck-covers-shipped-code",
    claim: "`pnpm type-check` is the type gate for shipped code",
    where: "CLAUDE.md § Core invariants",
    check: () => {
      const raw = readIfExists("tsconfig.typecheck.json");
      if (!raw) return "tsconfig.typecheck.json is missing";
      const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
        exclude?: string[];
      };
      // (dev) is legitimately excluded — optional slim builds use MATRX_PROFILE=core.
      // Anything else that SHIPS must not be silently outside the only type gate.
      const shippedExclusions = (cfg.exclude ?? []).filter(
        (e) =>
          /^(app|features|components|lib|hooks)\b/.test(e) &&
          !e.includes("(dev)") &&
          !e.includes("schemaUtils"),
      );
      return shippedExclusions.length
        ? `tsconfig.typecheck.json excludes shipped code from the only type gate: ${shippedExclusions.join(", ")}`
        : null;
    },
    fix: "Remove the exclude and fix the fallout. Excluding to green a build hides errors in code that ships. Measure the real cost first — in D63 the equivalent excludes hid ZERO errors across 485 files.",
  },
  {
    id: "enforcement-honesty",
    claim: "enforced by ... the pre-commit hook",
    where: "CLAUDE.md § Operating Principle, PRINCIPLES.md § Enforcement",
    check: () => {
      // Match the CLAIM, not the mention — the docs now name the hook in order to
      // deny it ("there is no pre-commit hook"), which a naive substring test reads
      // as an assertion that one exists.
      const asserts = (doc: string): boolean =>
        /pre-commit hook/i.test(doc) &&
        !/(no|without|not?)\s+(a\s+)?pre-commit hook/i.test(doc) &&
        !/Nothing runs at commit time/i.test(doc);
      const claimsHook =
        asserts(CLAUDE_MD) || asserts(readIfExists("PRINCIPLES.md") ?? "");
      if (!claimsHook) return null;
      const huskyDir = join(ROOT, ".husky");
      const gitHook = join(ROOT, ".git", "hooks", "pre-commit");
      const configured =
        (existsSync(huskyDir) &&
          readdirSync(huskyDir).some((f) => f === "pre-commit")) ||
        existsSync(gitHook) ||
        PKG.devDependencies?.["simple-git-hooks"] !== undefined ||
        // a configured runner counts only if something actually wires it
        /"simple-git-hooks"\s*:\s*\{/.test(read("package.json")) ||
        /"lint-staged"\s*:\s*\{/.test(read("package.json"));
      return configured
        ? null
        : "the docs claim a pre-commit hook, but no hook is installed (.git/hooks has no pre-commit, no .husky/, no simple-git-hooks or lint-staged config) — nothing runs at commit time";
    },
    fix: "Install the hook, or delete the pre-commit sentences. Claiming enforcement that does not exist is how every other drift in this file survived.",
  },
  {
    id: "stack-versions",
    claim: "the stack line's version numbers match what is installed",
    where: "CLAUDE.md § Architecture (Stack)",
    check: () => {
      // Compare MAJOR versions only. next/react are declared "latest", so pinning exact
      // minors in prose guarantees churn; a major drift (TS 5 -> 6) is what actually
      // changes how agents write code.
      const targets: Array<[string, RegExp, string]> = [
        ["next", /Next\.js\s+(\d+)\.\d+/, "Next.js"],
        ["react", /React\s+(\d+)\.\d+/, "React"],
        ["typescript", /TypeScript\s+(\d+)\.\d+/, "TypeScript"],
        ["tailwindcss", /Tailwind\s+(\d+)\.\d+/, "Tailwind"],
      ];
      const bad: string[] = [];
      for (const [pkg, re, label] of targets) {
        const m = re.exec(CLAUDE_MD);
        const installed = installedVersion(pkg);
        if (!m || !installed) continue;
        const docMajor = m[1];
        const realMajor = installed.split(".")[0];
        if (docMajor !== realMajor) {
          bad.push(
            `${label}: doc says ${docMajor}.x, installed is ${installed}`,
          );
        }
      }
      return bad.length ? bad.join("; ") : null;
    },
    fix: "Update the stack line. State majors/minimums ('Next 16.2+'), not exact patches — next/react/typescript are declared \"latest\" and will drift again.",
  },
  {
    id: "doc-paths-resolve",
    claim: "every relative path CLAUDE.md links to exists",
    where: "CLAUDE.md (all markdown links)",
    check: () => {
      const dead: string[] = [];
      for (const m of CLAUDE_MD.matchAll(
        /\]\(\.?\/?([^)#\s]+\.(?:md|ts|tsx|sql|mjs|json))(?:#[^)]*)?\)/g,
      )) {
        const rel = m[1].replace(/^\.\//, "");
        if (rel.startsWith("http")) continue;
        if (!existsSync(join(ROOT, rel))) dead.push(rel);
      }
      // Absolute cross-repo pointers: catch a path on a volume that no longer mounts.
      for (const m of CLAUDE_MD.matchAll(
        /`?(\/(?:Volumes|Users)\/[^\s`)]+\.md)`?/g,
      )) {
        if (!existsSync(m[1])) dead.push(m[1]);
      }
      return dead.length
        ? `dead pointers: ${[...new Set(dead)].join(", ")}`
        : null;
    },
    fix: "Repoint or delete. A dead pointer silently drops a whole ruleset for every agent that follows it.",
  },
];

const failures: Array<{ claim: Claim; reality: string }> = [];
for (const c of claims) {
  let reality: string | null = null;
  try {
    reality = c.check();
  } catch (err) {
    reality = `check threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (reality) failures.push({ claim: c, reality });
}

if (failures.length > 0) {
  console.error(
    `\n${RED}┌───────────────────────────────────────────────────────────────┐`,
  );
  console.error(
    `│ CLAUDE.md IS LYING TO AGENTS — a documented fact is no longer  │`,
  );
  console.error(
    `│ true of this repo. Agents act on the doc, not the config.      │`,
  );
  console.error(
    `└───────────────────────────────────────────────────────────────┘${RESET}`,
  );
  for (const { claim, reality } of failures) {
    console.error(
      `\n  ${RED}✗ ${claim.id}${RESET}  ${DIM}(${claim.where})${RESET}`,
    );
    console.error(`    ${DIM}doc claims:${RESET} "${claim.claim}"`);
    console.error(`    ${YELLOW}reality:${RESET}    ${reality}`);
    console.error(`    ${DIM}fix:${RESET}        ${claim.fix}`);
  }
  console.error(
    `\n  ${DIM}Resolve by changing the CONFIG or the DOC — never by leaving them`,
  );
  console.error(`  disagreeing. See scripts/check-doc-claims.ts.${RESET}\n`);
  process.exit(STRICT ? 1 : 0);
}

console.log(
  `${GREEN}✓${RESET} CLAUDE.md's ${claims.length} machine-checkable claims all hold against the live config.`,
);
