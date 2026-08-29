/*
  🚨 NOBODY HAND-ASSEMBLES AN HR URL — AND THE TYPE SYSTEM CANNOT SEE THAT LAW BEING BROKEN.

  `features/hr/routes.ts` opens with that rule and gives the reason: the employer
  travels in `?org=`, HR is strictly single-employer, and a link that drops the
  param silently lands the user in a DIFFERENT employer. On 2026-08-28 every one
  of the 49 builders in that file was changed to take `org` as a REQUIRED
  argument, so `hrTimePeriodsHref()` became a compile error.

  A string literal is invisible to that change. `<Link href="/hr/tasks">` type-checks
  perfectly and drops the employer on every click. Proven live the same day: from
  `/hr/tasks/<id>?org=2643e470-…` the back link's DOM href read `/hr/tasks` and
  activating it landed on `/hr/tasks` with no employer at all. The compiler had
  nothing to say, because there was no call to check.

  So the guard for this shape has to be TEXTUAL, and this is it. It reads every
  `.ts`/`.tsx` under `features/hr/**` and `app/(core)/hr/**`, blanks the comments,
  and fails on an `/hr…` string or template literal sitting in NAVIGATION POSITION:

    • an `href` / `…Href` prop or object key            `<Link href="/hr/tasks">`
    • `router.push` / `router.replace` / `router.prefetch`
    • `redirect` / `permanentRedirect`
    • `location.href =` / `location.assign` / `location.replace`

  Navigation position is the whole point of the narrowing. `/hr` is ALSO the prefix
  of the aidream server's own HTTP routes (`hrApiGet("/hr/exports/formats")`), of
  `createRouteMetadata("/hr/assets", …)`, and of pathname READS
  (`pathname.startsWith("/hr/me")`). None of those navigate anywhere, none of them
  can drop an employer, and a guard that shouted about them would be turned off
  within a week. What is banned is a hand-built URL the product LINKS TO.

  ── THE ESCAPE HATCH, AND WHY IT IS A COMMENT AND NOT A HEURISTIC ──────────────
  A few sites legitimately rebuild a URL from `useSearchParams()`, which PRESERVES
  `?org=` because the whole existing query string is carried over. That is safe,
  and it is also textually indistinguishable from the unsafe shape without type
  information this test does not have. Rather than guess, such a site writes
  `hr-url-exempt: <reason>` in a comment on the offending line or the line above.
  The exemption is therefore visible in the diff and has an author — which is the
  same standard `routes.ts` set when it required a caller with no employer to
  write `null` on purpose instead of just omitting the argument.
*/

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO = join(__dirname, "..", "..", "..");

/** The two trees the HR module's own navigation is written in. */
const TREES = ["features", "app", "components", "lib"];

/**
 * The URL BUILDERS. These files exist to assemble `/hr/*` strings; banning the
 * literal here would ban the only correct place to write one.
 */
const BUILDERS = [
  join("features", "hr", "routes.ts"),
  join("features", "hr", "leave", "hrefs.ts"),
  join("features", "hr", "leave", "manager", "routes.ts"),
];

/** Marker that makes one line a deliberate, authored exception. */
const EXEMPT = "hr-url-exempt";

/**
 * Blank every comment, preserving byte offsets so line/column numbers stay true.
 * Without this the test would fail on the dozens of doc comments that (correctly)
 * name routes in prose — `routes.ts`'s own header among them.
 */
function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") {
        out[i] = " ";
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      continue;
    }
    // A string keeps its contents — that is what we are here to read. Skipping it
    // wholesale also stops a `//` INSIDE a URL from blanking the rest of the line.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * A navigation sink, immediately followed by an `/hr…` literal.
 *
 * `[\w$]*[Hh]ref` covers both the bare `href=` and every named variant the module
 * actually uses (`personaHomeHref`, `adjustmentHref`, `ledgerHref`, …). The
 * uppercase `HREF` of a constant name is deliberately NOT matched: `HR_HREF` in
 * `routes.ts` is a declaration, not a destination.
 */
