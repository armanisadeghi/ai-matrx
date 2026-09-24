/**
 * THE SESSION-VERDICT GUARD.  (lane SESSION-VERDICT, 2026-09-24)
 *
 * `getServerAuth()` answers in three states: signed in, signed out, and
 * "could not verify" (`authUnavailable` — the 2.5s identity budget was spent,
 * typically by a cold function's first load). A screen that reads only
 * `isAuthenticated` / `user` folds the third state into "signed out" and shows
 * a signed-in person a sign-in gate, a No Access page, or a bounce to /login.
 * V17-FIX found that on /meet, /q/<token>, the module sign-in gates, the
 * Forbidden surface and ~150 pages under (core).
 *
 * THE RULE. A render file (any .tsx, and any page/layout/template/.ts under
 * app/) never reads the raw door. It calls `getSessionVerdict()` (settled two
 * states; the unverified case waits on /auth/verifying) or
 * `readSessionVerdict()` and branches on `state === "unverified"`. A file may
 * still call `getServerAuth()` directly ONLY if it reads `authUnavailable`
 * itself — the shell layouts that hold in place (`(core)`, `(admin)`,
 * `(transitional)`, `(meet)`, `(dev)`) do.
 *
 * Out of scope, named: `app/api/**` route handlers and non-render `.ts`
 * services/actions (a 401 there is a response code, not a screen; counted by
 * `--report-non-render`).
 *
 * Run: `tsx scripts/check-session-verdict.ts [--strict|--self-test|--live]` (the
 * package.json entry waits on a peer lane's uncommitted edit there); the jest
 * test `scripts/__tests__/check-session-verdict.test.ts` fails on any finding.
 * Advisory by default (CI is a signal, never a gate); `--strict` exits
 * non-zero. `--self-test` proves each rule fires before you trust a green run.
 * `--live` also compares the pinned signing keys with the live JWKS.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = process.cwd();
const ROOTS = ["app", "features", "components", "lib", "utils"];

/** The door and the helper themselves. */
const EXEMPT = new Set([
  "utils/supabase/getServerAuth.ts",
  "utils/supabase/sessionVerdict.ts",
]);

export interface Finding {
  where: string;
  what: string;
  remedy: string;
}

/** Strip comments so a rule NAMED in prose is never mistaken for a call. */
export function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const RENDER_TS = /^(page|layout|template|default|not-found|forbidden|unauthorized|error)\.(dev\.)?ts$/;

