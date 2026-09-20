// lib/route-manifest/vocabulary.ts
//
// ROUTES WHOSE DYNAMIC SEGMENT IS A PAGE NAME, NOT SOMEBODY'S ID.
//
// 🚨 WHY THIS EXISTS (V-28 NEW-4). `routeAnswerFor` refuses a static href that a
// dynamic segment swallowed, because `/marketing/sites/tracking` resolves to
// `/marketing/sites/[siteId]` and then opens the site named "tracking" — a door
// to nowhere with a `live` status. The very first run of that rule also refused
// `/user-settings/integrations`, a door that WORKS: settings is one optional
// catch-all over a CLOSED, code-declared vocabulary of section names
// (`features/settings/registry.ts`), and `integrations` is one of them. A guard
// that fails a working door is the same defect in the other direction.
//
// So a route may declare that its dynamic segment is chosen from a closed set,
// and then a literal IN that set answers while a literal outside it still does
// not (`/user-settings/not-a-section` is as dead as `/marketing/sites/tracking`).
//
// 🚨 THIS LIST IS NOT PERMISSION AND NEVER GROWS BY ASSUMPTION. An entry is a
// claim about a page, provable by reading it, and every member is checked
// against the vocabulary's own source by
// `__tests__/a-declared-href-lands-on-what-it-names.test.ts` — add a settings
// section and the test fails until this file knows it. A route whose segment is
// a record id never belongs here, whatever it would make green.

export interface ClosedVocabularySegment {
  /** The manifest pattern this speaks for. */
  pattern: string;
  /** The declared segment name inside that pattern (`path` for `[[...path]]`). */
  param: string;
  /** The module that owns the vocabulary — a disagreement is one `cat` away. */
  source: string;
  /** What the page does with the literal, in one sentence. */
  why: string;
  /** Is this concrete run of segments a member of the vocabulary? */
  has(segments: readonly string[]): boolean;
}

/** `text-generation` → `textGeneration`; the settings URL↔id translation. */
function kebabToCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/**
 * The top-level settings sections, in the registry's own spelling. Nested tabs
 * live under one of these (`ai.textGeneration` under `ai`), so the first
 * segment is what decides whether a settings href names a real section.
 */
export const SETTINGS_SECTION_IDS: readonly string[] = [
  "account",
  "admin",
  "ai",
  "appearance",
  "communication",
  "devices",
  "editor",
  "extension",
  "feedback",
  "files",
  "general",
  "integrations",
  "learning",
  "organizations",
  "plan",
  "sandboxStorage",
  "voice",
];

export const CLOSED_VOCABULARY_SEGMENTS: readonly ClosedVocabularySegment[] = [
  {
    pattern: "/user-settings/[[...path]]",
    param: "path",
    source: "features/settings/registry.ts",
    why: "app/(core)/user-settings/[[...path]]/page.tsx translates the segments into a registry TAB ID (`urlToTabId`) and renders that section — the segments are page names, never a record id.",
    has(segments) {
      if (segments.length === 0) return true; // the settings home
      return SETTINGS_SECTION_IDS.includes(kebabToCamel(segments[0]));
    },
  },
];

export function closedVocabularyFor(
  pattern: string,
  param: string,
): ClosedVocabularySegment | undefined {
  return CLOSED_VOCABULARY_SEGMENTS.find(
    (entry) => entry.pattern === pattern && entry.param === param,
  );
}
