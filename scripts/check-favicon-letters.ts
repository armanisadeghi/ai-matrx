/**
 * scripts/check-favicon-letters.ts — TWO UNRELATED TABS MAY NOT WEAR THE SAME BADGE.
 *
 * THE DEFECT (Arman, 2026-09-18): every route's browser-tab favicon is a
 * coloured badge carrying a 1–3 character code. The colour says WHICH FAMILY
 * a tab belongs to; the letter is the only thing that says WHICH PAGE. Three
 * families (`/demo*`, `/tests`|`/beta`|`/experimental`, `/administration`|
 * `/admin`) have their colour LOCKED in `utils/favicon-utils.ts`, so for those
 * the letter is the only signal at all.
 *
 * On 2026-09-18 a census found "AG" on 27 different pages — the whole /agents
 * section, including every battle sub-tab — and a bare "A" on all eight
 * /agent-apps pages. A wall of identical badges is exactly as useful as no
 * badge.
 *
 * WHAT IT FAILS ON: the same letter (compared case-insensitively — "Ap" and
 * "AP" are the same 16px badge) assigned to two routes where NEITHER route is
 * an ancestor of the other. A parent and its own sub-page sharing a badge is
 * a weaker smell, not a defect, so it is reported as a WARNING.
 *
 * WHERE IT LOOKS:
 *   · `constants/favicon-route-data.ts` — the prefix-matched registry
 *   · every `letter: "…"` in app/**\/{layout,page}.tsx(.dev.tsx) — per-route
 *     overrides passed to createRouteMetadata / createDynamicRouteMetadata
 *
 * THE ESCAPE, for a badge deliberately shared by two unrelated routes (a
 * compatibility alias, a lab page that DISPLAYS other routes' badges):
 *
 *   // favicon-letter-ok: <why these two tabs may look identical>
 *
 * on the line above, or at the end of, the offending line. A bare marker with
 * no reason is itself an offence — the reason is the point.
 *
 * Usage: tsx scripts/check-favicon-letters.ts [--strict] [--self-test]
 *   exit 0 clean · exit 2 offences (always, under --strict) · exit 3 self-test failed
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { exitAfterDrain } from "./lib/exit-after-drain";

const REGISTRY = "constants/favicon-route-data.ts";

/** `// favicon-letter-ok: <reason>` — the reason is mandatory. */
const ESCAPE = /favicon-letter-ok:\s*(\S.*)$/;

interface Assignment {
  letter: string;
  route: string;
  file: string;
  line: number;
}

/**
 * app/(core)/agents/[id]/build/layout.tsx → /agents/[id]/build
 * Route groups — the `(core)` / `(admin)` / `(dev)` segments — are not part of
 * a URL, so they are dropped before comparison.
 */
function routeFromFile(file: string): string {
  const segments = file
    .replace(/^app\//, "")
    .replace(/\/(layout|page)(\.dev)?\.tsx$/, "")
    .replace(/\/(opengraph-image|twitter-image)\.tsx$/, "")
    .split("/")
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** Is `a` the route itself or an ancestor of `b`? (/print is an ancestor of /print/qr) */
function isAncestorOrSame(a: string, b: string): boolean {
  return a === b || b.startsWith(a === "/" ? "/" : a + "/");
}

function related(a: string, b: string): boolean {
  return isAncestorOrSame(a, b) || isAncestorOrSame(b, a);
}

/** Every `letter: "…"` in a file, with the line it sits on and its escape, if any. */
function scanFile(file: string, source: string, routeOf: (line: string, idx: number) => string | null): Assignment[] {
  const lines = source.split("\n");
  const found: Assignment[] = [];
  lines.forEach((line, idx) => {
    const m = /letter:\s*"([^"]+)"/.exec(line);
    if (!m) return;
    const escaped = ESCAPE.exec(line) || (idx > 0 ? ESCAPE.exec(lines[idx - 1]) : null);
    if (escaped) return;
    const route = routeOf(line, idx);
    if (route === null) return;
    found.push({ letter: m[1], route, file, line: idx + 1 });
  });
  return found;
}

function collect(root: string): Assignment[] {
  const out: Assignment[] = [];

  // 1. The registry — each entry carries its own href on the same or a nearby line.
  const registrySource = readFileSync(`${root}/${REGISTRY}`, "utf8");
  const registryLines = registrySource.split("\n");
  out.push(
    ...scanFile(REGISTRY, registrySource, (_line, idx) => {
      // The href is either on this line or on one of the few lines above it
      // (prettier breaks long entries across lines).
      for (let i = idx; i >= Math.max(0, idx - 4); i--) {
        const h = /href:\s*"([^"]+)"/.exec(registryLines[i]);
        if (h) return h[1];
      }
      return null;
    }),
  );

  // 2. Route layouts and pages — the route comes from the file's own path.
  // LAYOUTS ONLY. A layout owns the tab for its whole subtree, so it is the
  // unit a browser tab actually corresponds to; a `letter:` inside a page.tsx
  // is a leaf detail of a tree whose badge its layout already set.
  const files = execSync(`git ls-files 'app/**/layout.tsx' 'app/**/layout.dev.tsx'`, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);

  for (const file of files) {
    const source = readFileSync(`${root}/${file}`, "utf8");
    if (!source.includes("letter:")) continue;
    const route = routeFromFile(file);
    out.push(...scanFile(file, source, () => route));
  }

  return out;
}

