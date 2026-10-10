// features/unified-data/home/dataHomeKindWords.ts — LANE ALL-MY-DATA
//
// WHAT EACH THING IS, IN PLAIN WORDS (Arman, 2026-10-10: "tells me what's a list, a table, something
// else"). The store's kind words are internal (`list`, `scope`, `kit`, `pagecleanup` …); the data
// home says only the words of the canonical vocabulary (common-docs/systems/platform/vocabulary):
// Table, Pick list, Form, Dashboard, Page, Portal, Booking, Automation, Typed table, Platform table,
// and "Custom fields on <standard table>". Nothing here coins a word.
//
// THREE FATES for a kind the store can say:
//   - PLAIN: it has a word and is listed.
//   - PLATFORM: a table the app keeps for itself (scopes, kits, workflow tables, demos, an agent's
//     outputs …). The vocabulary's word for these is "Platform table"; they are listed only under
//     "Show platform tables", as the data home's switch has always done.
//   - LEFT OUT: not a thing a person owns as data (a checklist's template row, a digest, an outside
//     share). They keep their own homes; this view does not list them.
// A kind the store adds later and nobody classified is a PLATFORM table (kept tables are the only
// place the store invents kind words — `kept_for`), and the test in __tests__/dataHomeKindWords
// fails until it is written down here.

/** Kinds with a plain word of their own. */
export const PLAIN_KIND_WORD: Readonly<Record<string, string>> = {
  table: "Table",
  list: "Pick list",
  form: "Form",
  dashboard: "Dashboard",
  page: "Page",
  portal: "Portal",
  booking: "Booking",
  automation: "Automation",
  typed_table: "Typed table",
  custom_fields: "Custom fields",
};

/** Kept tables: one word, shown only when the person turns on "Show platform tables". */
export const PLATFORM_KINDS: readonly string[] = [
  "scope",
  "kit",
  "store",
  "demo",
  "app",
  "workflow",
  "view",
  "comment",
  "action",
  "agent_output",
  "pagecleanup",
];

/** Listed nowhere in this view. */
export const LEFT_OUT_KINDS: readonly string[] = ["checklist", "digest", "share"];

export const PLATFORM_TABLE_WORD = "Platform table";

/** The row's word. Never an internal kind word, never null for a listed row. */
export function plainKindWord(kind: string): string {
  const word = PLAIN_KIND_WORD[kind];
  if (word) return word;
  return LEFT_OUT_KINDS.includes(kind) ? "Other" : PLATFORM_TABLE_WORD;
}

/** Is this kind listed in the view, given the "Show platform tables" switch? */
export function kindIsListed(kind: string, showPlatformTables: boolean): boolean {
  if (kind in PLAIN_KIND_WORD) return true;
  if (LEFT_OUT_KINDS.includes(kind)) return false;
  return showPlatformTables;
}

/** Every kind word the app's own declarations can say today; the test proves each is classified. */
export function isClassified(kind: string): boolean {
  return kind in PLAIN_KIND_WORD || PLATFORM_KINDS.includes(kind) || LEFT_OUT_KINDS.includes(kind);
}

/** Words that must never reach the screen as a kind (retired or internal). */
export const FORBIDDEN_KIND_WORDS: readonly string[] = [
  "Scope",
  "Kit",
  "Digest",
  "Pagecleanup",
  "Demonstration",
  "Agent output",
  "Agent Output",
  "Store",
  "Platform tables",
  "Saved view",
  "Comments",
  "Actions",
  "List",
  "Workflow",
  "Outside share",
  "Checklist",
];
