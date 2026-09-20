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
//
// 🚨 RESOLVING IS NOT ANSWERING, AND A DYNAMIC SEGMENT IS WHERE THE TWO PART
// (V-28 NEW-4). `/marketing/sites/tracking` resolves — Next.js serves it with
// `/marketing/sites/[siteId]` — and then the page looks up the site whose id is
// the literal string "tracking", finds nothing, and refuses. The route is live,
// the status is `live`, and the door still opens onto nothing. So a caller that
// supplies NO parameter values may only be answered by a pattern with NO
// dynamic segments; a caller that does supply them says which ones it filled,
// and only those segments are allowed to be dynamic. `routeStatusFor` alone
// cannot make that distinction, because it never learns where the concrete
// segments in an href came from — `routeAnswerFor` is the check to reach for
// whenever an href is a declared destination rather than one a person just
// typed. The one lawful third door is a route whose segment is a closed
// vocabulary of PAGE NAMES rather than ids — `/user-settings/integrations` is a
// real section, and `./vocabulary.ts` is where a route says so and proves it.
import manifest from "./manifest.generated.json";
import type { RouteManifest, RouteManifestEntry, RouteStatus } from "./generate";
import { closedVocabularyFor } from "./vocabulary";

const MANIFEST = manifest as RouteManifest;

/** One dynamic segment of a pattern and the href segments it swallowed. */
interface FilledSegment {
  /** The declared name: `siteId` for `[siteId]`, `rest` for `[[...rest]]`. */
  name: string;
  /** `[param]` segment source text, e.g. `[siteId]` — for the message. */
  source: string;
  /** The concrete href segments this dynamic segment consumed. May be empty
   *  for an optional catch-all that matched nothing. */
  consumed: string[];
}

function splitSegments(value: string): string[] {
  return value.split("/").filter(Boolean);
}

/**
 * Next.js's own segment walk. Returns the dynamic segments this pattern filled
 * from `pathSegments`, or `null` when the pattern does not serve the path.
 */
function matchPattern(pattern: string, pathSegments: string[]): FilledSegment[] | null {
  const patternSegments = splitSegments(pattern);
  const filled: FilledSegment[] = [];
  let cursor = 0;

  for (let index = 0; index < patternSegments.length; index += 1) {
    const segment = patternSegments[index];
    const isLast = index === patternSegments.length - 1;

    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      // An optional catch-all is only ever the last segment, and matches zero
      // segments as happily as many.
      if (!isLast) return null;
      filled.push({
        name: segment.slice(5, -2),
        source: segment,
        consumed: pathSegments.slice(cursor),
      });
      return filled;
    }

    if (segment.startsWith("[...") && segment.endsWith("]")) {
      if (!isLast) return null;
      const consumed = pathSegments.slice(cursor);
      if (consumed.length === 0) return null; // required catch-all needs one
      filled.push({ name: segment.slice(4, -1), source: segment, consumed });
      return filled;
    }

    if (segment.startsWith("[") && segment.endsWith("]")) {
      if (cursor >= pathSegments.length) return null;
      filled.push({
        name: segment.slice(1, -1),
        source: segment,
        consumed: [pathSegments[cursor]],
      });
      cursor += 1;
      continue;
    }

    if (pathSegments[cursor] !== segment) return null;
    cursor += 1;
  }

  return cursor === pathSegments.length ? filled : null;
}