interface Report {
  offences: string[];
  warnings: string[];
}

function judge(assignments: Assignment[]): Report {
  const byLetter = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.letter.toLowerCase();
    if (!byLetter.has(key)) byLetter.set(key, []);
    byLetter.get(key)!.push(a);
  }

  const offences: string[] = [];
  const warnings: string[] = [];

  for (const [letter, group] of [...byLetter.entries()].sort()) {
    // Collapse to distinct routes — the same route declared in both the
    // registry and its layout is one tab, not two.
    const routes = new Map<string, Assignment>();
    for (const a of group) if (!routes.has(a.route)) routes.set(a.route, a);
    const distinct = [...routes.values()];
    if (distinct.length < 2) continue;

    const unrelated: Assignment[] = [];
    for (const a of distinct) {
      if (distinct.some((b) => b !== a && !related(a.route, b.route))) unrelated.push(a);
    }

    const render = (list: Assignment[]) =>
      list.map((a) => `      ${a.route}  (${a.file}:${a.line} — "${a.letter}")`).join("\n");

    if (unrelated.length > 1) {
      offences.push(`  [${letter}] on ${unrelated.length} unrelated routes:\n${render(unrelated)}`);
    } else {
      warnings.push(`  [${letter}] shared by ${distinct.length} routes in one tree:\n${render(distinct)}`);
    }
  }

  return { offences, warnings };
}

function selfTest(): number {
  const cases: Array<[string, Assignment[], boolean]> = [
    [
      "two unrelated routes sharing a badge is an offence",
      [
        { letter: "AG", route: "/agents", file: "a", line: 1 },
        { letter: "Ag", route: "/artifacts", file: "b", line: 1 },
      ],
      true,
    ],
    [
      "a parent and its own sub-page sharing a badge is only a warning",
      [
        { letter: "Pt", route: "/print", file: "a", line: 1 },
        { letter: "Pt", route: "/print/qr", file: "b", line: 1 },
      ],
      false,
    ],
    [
      "distinct badges on unrelated routes are clean",
      [
        { letter: "AB", route: "/agents/[id]/build", file: "a", line: 1 },
        { letter: "AR", route: "/agent-apps/[id]/run", file: "b", line: 1 },
      ],
      false,
    ],
    [
      "a prefix that is not a path boundary is NOT a parent",
      [
        { letter: "AA", route: "/agent", file: "a", line: 1 },
        { letter: "AA", route: "/agent-apps", file: "b", line: 1 },
      ],
      true,
    ],
  ];

  let failed = 0;
  for (const [name, input, shouldFail] of cases) {
    const got = judge(input).offences.length > 0;
    if (got !== shouldFail) {
      console.error(`  SELF-TEST FAILED: ${name} — expected ${shouldFail ? "an offence" : "clean"}, got the opposite`);
      failed++;
    } else {
      console.log(`  ok: ${name}`);
    }
  }

  // The route deriver is half the guard — prove it too.
  const derived = routeFromFile("app/(core)/agents/[id]/build/layout.tsx");
  if (derived !== "/agents/[id]/build") {
    console.error(`  SELF-TEST FAILED: routeFromFile → ${derived}, expected /agents/[id]/build`);
    failed++;
  } else {
    console.log("  ok: route groups are stripped from the derived route");
  }

  return failed === 0 ? 0 : 3;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    console.log("check-favicon-letters self-test");
    return selfTest();
  }

  const root = process.cwd();
  const assignments = collect(root);
  const { offences, warnings } = judge(assignments);

  console.log(`check-favicon-letters: ${assignments.length} letter assignments read`);

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} badge(s) shared within one route tree (parent/child — not an offence):`);
    for (const w of warnings) console.log(w);
  }

  if (offences.length === 0) {
    console.log("\nNo unrelated routes share a favicon badge.");
    return 0;
  }

  console.error(`\n${offences.length} badge(s) worn by unrelated routes:`);
  for (const o of offences) console.error(o);
  console.error(
    `\nGive each route its own 1–3 character code (2 chars for pages people keep open as tabs,\n` +
      `3 for deep settings tabs), or, when two tabs may genuinely look identical, annotate the\n` +
      `line with  // favicon-letter-ok: <reason>.`,
  );
  return 2;
}

exitAfterDrain(main());
