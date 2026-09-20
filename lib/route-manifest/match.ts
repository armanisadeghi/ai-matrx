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
// dynamic segments; a caller that DOES supply them passes the VALUES it filled
// (`{ siteId: site.id }`), and the href's own segment has to carry that exact
// value — a declaration of names alone licenses nothing (V-29 NEW-6, where
// `params: ["siteId"]` made this very href answer `true`). `routeStatusFor` alone
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
 * 🚨 AN ABSOLUTE ADDRESS IS NOT A ROUTE, AND IS NOT A 404 EITHER (V-29 NEW-9).
 * `https://aimatrx.com/marketing/sites/tracking` used to be reported as
 * "served by no route in the manifest — it is a 404", which fails safe with the
 * wrong sentence: it sends the reader hunting for a missing route when the real
 * thing to say is that the manifest only ever speaks for same-origin paths.
 * Anything carrying a scheme (`https:`, `mailto:`, `tel:`) or a protocol-
 * relative `//host` prefix is EXTERNAL to the router, whoever owns the host.
 */
const ABSOLUTE_HREF = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

export function isExternalHref(href: string): boolean {
  return ABSOLUTE_HREF.test(href.trim());
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
  /**
   * 🚨 THE VERDICT IS A TRI-STATE (V-30 NEW-6). `answers` is a boolean, and a
   * boolean cannot say "I could not judge this" — so a `/user-settings/config/*`
   * leaf, whose id set is built at runtime and which this file therefore never
   * checked, came back `answers: true, problem: null`, byte-identical to a leaf
   * that WAS checked. The same round taught the unbounded-read sweep that
   * silence must not read as clean; this is the route guard learning it.
   *
   *   `"answers"`     — followed, and it lands on what it names.
   *   `"refuses"`     — it does not; `problem` says so in one sentence.
   *   `"unmeasured"`  — the route serves it, but nothing here judged the
   *                     literal it carries; `unmeasured` says why.
   */
  verdict: "answers" | "refuses" | "unmeasured";
  /** True only when a person following this href lands on the thing it names. */
  answers: boolean;
  /**
   * Present ONLY on `verdict: "unmeasured"`: why this href was not judged.
   * A census that wants rigor counts these; it must never count them as clean.
   */
  unmeasured?: string;
  /** `null` when it answers; otherwise ONE sentence naming the defect, with
   *  both hrefs in it, ready to print in a failing expectation. */
  problem: string | null;
  /** True when the href is an absolute/external address, which the route
   *  manifest never speaks for (V-29 NEW-9) — never a 404 verdict. */
  external?: boolean;
}

/**
 * The dynamic segments this href supplies REAL values for, as NAME → VALUE.
 * A bare list of names is accepted so an old caller still compiles, but it
 * declares nothing this guard can check — see THE DECLARATION IS NOT A FACT.
 */
export type DeclaredParams =
  | Readonly<Record<string, string>>
  | readonly string[];

export interface RouteAnswerOptions {
  /**
   * 🚨 THE DECLARATION IS NOT A FACT (V-29 NEW-6). This used to be a list of
   * NAMES, and a name simply switched the check off for that segment:
   * `routeAnswerFor("/marketing/sites/tracking", { params: ["siteId"] })`
   * answered `true` — the exact href the guard exists to refuse. A declaration
   * a caller writes about its own href is not evidence about that href.
   *
   * So a param is a NAME → VALUE map (`{ siteId: site.id }`), and the segment
   * the pattern filled must carry that exact value. A name declared with no
   * value is UNVERIFIED and fails by sentence rather than passing quietly.
   */
  params?: DeclaredParams;
}

/** `{ siteId: "abc" }` → the value; `["siteId"]` → `null` (declared, unproven). */
function declaredParamValues(
  params: DeclaredParams | undefined,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (!params) return out;
  if (Array.isArray(params)) {
    for (const name of params as readonly string[]) out.set(name, null);
    return out;
  }
  for (const [name, value] of Object.entries(
    params as Readonly<Record<string, string>>,
  )) {
    out.set(name, value);
  }
  return out;
}

