// lib/route-manifest/match.ts
//
// THE ONE MATCHER FROM A CONCRETE PATH TO THE ROUTE THAT ANSWERS IT.
//
// `manifest.generated.json` is the derived truth about which routes exist and
// which of them are honest stand-ins (`lib/route-manifest/generate.ts`), but it
// stores Next.js PATTERNS (`/marketing/brands/[brandId]/[[...rest]]`). Anything
// holding a real href — a config row, a notification's deep link, a test
// censusing either — has to turn `/marketing/brands` into the pattern that
// serves it, and doing that by hand is how a plausible-looking path gets
// declared and nobody notices it answers nothing (V-27 NEW-1: a connector row
// whose "first useful action" is a route could only ever be checked for a
// leading slash).
//
// The segment rules are Next.js's own: an OPTIONAL catch-all matches zero
// segments AND consumes the separator before it, a required catch-all needs at
// least one segment, and `[param]` is exactly one.
import manifest from "./manifest.generated.json";
import type { RouteManifest, RouteManifestEntry, RouteStatus } from "./generate";

const MANIFEST = manifest as RouteManifest;

function patternRegExp(pattern: string): RegExp {
  return new RegExp(
    `^${pattern
      .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, "(?:/(.*))?")
      .replace(/\[\[\.\.\.[^\]]+\]\]/g, "(.*)")
      .replace(/\[\.\.\.[^\]]+\]/g, "(.+)")
      .replace(/\[[^\]]+\]/g, "([^/]+)")}$`,
  );
}

const MATCHERS: ReadonlyArray<{ entry: RouteManifestEntry; re: RegExp }> =
  MANIFEST.routes.map((entry) => ({ entry, re: patternRegExp(entry.pattern) }));

/**
 * The manifest row that serves this href, or `null` when nothing does (an
 * `unbuilt` route — absence from the manifest is how the generator spells it).
 * Query and hash are ignored: they are the route's business, not the router's.
 */
export function routeEntryFor(href: string): RouteManifestEntry | null {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  // 🚨 SPECIFICITY IS NEXT.JS'S, NOT STRING LENGTH. `/marketing/brands` matches
  // BOTH `/marketing/brands` and `/marketing/[brandId]`, and Next.js serves the
  // static one; ranking by pattern length picks `/marketing/[brandId]` (longer
  // by three characters) and would report the roster's own page as the dynamic
  // client page. A static segment beats a dynamic one, which beats a catch-all,
  // left to right — and a shorter pattern that got there with static segments
  // beats a longer one that guessed.
  const hits = MATCHERS.filter(({ re }) => re.test(path));
  if (hits.length === 0) return null;
  return hits.sort((a, b) => compareSpecificity(a.entry.pattern, b.entry.pattern))[0].entry;
}

/** 4 static · 3 `[param]` · 2 `[...all]` · 1 `[[...all]]`, one score per segment. */
function segmentScores(pattern: string): number[] {
  return pattern
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith("[[...")
        ? 1
        : segment.startsWith("[...")
          ? 2
          : segment.startsWith("[")
            ? 3
            : 4,
    );
}

/** Negative when `a` is the more specific pattern — the sort's "first". */
function compareSpecificity(a: string, b: string): number {
  const left = segmentScores(a);
  const right = segmentScores(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    // A pattern that ran out of segments and still matched did it with a
    // catch-all, so it is the less specific of the two.
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** `live`, `placeholder`, or `unbuilt` when no route answers at all. */
export function routeStatusFor(href: string): RouteStatus {
  return routeEntryFor(href)?.status ?? "unbuilt";
}