const NAVIGATES = new RegExp(
  "(?:" +
    "\\b[\\w$]*[Hh]ref\\b\\s*[=:]\\s*\\{?\\s*" +
    "|\\brouter\\s*\\.\\s*(?:push|replace|prefetch)\\s*\\(\\s*" +
    "|\\b(?:redirect|permanentRedirect)\\s*\\(\\s*" +
    "|\\blocation\\s*\\.\\s*(?:href\\s*=|assign\\s*\\(|replace\\s*\\()\\s*" +
    ")" +
    "([\"'`])(/hr(?:[/?][^\"'`\\n]*)?)\\1",
  "g",
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  url: string;
  source: string;
}

export function handBuiltHrUrls(): Violation[] {
  const found: Violation[] = [];
  for (const tree of TREES) {
    for (const file of sourceFiles(join(REPO, tree))) {
      const rel = relative(REPO, file);
      if (BUILDERS.includes(rel)) continue;
      if (rel.split(sep).includes("__tests__")) continue;

      const raw = readFileSync(file, "utf8");
      const blanked = blankComments(raw);
      const rawLines = raw.split("\n");

      NAVIGATES.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = NAVIGATES.exec(blanked)) !== null) {
        const line = blanked.slice(0, match.index).split("\n").length;
        // The literal can start on a later line than the `href=` that introduced it.
        const literalLine =
          blanked.slice(0, match.index + match[0].length).split("\n").length;
        const nearby = [
          rawLines[literalLine - 3] ?? "",
          rawLines[literalLine - 2] ?? "",
          rawLines[literalLine - 1] ?? "",
        ].join("\n");
        if (nearby.includes(EXEMPT)) continue;
        found.push({
          file: rel,
          line: literalLine,
          url: match[2],
          source: (rawLines[literalLine - 1] ?? rawLines[line - 1] ?? "").trim(),
        });
      }
    }
  }
  return found;
}

describe("no HR URL is hand-assembled in navigation position", () => {
  it("routes every /hr link through features/hr/routes.ts", () => {
    const offenders = handBuiltHrUrls().map(
      (v) => `${v.file}:${v.line}  ${v.url}\n      ${v.source}`,
    );
    expect(offenders).toEqual([]);
  });

  /*
    A guard that cannot fail proves nothing. These two pin the detector itself: the
    shape that shipped the live defect is caught, and the shapes that legitimately
    name `/hr/*` without navigating to it are not.
  */
  it("catches the exact shape that dropped the employer, and spares the ones that cannot", () => {
    const caught = (src: string) => {
      NAVIGATES.lastIndex = 0;
      return NAVIGATES.test(blankComments(src));
    };

    // The two literals a hostile re-verify found alive on 2026-08-28.
    expect(caught('<Link href="/hr/tasks">All HR tasks</Link>')).toBe(true);
    expect(caught('<Link href="/hr/me">Open my HR record</Link>')).toBe(true);
    // Hand-appended `?org=` — banned by name in routes.ts's header.
    expect(caught("href={`/hr/tasks?org=${encodeURIComponent(id)}`}")).toBe(true);
    // A named href prop is a destination too.
    expect(caught('personaHomeHref="/hr/me"')).toBe(true);
    expect(caught("router.push(`/hr/time/punches?${q}`)")).toBe(true);

    // Server HTTP routes, route metadata keys, pathname reads, copy provenance.
    expect(caught('hrApiGet("/hr/exports/formats", opts)')).toBe(false);
    expect(caught('createRouteMetadata("/hr/assets", {')).toBe(false);
    expect(caught('pathname.startsWith("/hr/me")')).toBe(false);
    expect(caught('location: "/hr/people",')).toBe(false);

    // Prose naming a route is not a link to one.
    expect(caught('// the back link points at "/hr/tasks"')).toBe(false);
    expect(caught('/* href="/hr/tasks" is what this used to be */')).toBe(false);

    // Builders are how it is SUPPOSED to be written.
    expect(caught("href={hrTasksHref(orgRef)}")).toBe(false);
  });

  it("honours an authored exemption and nothing else", () => {
    const files = handBuiltHrUrls();
    // The exemption marker must be spelled out; a bare comment does not exempt.
    expect(files.every((v) => !v.source.includes(EXEMPT))).toBe(true);
  });
});