/**
 * 🚨 AN AGREEMENT BETWEEN TWO THINGS ONE AUTHOR WROTE IS NOT EVIDENCE
 * (V-30 NEW-1). Requiring `literal === value` closed V-29 NEW-6's loophole for
 * a caller that declares a NAME, and left the same loophole open one spelling
 * further on: a census row that hardcodes the href AND the value —
 * `routeAnswerFor("/marketing/sites/tracking", { params: { siteId: "tracking" } })`
 * — satisfied it and answered `true`. The exact href this whole guard exists to
 * refuse, waved through again. What the equality actually proves is that the
 * caller can read its own string; it proves nothing about 'tracking' being a
 * real site.
 *
 * So a declared VALUE is evidence only when it could have come from a record:
 *
 *   1. it is not a word this app spells ITSELF — a static route segment
 *      anywhere in the manifest, or a member of the segment's own closed page
 *      vocabulary. Those are page names; a page name in an id segment is the
 *      door-to-nowhere, whoever declared it.
 *   2. where the segment is an ID (`[siteId]`, `[brandId]`, `[id]`), it looks
 *      like one: a uuid, or at least something the manifest could never be
 *      mistaken for a page name — it carries a digit. A bare lowercase word in
 *      an id segment is a page name that nobody looked up.
 *
 * The lawful caller is unaffected, because it never hardcodes either side:
 * `routeAnswerFor(hrefFor(site), { params: { siteId: site.id } })` passes a
 * value that came from a READ.
 */
const UUID_SHAPED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `siteId`, `brandId`, `id` — a segment whose value is somebody's record id. */
function isIdSegment(name: string): boolean {
  return name === "id" || /[a-z0-9]Id$/.test(name);
}

let STATIC_SEGMENT_WORDS: Set<string> | null = null;

/** Every literal segment any route in the manifest is built from, lowercased. */
function staticSegmentWords(): Set<string> {
  if (STATIC_SEGMENT_WORDS) return STATIC_SEGMENT_WORDS;
  const words = new Set<string>();
  for (const entry of MANIFEST.routes) {
    for (const segment of splitSegments(entry.pattern)) {
      if (!segment.startsWith("[")) words.add(segment.toLowerCase());
    }
  }
  STATIC_SEGMENT_WORDS = words;
  return words;
}

/**
 * `null` when the declared value is real evidence; otherwise the ONE sentence
 * naming why the caller's own say-so does not count.
 */