/** `/a/b?x#y` → `/a/b`; query and hash are the route's business. */
function normalizePath(href: string): string {
  return href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/**
 * The manifest row that serves this href, or `null` when nothing does (an
 * `unbuilt` route — absence from the manifest is how the generator spells it).
 * Query and hash are ignored: they are the route's business, not the router's.
 */
export function routeEntryFor(href: string): RouteManifestEntry | null {
  return resolve(href)?.entry ?? null;
}

interface Resolution {
  entry: RouteManifestEntry;
  filled: FilledSegment[];
}

function resolve(href: string): Resolution | null {
  const pathSegments = splitSegments(normalizePath(href));
  // 🚨 SPECIFICITY IS NEXT.JS'S, NOT STRING LENGTH. `/marketing/brands` matches
  // BOTH `/marketing/brands` and `/marketing/[brandId]`, and Next.js serves the
  // static one; ranking by pattern length picks `/marketing/[brandId]` (longer
  // by three characters) and would report the roster's own page as the dynamic
  // client page. A static segment beats a dynamic one, which beats a catch-all,
  // left to right — and a shorter pattern that got there with static segments
  // beats a longer one that guessed.
  const hits: Resolution[] = [];
  for (const entry of MANIFEST.routes) {
    const filled = matchPattern(entry.pattern, pathSegments);
    if (filled) hits.push({ entry, filled });
  }
  if (hits.length === 0) return null;
  return hits.sort((a, b) => compareSpecificity(a.entry.pattern, b.entry.pattern))[0];
}

/** 4 static · 3 `[param]` · 2 `[...all]` · 1 `[[...all]]`, one score per segment. */
function segmentScores(pattern: string): number[] {
  return splitSegments(pattern).map((segment) =>
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

/** What a declared href really does when somebody follows it. */
export interface RouteAnswer {
  /** The manifest row Next.js would serve it with, or `null` for `unbuilt`. */
  entry: RouteManifestEntry | null;
  status: RouteStatus;
  /** True only when a person following this href lands on the thing it names. */
  answers: boolean;
  /** `null` when it answers; otherwise ONE sentence naming the defect, with
   *  both hrefs in it, ready to print in a failing expectation. */
  problem: string | null;
}

export interface RouteAnswerOptions {
  /**
   * The dynamic segment names this href supplies REAL values for — the params
   * the declaring action carries (`["siteId"]` for a row that already knows
   * which site it means). A name listed here licenses exactly that segment of
   * the pattern to be dynamic; every other dynamic segment means the href's
   * literal text is being read as somebody's id.
   */
  params?: readonly string[];
}

/**
 * 🚨 THE GUARD: does following this href land on the thing it names?
 *
 * Three ways it does not, each named in the returned sentence:
 *   * nothing serves it at all (`unbuilt` — a 404, or a login bounce to one);
 *   * a registered coming-soon PLACEHOLDER serves it (a 200 dead end);
 *   * a DYNAMIC segment swallowed a literal word the caller never declared as
 *     a parameter — `/marketing/sites/tracking` served by
 *     `/marketing/sites/[siteId]`, which opens the site named "tracking".
 *
 * The third is the one V-28 NEW-4 found: it is invisible to `routeStatusFor`,
 * because the route it lands on is perfectly live.
 */
export function routeAnswerFor(href: string, options: RouteAnswerOptions = {}): RouteAnswer {
  const path = normalizePath(href);
  const hit = resolve(path);

  if (!hit) {
    return {
      entry: null,
      status: "unbuilt",
      answers: false,
      problem: `\`${path}\` is served by no route in the manifest — it is a 404.`,
    };
  }

  if (hit.entry.status === "placeholder") {
    const promise = hit.entry.promiseKey ? ` (\`${hit.entry.promiseKey}\`)` : "";
    return {
      entry: hit.entry,
      status: "placeholder",
      answers: false,
      problem: `\`${path}\` is served by \`${hit.entry.pattern}\`, a registered coming-soon placeholder${promise} — a 200 that is still a dead end.`,
    };
  }

  const declared = new Set(options.params ?? []);
  const undeclared = hit.filled.filter((segment) => {
    if (segment.consumed.length === 0) return false; // an optional catch-all that took nothing
    if (declared.has(segment.name)) return false; // the caller supplied this id
    // A segment the ROUTE declares as a closed vocabulary of page names answers
    // when the literal is a member, and is as dead as any other swallowed word
    // when it is not (`./vocabulary.ts`).
    const vocabulary = closedVocabularyFor(hit.entry.pattern, segment.name);
    return !vocabulary?.has(segment.consumed);
  });
  if (undeclared.length > 0) {
    const first = undeclared[0];
    return {
      entry: hit.entry,
      status: hit.entry.status,
      answers: false,
      problem: `\`${path}\` is served by \`${hit.entry.pattern}\` — it would open the ${first.name.replace(/Id$/, "")} named '${first.consumed.join("/")}'.`,
    };
  }

  return { entry: hit.entry, status: hit.entry.status, answers: true, problem: null };
}