/** Is this path a render file the rule covers? */
export function isRenderFile(path: string): boolean {
  if (path.startsWith("app/api/")) return false;
  if (/(^|\/)__tests__\//.test(path) || /\.(test|spec)\.tsx?$/.test(path)) return false;
  if (path.endsWith(".tsx")) return true;
  return path.startsWith("app/") && RENDER_TS.test(basename(path));
}

export function auditSessionVerdict(files: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const [path, raw] of Object.entries(files)) {
    if (EXEMPT.has(path) || !isRenderFile(path)) continue;
    const body = code(raw);
    if (/\bgetServerAuth\s*\(/.test(body) && !/\bauthUnavailable\b/.test(body)) {
      findings.push({
        where: path,
        what: "reads getServerAuth() without its third state — 'could not verify' becomes 'not signed in'",
        remedy:
          "Use `const { isAuthenticated, user } = await getSessionVerdict()` from " +
          "`@/utils/supabase/sessionVerdict` (it never returns the third state: the request waits on " +
          "/auth/verifying, retries once, and only then says 'you have not been signed out'). " +
          "A boundary that must answer in place uses readSessionVerdict() and branches on 'unverified'.",
      });
    }
    if (/\breadSessionVerdict\s*\(/.test(body) && !/["']unverified["']/.test(body)) {
      findings.push({
        where: path,
        what: "calls readSessionVerdict() but never branches on state 'unverified'",
        remedy:
          "readSessionVerdict() is for surfaces that say their OWN honest line. Branch on " +
          "`verdict.state === \"unverified\"`, or use getSessionVerdict() instead.",
      });
    }
  }
  return findings;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
}

export function readRepoFiles(): Record<string, string> {
  const paths: string[] = [];
  for (const r of ROOTS) walk(join(ROOT, r), paths);
  const files: Record<string, string> = {};
  for (const p of paths) files[relative(ROOT, p)] = readFileSync(p, "utf8");
  return files;
}

function selfTest(): void {
  const cases: [string, Record<string, string>, number][] = [
    ["raw isAuthenticated gate in a page", {
      "app/(link)/x/page.tsx": `const { isAuthenticated } = await getServerAuth(); if (!isAuthenticated) redirect(loginHref());`,
    }, 1],
    ["Promise.all form in a component", {
      "features/a/B.tsx": `const [{ isAuthenticated }] = await Promise.all([getServerAuth()]);`,
    }, 1],
    ["reads the flag itself (a holding layout)", {
      "app/(core)/layout.tsx": `const { user, authUnavailable } = await getServerAuth(); if (authUnavailable) return hold;`,
    }, 0],
    ["the helper", {
      "app/(link)/y/page.tsx": `const { isAuthenticated } = await getSessionVerdict();`,
    }, 0],
    ["three-state read that ignores unverified", {
      "features/a/C.tsx": `const v = await readSessionVerdict(); if (!v.isAuthenticated) return gate;`,
    }, 1],
    ["three-state read that branches", {
      "features/a/D.tsx": `const v = await readSessionVerdict(); if (v.state === "unverified") return line;`,
    }, 0],
    ["named only in a comment", {
      "app/(kiosk)/layout.tsx": `// NO getServerAuth(), deliberately.\nexport default 1;`,
    }, 0],
    ["api route is out of scope", {
      "app/api/z/route.ts": `const { isAuthenticated } = await getServerAuth();`,
    }, 0],
  ];
  let failed = 0;
  for (const [name, files, expected] of cases) {
    const got = auditSessionVerdict(files).length;
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name} (expected ${expected}, got ${got})`);
  }
  if (failed > 0) exitAfterDrain(1);
}

async function live(): Promise<Finding[]> {
  const { PROJECT_SIGNING_KEYS } = await import("../utils/supabase/projectSigningKeys");
  const res = await fetch("https://db.matrxserver.com/auth/v1/.well-known/jwks.json");
  const body = (await res.json()) as { keys?: { kid?: string }[] };
  const pinned = new Set(PROJECT_SIGNING_KEYS.map((k) => k.kid));
  return (body.keys ?? [])
    .filter((k) => k.kid && !pinned.has(k.kid))
    .map((k) => ({
      where: "utils/supabase/projectSigningKeys.ts",
      what: `the live JWKS signs with kid ${k.kid}, which is not pinned`,
      remedy:
        "Add the new PUBLIC key from /auth/v1/.well-known/jwks.json to PROJECT_SIGNING_KEYS. " +
        "Until then cold server renders fetch the JWKS inside the 2.5s identity budget.",
    }));
}

async function main(): Promise<void> {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = readRepoFiles();
  const findings = auditSessionVerdict(files);
  if (process.argv.includes("--live")) findings.push(...(await live()));
  if (process.argv.includes("--report-non-render")) {
    const nonRender = Object.entries(files).filter(
      ([p, s]) => !EXEMPT.has(p) && !isRenderFile(p) && /\bgetServerAuth\s*\(/.test(code(s)) && !/\bauthUnavailable\b/.test(code(s)),
    );
    console.log(`non-render callers reading the raw door (out of scope): ${nonRender.length}`);
    for (const [p] of nonRender) console.log(`  ${p}`);
  }
  if (findings.length === 0) {
    console.log("check:session-verdict — OK. No render file reads 'could not verify' as 'not signed in'.");
    return;
  }
  console.error(`\ncheck:session-verdict — ${findings.length} finding(s).\n`);
  for (const f of findings) console.error(`  ${f.where}\n    ${f.what}\n    -> ${f.remedy}\n`);
  if (process.argv.includes("--strict")) exitAfterDrain(1);
}

if (require.main === module || process.argv[1]?.endsWith("check-session-verdict.ts")) {
  void main();
}
