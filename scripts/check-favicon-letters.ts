/**
 * scripts/check-favicon-letters.ts — TWO CHARACTERS, AND NO TWO TABS OF ONE COLOUR
 * MAY WEAR THE SAME BADGE.
 *
 * Every route's browser-tab favicon is a coloured tile carrying a 1–2 character
 * code (or a single emoji). The COLOUR says which family the tab belongs to; the
 * letter says which page inside that family.
 *
 * TWO RULES, both from Arman on 2026-09-18/21:
 *
 *  1. **LENGTH — never more than 2 characters.** Three characters is unreadable
 *     at 16px; the glyphs shrink until the badge is a grey smear. When a page
 *     will not reduce to two letters, it gets an `emoji` instead (Launchpad is
 *     🚀) — never a third character. 132 three-character codes existed when this
 *     rule landed.
 *
 *  2. **COLLISION IS PER COLOUR.** "Since the color is what sets them apart" —
 *     `/administration/agents` wears the SAME "AG" as `/agents`, in near-black
 *     instead of rose. So a letter is judged only against the other routes that
 *     resolve to the SAME colour, and two routes where neither is an ancestor of
 *     the other may not share one. There is no global uniqueness requirement and
 *     never was a good reason for one: an admin tab and a core tab are already
 *     two different tiles.
 *
 * The colour is resolved by the SHIPPING resolver (`getFaviconConfigByPath`), so
 * this guard cannot disagree with what the browser renders.
 *
 * WHERE IT LOOKS: `constants/favicon-route-data.ts` (the prefix-matched registry)
 * and every `letter:` / `emoji:` in an `app/**\/layout.tsx(.dev.tsx)`. A layout
 * owns the tab for its whole subtree, so it is the unit a browser tab
 * corresponds to.
 *
 * THE ESCAPE, for a badge deliberately shared by two unrelated routes of one
 * colour (a compatibility alias, a lab page that DISPLAYS other routes' badges):
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
import { getFaviconConfigByPath } from "../utils/favicon-utils";

const REGISTRY = "constants/favicon-route-data.ts";

/** THE HARD CAP. A badge is at most two characters. */
export const MAX_LETTER_LENGTH = 2;

/** `// favicon-letter-ok: <reason>` — the reason is mandatory. */
const ESCAPE = /favicon-letter-ok:\s*(\S.*)$/;

interface Assignment {
  letter: string;
  route: string;
  file: string;
  line: number;
  /** An emoji badge is exempt from the length cap — one glyph fills the tile. */
  isEmoji: boolean;
}

/**
 * app/(core)/agents/[id]/build/layout.tsx → /agents/[id]/build
 * Route groups — the `(core)` / `(admin)` / `(dev)` segments — are not part of
 * a URL, so they are dropped before comparison.
 */
export function routeFromFile(file: string): string {
  const segments = file
    .replace(/^app\//, "")
    .replace(/\/(layout|page)(\.dev)?\.tsx$/, "")
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

/**
 * The colour a route's badge actually renders in — the registry's prefix match,
 * or a locked system-family colour. A route we cannot resolve lands in its own
 * bucket keyed by the route, which is the conservative reading: we never merge
 * two routes into one family on a guess.
 */
function colorForRoute(route: string): string {
  try {
    return getFaviconConfigByPath(route)?.color ?? `unresolved:${route}`;
  } catch {
    return `unresolved:${route}`;
  }
}

/** Every `letter:` / `emoji:` in a file, with its line and its escape, if any. */
function scanFile(
  file: string,
  source: string,
  routeOf: (idx: number) => string | null,
): Assignment[] {
  const lines = source.split("\n");
  const found: Assignment[] = [];
  lines.forEach((line, idx) => {
    const m = /(letter|emoji):\s*"([^"]+)"/.exec(line);
    if (!m) return;
    const escaped = ESCAPE.exec(line) || (idx > 0 ? ESCAPE.exec(lines[idx - 1]) : null);
    if (escaped) return;
    const route = routeOf(idx);
    if (route === null) return;
    found.push({ letter: m[2], route, file, line: idx + 1, isEmoji: m[1] === "emoji" });
  });
  return found;
}

function collect(root: string): Assignment[] {
  const out: Assignment[] = [];

  const registrySource = readFileSync(`${root}/${REGISTRY}`, "utf8");
  const registryLines = registrySource.split("\n");
  out.push(
    ...scanFile(REGISTRY, registrySource, (idx) => {
      // The href is on this line or a few lines above (prettier breaks long entries).
      for (let i = idx; i >= Math.max(0, idx - 4); i--) {
        const h = /href:\s*"([^"]+)"/.exec(registryLines[i]);
        if (h) return h[1];
      }
      return null;
    }),
  );

  // Tracked AND untracked-but-not-ignored: a guard judges what is on disk. A
  // tracked-only read could not see a layout written in the same session, so two
  // new siblings handed the same badge passed until someone committed them.
  const files = execSync(
    `git ls-files --cached --others --exclude-standard 'app/**/layout.tsx' 'app/**/layout.dev.tsx'`,
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split("\n")
    .filter(Boolean);

  for (const file of files) {
    const source = readFileSync(`${root}/${file}`, "utf8");
    if (!source.includes("letter:") && !source.includes("emoji:")) continue;
    const route = routeFromFile(file);
    out.push(...scanFile(file, source, () => route));
  }

  return out;
}

