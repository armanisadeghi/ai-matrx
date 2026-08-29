/*
  🚨 NO `/hr/*` ROUTE MAY OPEN A DIFFERENT EMPLOYER IN SILENCE.

  `useHrContext` law B says the employer that OPENS is never substituted for the one
  that was ASKED FOR without the page saying so, and `HrEmployerSubstitutionNotice`
  is the sentence. For months that sentence lived in `HrShell` alone — and thirteen
  `/hr` pages do not mount `HrShell`. Among them: `/hr/tasks/[instanceId]`, the route
  every HR notification deep-links to, and the whole `/hr/me/*` family.

  Measured live on 2026-08-29, signed in as an admin whose active employer is
  `admin's Workspace`:

    /hr?org=no-such-employer-slug              → "That link named an employer you
                                                  can't do HR in, so this is
                                                  admin's Workspace."          ✅
    /hr/tasks/<instance>?org=no-such-…-slug    → silence, and another employer's
                                                  pay change on screen.        ❌
    /hr/tasks?org=no-such-employer-slug        → silence.                      ❌
    /hr/me?org=no-such-employer-slug           → silence.                      ❌

  HR is strictly single-employer; merging two employers' headcount, timesheets or pay
  is a compliance defect. A deep link is precisely where employers get crossed, so the
  landing surface is precisely where the disclosure may not be optional.

  The fix hung the notice off `HrPageState` — the ordered state machine every HR
  surface already runs through — plus the three chromes that state it above the page.
  THIS TEST IS WHAT KEEPS A FOURTEENTH ROUTE FROM SLIPPING THROUGH: it walks each
  page's import graph and fails when nothing in it renders the notice.

  ── WHY AN IMPORT WALK AND NOT A RENDER ──────────────────────────────────────
  Import reachability over-approximates: a page whose graph contains a disclosing
  chrome might still not RENDER it. That is deliberate. The failure this guard is
  built for is "somebody added an HR route that is wired to no HR chrome at all",
  which import reachability catches exactly. The render half is held by
  `features/hr/shared/__tests__/hr-page-state-states-the-substitution.test.tsx`,
  and by the OWNERS assertion below, which pins the small set of files allowed to
  render the notice so a fifth one cannot appear and double up.
*/

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO = join(__dirname, "..", "..", "..");
const HR_ROUTES = join(REPO, "app", "(core)", "hr");
const CORE = join(REPO, "app", "(core)");

/** The JSX that states law B. Its presence in a file is what "discloses" means. */
const RENDERS_NOTICE = /<HrEmployerSubstitutionNotice[\s/>]/;

/**
 * The files allowed to render the notice, and why each one is not the others:
 *   • `HrPageState`   — the universal state machine; covers every surface that runs it.
 *   • `HrShell`       — states it above the breadcrumbs on shell routes, then CLAIMS it.
 *   • `HrTaskInbox`   — `/hr/tasks` is a `PageHeader` route with no shell.
 *   • `HrDecisionPanel` — `/hr/tasks/[instanceId]`, same, and it is the deep-link landing.
 * Adding a fifth without claiming through `HrDisclosureClaimed` renders it twice.
 */
const OWNERS = [
  join("features", "hr", "shared", "HrStates.tsx"),
  join("features", "hr", "shared", "HrShell.tsx"),
  join("features", "hr", "tasks", "components", "HrTaskInbox.tsx"),
  join("features", "hr", "tasks", "components", "HrDecisionPanel.tsx"),
];

/**
 * A route that renders NOTHING has nothing to disclose. `/hr/time` is a bare
 * `redirect()` to `/hr/time/timesheets` — the destination discloses. Every other
 * exemption needs the same standard: no rendered output at all, not "it seemed fine".
 */
const NO_RENDERED_OUTPUT = [join("app", "(core)", "hr", "time", "page.tsx")];

function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(REPO, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package, not our code
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

/** Depth-first over static and dynamic imports; true as soon as one file discloses. */
function reachesDisclosure(entry: string): boolean {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (RENDERS_NOTICE.test(src)) return true;
    for (const match of src.matchAll(IMPORT_SPEC)) {
      const next = resolveSpec(match[1], file);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return false;
}

/** Every `layout.tsx` between the page and `app/(core)` wraps it, so each may disclose. */
function layoutsWrapping(pageFile: string): string[] {
  const out: string[] = [];
  let dir = dirname(pageFile);
  while (dir.startsWith(CORE)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) out.push(layout);
    dir = dirname(dir);
  }
  return out;
}

function hrPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) hrPages(p, acc);
    else if (entry.name === "page.tsx") acc.push(p);
  }
  return acc;
}

describe("every /hr route can state which employer it opened", () => {
  const pages = hrPages(HR_ROUTES);

  it("finds the HR route tree (a zero-page walk would pass vacuously)", () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it("reaches the substitution notice from every page", () => {
    const silent = pages
      .map((p) => relative(REPO, p))
      .filter((rel) => !NO_RENDERED_OUTPUT.includes(rel))
      .filter((rel) => {
        const abs = join(REPO, rel);
        return ![abs, ...layoutsWrapping(abs)].some(reachesDisclosure);
      });

    expect(silent).toEqual([]);
  });

  it("keeps the notice's renderers to the four that claim correctly", () => {
    const rendering: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx$/.test(entry.name)) {
          if (RENDERS_NOTICE.test(readFileSync(p, "utf8"))) rendering.push(relative(REPO, p));
        }
      }
    };
    walk(join(REPO, "features", "hr"));
    walk(join(REPO, "app", "(core)", "hr"));

    expect(rendering.sort()).toEqual([...OWNERS].sort());
  });
});
