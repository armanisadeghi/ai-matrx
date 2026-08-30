// lib/route-manifest/generate.ts
//
// THE ONE PLACE THAT KNOWS WHICH ROUTES CAN ACTUALLY ANSWER A LINK.
//
// 🚨 WHY THIS EXISTS. On 2026-08-29 the owner's own phone received an HR SMS
// whose link opened `/hr/me/schedule` — a registered coming-soon placeholder
// that cannot render a shift and ignores the `?shift=` it is handed. The text
// arrived in ~2.5s and was recorded `succeeded`, because nothing anywhere in
// the send path can tell a route that ANSWERS from a route that merely
// RESOLVES. Measured the same day across the HR notification catalog: of 42
// events whose platform default turns SMS ON, **32 declare a deep link to a
// route that is a placeholder or does not exist at all.** One of the 32 reached
// a phone; the other 31 were waiting their turn.
//
// The catalog is NOT wrong to declare those routes — SPEC-NOTIFICATIONS §2.1
// deliberately declares the route a notice WILL open, and SPEC-UI-IA numbers
// them. The defect is that the declaration and the delivery were the same
// sentence. This manifest splits them: the catalog keeps declaring the future
// route, and the spine learns, at send time, whether that route is live TODAY.
//
// 🚨 THIS FILE IS THE ONLY AUTHOR OF THAT TRUTH, AND IT DERIVES IT — never a
// hand-kept list. Two hand-maintained lists in two languages is the drift this
// is built to prevent: `app/**/page.tsx` is the only thing that actually knows
// which routes exist, and the placeholder shells are the only thing that knows
// which of them are honest stand-ins. Both are read here, and everything
// downstream — the checked-in manifest, the `platform.route_manifest` rows the
// Python spine reads — is generated from this walk.

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

/* turbopackIgnore: true */
// This build-time generator deliberately walks the caller-supplied repository
// root. It is never a request-time route, and the root cannot be statically
// traced without pulling the entire checkout into a server bundle.

/** What a route can do for a reader who arrives at it. */
export type RouteStatus =
  /** A real surface. It can answer the link, including its query and hash. */
  | "live"
  /** The route resolves, and renders a REGISTERED coming-soon promise instead
   *  of the thing the link promised. A 200 that is still a dead end. */
  | "placeholder"
  /** No page file at all. A 404 — or, signed out, a login redirect to one. */
  | "unbuilt";

export interface RouteManifestEntry {
  /** Next.js route pattern with route groups stripped, e.g. `/hr/people/[employeeId]`. */
  pattern: string;
  status: Exclude<RouteStatus, "unbuilt">;
  /** For `placeholder`: the `lib/coming-soon/registry.ts` id it renders. */
  promiseKey?: string;
  /** Repo-relative page file, so a disagreement is one `cat` from settled. */
  source: string;
}

export interface RouteManifest {
  /** Bumped when the SHAPE changes; the spine refuses a shape it cannot read. */
  version: 1;
  app: "matrx-frontend";
  /** Every route pattern found — `unbuilt` is ABSENCE from `routes`, so a
   *  truncated manifest is detectable by comparing this to `routes.length`. */
  routeCount: number;
  routes: RouteManifestEntry[];
}

/**
 * The shells that render a REGISTERED promise in place of a real surface.
 *
 * 🚨 A NEW PLACEHOLDER SHELL MUST BE ADDED HERE IN THE SAME COMMIT THAT
 * INTRODUCES IT. This list is the one judgement call in an otherwise derived
 * file, so it is kept short, named, and greppable rather than inferred: a shell
 * this walk does not recognize makes its routes look LIVE, and a route that
 * looks live is exactly how a link reaches a phone. `check-route-manifest`
 * fails when a page hands a `promiseKey` to something this list does not name
 * — a precise tripwire, because `promiseKey` is the placeholder shells' own
 * prop and nothing else in the app uses it.
 */
const PLACEHOLDER_SHELLS = [
  "MePillarSurface",
  "MePillarPlaceholder",
  "HrPillarSurface",
  "HrPillarPlaceholder",
] as const;

const PLACEHOLDER_RE = new RegExp(`\\b(?:${PLACEHOLDER_SHELLS.join("|")})\\b`);
const PROMISE_KEY_RE = /promiseKey\s*=\s*["'`]([^"'`]+)["'`]/;

/** `app/(core)/hr/me/[id]/page.tsx` → `/hr/me/[id]`. Route groups vanish. */
export function patternForPageFile(relativeToAppDir: string): string {
  const segments = relativeToAppDir
    .split(path.sep)
    .slice(0, -1)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    // `@modal` parallel routes and `.` interception markers are not addressable
    // by a link the server mints, so they never become manifest rows.
    .filter((s) => !s.startsWith("@"));
  return "/" + segments.join("/");
}

async function pageFiles(appDir: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(full);
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        found.push(full);
      }
    }
  }
  await walk(appDir);
  return found.sort();
}

export async function generateRouteManifest(repoRoot: string): Promise<RouteManifest> {
  const appDir = path.join(repoRoot, "app");
  const files = await pageFiles(appDir);
  const byPattern = new Map<string, RouteManifestEntry>();

  for (const file of files) {
    const rel = path.relative(appDir, file);
    const pattern = patternForPageFile(rel);
    const source = path.relative(repoRoot, file);
    const src = readFileSync(file, "utf8");
    const isPlaceholder = PLACEHOLDER_RE.test(src);
    const entry: RouteManifestEntry = {
      pattern,
      status: isPlaceholder ? "placeholder" : "live",
      source,
    };
    if (isPlaceholder) {
      const key = PROMISE_KEY_RE.exec(src);
      if (key) entry.promiseKey = key[1];
    }
    // Parallel routes can hand one pattern several page files. A pattern is
    // only LIVE when nothing serving it is a placeholder — the pessimistic
    // read, because the cost of calling a placeholder live is a text message
    // and the cost of calling a live route a placeholder is a dropped link.
    const existing = byPattern.get(pattern);
    if (!existing || (existing.status === "live" && entry.status === "placeholder")) {
      byPattern.set(pattern, entry);
    }
  }

  const routes = [...byPattern.values()].sort((a, b) => a.pattern.localeCompare(b.pattern));
  return { version: 1, app: "matrx-frontend", routeCount: routes.length, routes };
}

/**
 * Pages that render a registered promise through a shell `PLACEHOLDER_SHELLS`
 * does not name — routes this walk would call LIVE and a link would trust.
 */
export async function unclassifiedPromisePages(repoRoot: string): Promise<string[]> {
  const appDir = path.join(repoRoot, "app");
  const out: string[] = [];
  for (const file of await pageFiles(appDir)) {
    const src = readFileSync(file, "utf8");
    if (!PROMISE_KEY_RE.test(src)) continue;
    if (PLACEHOLDER_RE.test(src)) continue;
    out.push(path.relative(repoRoot, file));
  }
  return out;
}