interface Report {
  tooLong: string[];
  collisions: string[];
}

export function judge(assignments: Assignment[]): Report {
  const tooLong: string[] = [];
  for (const a of assignments) {
    if (a.isEmoji) continue;
    // Count CODE POINTS, not UTF-16 units — the tile renders glyphs.
    if ([...a.letter].length > MAX_LETTER_LENGTH) {
      tooLong.push(
        `      "${a.letter}" (${[...a.letter].length} chars) on ${a.route}  — ${a.file}:${a.line}`,
      );
    }
  }

  // Bucket by the colour the badge actually renders in: a letter is only ever
  // confusable with another letter on the same coloured tile.
  const byFamily = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${colorForRoute(a.route)}\u0000${a.letter.toLowerCase()}`;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(a);
  }

  const collisions: string[] = [];
  for (const [key, group] of [...byFamily.entries()].sort()) {
    const [color, letter] = key.split("\u0000");

    const routes = new Map<string, Assignment>();
    for (const a of group) if (!routes.has(a.route)) routes.set(a.route, a);
    const distinct = [...routes.values()];
    if (distinct.length < 2) continue;

    const unrelated = distinct.filter((a) =>
      distinct.some((b) => b !== a && !related(a.route, b.route)),
    );
    if (unrelated.length < 2) continue;

    collisions.push(
      `  [${letter}] on ${color} — ${unrelated.length} unrelated routes:\n` +
        unrelated.map((a) => `      ${a.route}  (${a.file}:${a.line})`).join("\n"),
    );
  }

  return { tooLong, collisions };
}

function selfTest(): number {
  const A = (letter: string, route: string, isEmoji = false): Assignment => ({
    letter,
    route,
    file: "x",
    line: 1,
    isEmoji,
  });

  const cases: Array<[string, Assignment[], "tooLong" | "collision" | "clean"]> = [
    ["a three-character letter is an offence", [A("BTU", "/agents/battle/tuning")], "tooLong"],
    ["two characters are fine", [A("BT", "/agents/battle/tuning")], "clean"],
    ["an emoji badge is exempt from the cap", [A("🚀", "/launchpad", true)], "clean"],
    [
      "two unrelated routes of the SAME colour sharing a badge is an offence",
      [A("BT", "/agents/battle"), A("Bt", "/agents/compare")],
      "collision",
    ],
    [
      "the same badge on two DIFFERENT colours is fine — the colour sets them apart",
      [A("AG", "/agents"), A("AG", "/administration/agents")],
      "clean",
    ],
    [
      "a parent and its own sub-page sharing a badge is fine",
      [A("Pt", "/print"), A("Pt", "/print/qr")],
      "clean",
    ],
  ];

  let failed = 0;
  for (const [name, input, expect] of cases) {
    const r = judge(input);
    const got = r.tooLong.length > 0 ? "tooLong" : r.collisions.length > 0 ? "collision" : "clean";
    if (got !== expect) {
      console.error(`  SELF-TEST FAILED: ${name} — expected ${expect}, got ${got}`);
      failed++;
    } else {
      console.log(`  ok: ${name}`);
    }
  }

  const derived = routeFromFile("app/(core)/agents/[id]/build/layout.tsx");
  if (derived !== "/agents/[id]/build") {
    console.error(`  SELF-TEST FAILED: routeFromFile → ${derived}, expected /agents/[id]/build`);
    failed++;
  } else {
    console.log("  ok: route groups are stripped from the derived route");
  }

  // The colour resolver is the half that decides which letters are compared at
  // all — prove it actually separates admin from core.
  if (colorForRoute("/administration/agents") === colorForRoute("/agents")) {
    console.error("  SELF-TEST FAILED: admin and core resolve to the same colour");
    failed++;
  } else {
    console.log("  ok: admin and core routes resolve to different colours");
  }

  return failed === 0 ? 0 : 3;
}

function main(): number {
  if (process.argv.slice(2).includes("--self-test")) {
    console.log("check-favicon-letters self-test");
    return selfTest();
  }

  const assignments = collect(process.cwd());
  const { tooLong, collisions } = judge(assignments);

  console.log(`check-favicon-letters: ${assignments.length} badge assignments read`);

  if (tooLong.length === 0 && collisions.length === 0) {
    console.log("\nEvery badge is at most 2 characters, and no two tabs of one colour share one.");
    return 0;
  }

  if (tooLong.length > 0) {
    console.error(`\n${tooLong.length} badge(s) longer than ${MAX_LETTER_LENGTH} characters:`);
    for (const t of tooLong) console.error(t);
    console.error(
      `\nThree characters is unreadable at 16px. Shorten to two, or — when the page will\n` +
        `not reduce to two letters — give the registry entry an \`emoji\` instead (Launchpad\n` +
        `is 🚀). The colour already says which family the tab belongs to.`,
    );
  }

  if (collisions.length > 0) {
    console.error(`\n${collisions.length} badge(s) worn by unrelated routes of the SAME colour:`);
    for (const c of collisions) console.error(c);
    console.error(
      `\nGive each route its own 2-character code within its colour family, or, when two\n` +
        `tabs may genuinely look identical, annotate the line with\n` +
        `  // favicon-letter-ok: <reason>.`,
    );
  }

  return 2;
}

exitAfterDrain(main());
