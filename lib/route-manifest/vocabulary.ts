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
  /**
   * 🚨 UNMEASURED IS NOT AN ANSWER (V-30 NEW-6). A vocabulary may be closed
   * over MOST of its ids and open over one family it genuinely cannot
   * enumerate. `has` says yes for such a run — the page is real — but saying
   * only "yes" makes an id nobody checked indistinguishable from one that was.
   * This returns the reason the run was NOT judged, or `null` when it was.
   */
  unmeasuredReason?(segments: readonly string[]): string | null;
}

/** `text-generation` → `textGeneration`; the settings URL↔id translation. */
function kebabToCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/**
 * 🚨 EVERY CONSUMED SEGMENT IS JUDGED, NOT JUST THE FIRST (V-29 NEW-7). The
 * first version of this vocabulary asked only whether segment ONE named a real
 * section, so `/user-settings/integrations/not-a-real-tab` answered `true` — a
 * href naming a section that exists and a tab that does not, walking through
 * the guard whose whole question is "does following this land on the thing it
 * names". The settings URL is a WHOLE tab id
 * (`features/settings/route-shell/routing.ts`: segments → kebab-to-camel →
 * dot-joined), and a tab id the registry does not carry renders no tab at all
 * (`useSettingsTree.resolveTab` → `findTab` → `null`). So the vocabulary is the
 * registry's FULL id set, sub-tabs included.
 *
 * The registry's own spelling, `features/settings/registry.ts`. Every id is
 * diffed against the registry's REAL export by
 * `__tests__/a-declared-href-lands-on-what-it-names.test.ts` — which imports
 * `settingsRegistry` rather than grepping its source, because a regex over one
 * file measures one spelling in one file (V-29 NEW-7's second half).
 */
export const SETTINGS_TAB_IDS: readonly string[] = [
  "account",
  "account.addresses",
  "account.contact",
  "account.emergency",
  "account.identity",
  "account.work",
  "admin",
  "admin.server",
  "ai",
  "ai.assistants",
  "ai.imageGeneration",
  "ai.memory",
  "ai.models",
  "ai.photoEditing",
  "ai.textGeneration",
  "appearance",
  "appearance.accent",
  "appearance.density",
  "appearance.layout",
  "appearance.siteWorkbench",
  "appearance.theme",
  "appearance.windows",
  "communication.email",
  "communication.messaging",
  "communication.video",
  "devices",
  "editor",
  "editor.codeWorkspace",
  "editor.coding",
  "editor.keybindings",
  "extension",
  "feedback",
  "files.devices",
  "general",
  "general.conversationFilters",
  "general.language",
  "general.lists",
  "general.notifications",
  "general.personalConfig",
  "general.privacy",
  "general.system",
  "integrations",
  "integrations.googleWorkspace",
  "integrations.microsoft",
  "learning.flashcards",
  "organizations",
  "organizations.mediaCatalog",
  "plan",
  "sandboxStorage",
  "voice",
  "voice.diagnostics",
  "voice.dictionary",
  "voice.input",
  "voice.voices",
];

/**
 * The one id family this file cannot enumerate: the taxonomy-driven
 * configuration sections (`features/settings/universal/configTree.ts`) are
 * built at runtime from the org's registry domains, under the root `config`.
 * They are real pages, so a `config`-rooted href answers — and, since V-30
 * NEW-6, it answers as **unmeasured**: `unmeasuredReason` hands the caller the
 * sentence, so a census can COUNT what nobody checked instead of reading a
 * silent `true` as a checked leaf. A comment is not a verdict.
 */
const CONFIG_TAB_ROOT_ID = "config";

/** The one sentence a caller gets when a `config.*` leaf was never judged. */
export const CONFIG_LEAVES_UNMEASURED =
  "runtime config sections are not enumerable statically";

/** Segments → the registry tab id the route would resolve them to. */
export function settingsTabIdFor(segments: readonly string[]): string {
  return segments.filter(Boolean).map(kebabToCamel).join(".");
}

function isConfigTabId(tabId: string): boolean {
  return (
    tabId === CONFIG_TAB_ROOT_ID || tabId.startsWith(`${CONFIG_TAB_ROOT_ID}.`)
  );
}

export const CLOSED_VOCABULARY_SEGMENTS: readonly ClosedVocabularySegment[] = [
  {
    pattern: "/user-settings/[[...path]]",
    param: "path",
    source: "features/settings/registry.ts",
    why: "app/(core)/user-settings/[[...path]]/page.tsx translates ALL the segments into one registry TAB ID (`urlToTabId`) and renders that tab — the segments are page names, never a record id, and a tab id the registry does not carry renders nothing.",
    has(segments) {
      if (segments.length === 0) return true; // the settings home
      const tabId = settingsTabIdFor(segments);
      if (SETTINGS_TAB_IDS.includes(tabId)) return true;
      return isConfigTabId(tabId);
    },
    unmeasuredReason(segments) {
      if (segments.length === 0) return null;
      const tabId = settingsTabIdFor(segments);
      if (SETTINGS_TAB_IDS.includes(tabId)) return null;
      // `config` itself is a real, enumerated root; only its LEAVES are built
      // at runtime, so only a leaf is unmeasured.
      if (tabId === CONFIG_TAB_ROOT_ID) return null;
      return isConfigTabId(tabId) ? CONFIG_LEAVES_UNMEASURED : null;
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