function declaredValueObjection(
  path: string,
  pattern: string,
  segment: FilledSegment,
  value: string,
): string | null {
  if (UUID_SHAPED.test(value)) return null;
  const subject = segment.name.replace(/Id$/, "");

  const vocabulary = closedVocabularyFor(pattern, segment.name);
  const spelledByTheApp =
    staticSegmentWords().has(value.toLowerCase()) ||
    Boolean(vocabulary?.has([value]));
  if (spelledByTheApp) {
    return `\`${path}\` declares \`${segment.name}\` = '${value}', but '${value}' is a word this app spells itself as a page name — a value hardcoded beside the href that already carries it is an agreement between two things one author wrote, never evidence that '${value}' is a real ${subject}. Pass the value a READ produced (\`params: { ${segment.name}: <record>.id }\`).`;
  }

  if (isIdSegment(segment.name) && !/\d/.test(value)) {
    return `\`${path}\` declares \`${segment.name}\` = '${value}', and its \`${segment.source}\` segment does carry '${value}' — but '${value}' has the shape of a page name, not of a ${subject} id, and a value the caller hardcoded beside its own href proves only that it can read its own string. Pass a real id (\`params: { ${segment.name}: <record>.id }\`) or drop \`params\` and let the href be judged.`;
  }

  return null;
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
  if (isExternalHref(href)) {
    return {
      entry: null,
      status: "unbuilt",
      external: true,
      verdict: "refuses",
      answers: false,
      problem: `\`${href}\` is an absolute address, not a path this app routes — an external address is never a route door; use an explicit external action.`,
    };
  }

  const path = normalizePath(href);
  const hit = resolve(path);

  if (!hit) {
    return {
      entry: null,
      status: "unbuilt",
      verdict: "refuses",
      answers: false,
      problem: `\`${path}\` is served by no route in the manifest — it is a 404.`,
    };
  }

  if (hit.entry.status === "placeholder") {
    const promise = hit.entry.promiseKey ? ` (\`${hit.entry.promiseKey}\`)` : "";
    return {
      entry: hit.entry,
      status: "placeholder",
      verdict: "refuses",
      answers: false,
      problem: `\`${path}\` is served by \`${hit.entry.pattern}\`, a registered coming-soon placeholder${promise} — a 200 that is still a dead end.`,
    };
  }

  const declared = declaredParamValues(options.params);
  // 🚨 V-30 NEW-6: a segment the vocabulary serves but cannot ENUMERATE is not
  // a pass — it is an honest "nobody checked this", collected here and said out
  // loud in the verdict rather than folded into a silent `true`.
  const unmeasuredReasons: string[] = [];
  for (const segment of hit.filled) {
    if (segment.consumed.length === 0) continue; // optional catch-all, took nothing
    const literal = segment.consumed.join("/");

    if (declared.has(segment.name)) {
      const value = declared.get(segment.name) ?? null;
      if (value === null) {
        // Declared by NAME only: nobody checked that this segment holds an id
        // rather than a literal word, so the declaration proves nothing.
        return {
          entry: hit.entry,
          status: hit.entry.status,
          verdict: "refuses",
          answers: false,
          problem: `\`${path}\` declares the parameter \`${segment.name}\` but supplies no value for it, so nothing checked that '${literal}' is a real ${segment.name.replace(/Id$/, "")} and not a literal word — pass \`params: { ${segment.name}: <the value in the href> }\`.`,
        };
      }
      if (literal === value) {
        // The href really does carry that value — now: is the VALUE evidence?
        const objection = declaredValueObjection(
          path,
          hit.entry.pattern,
          segment,
          value,
        );
        if (!objection) continue;
        return {
          entry: hit.entry,
          status: hit.entry.status,
          verdict: "refuses",
          answers: false,
          problem: objection,
        };
      }
      return {
        entry: hit.entry,
        status: hit.entry.status,
        verdict: "refuses",
        answers: false,
        problem: `\`${path}\` declares \`${segment.name}\` = '${value}', but its \`${segment.source}\` segment carries '${literal}' — the href does not name what the caller says it does.`,
      };
    }

    // A segment the ROUTE declares as a closed vocabulary of page names answers
    // when the literal is a member, and is as dead as any other swallowed word
    // when it is not (`./vocabulary.ts`).
    const vocabulary = closedVocabularyFor(hit.entry.pattern, segment.name);
    if (vocabulary?.has(segment.consumed)) {
      const why = vocabulary.unmeasuredReason?.(segment.consumed) ?? null;
      if (why) unmeasuredReasons.push(why);
      continue;
    }
    return {
      entry: hit.entry,
      status: hit.entry.status,
      verdict: "refuses",
      answers: false,
      problem: `\`${path}\` is served by \`${hit.entry.pattern}\` — it would open the ${segment.name.replace(/Id$/, "")} named '${literal}'.`,
    };
  }

  if (unmeasuredReasons.length > 0) {
    return {
      entry: hit.entry,
      status: hit.entry.status,
      verdict: "unmeasured",
      answers: true,
      problem: null,
      unmeasured: Array.from(new Set(unmeasuredReasons)).join("; "),
    };
  }

  return {
    entry: hit.entry,
    status: hit.entry.status,
    verdict: "answers",
    answers: true,
    problem: null,
  };
}
