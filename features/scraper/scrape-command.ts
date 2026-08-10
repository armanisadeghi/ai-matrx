/**
 * features/scraper/scrape-command.ts
 *
 * The scraper's COMMAND vocabulary — the one place that knows what a scrape
 * command can say. Deliberately dependency-free (no React, no Redux, no
 * imports at all) so all three consumers can share it without a cycle:
 *
 *  - `ScraperFloatingWorkspace` renders its mode switcher and bounds its
 *    page-count input from these constants,
 *  - `buildScraperContextData` maps the live workspace mode onto the
 *    manifest's `scrape_mode` READ value through the same table,
 *  - `scraper.manifest.ts` interpolates the vocabulary into its
 *    `writeTargets` contract prose, and the workspace's write handlers
 *    validate against it.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all this list. Never re-type these literals at a call site.
 *
 * Two vocabularies, one table:
 *  - `ScrapeMode` (`quick | full | search`) is the PUBLIC name — what the
 *    `scrape_mode` surface value reports and what the `scrape_command` write
 *    target accepts. Agents only ever see this one.
 *  - `WorkspaceMode` (`url | batch | web`) is the workspace component's
 *    INTERNAL panel key. It stays internal; `toWorkspaceMode` is the only
 *    bridge.
 */

/**
 * Every mode the scraper workspace can be in, and what each one needs.
 *
 * `input` is which config field is live in that mode — the workspace only
 * renders one of them at a time, so staging the other one would put a value
 * somewhere the user cannot see. The write handler uses this to refuse an
 * incoherent command (a URL in a keyword mode) instead of staging it blind.
 */
export const SCRAPE_MODES = [
  {
    /** Public value — the `scrape_mode` surface value + write contract. */
    value: "quick",
    /** The workspace component's internal panel key. */
    workspaceMode: "url",
    /** The sidebar button label. */
    label: "URL",
    /** Which config field this mode reads. */
    input: "url",
    /** Whether this mode is bounded by the page limit. */
    usesPageLimit: false,
    /** Whether this mode is bounded by the web-search result limit. */
    usesResultLimit: false,
    /** Model-facing gloss, interpolated into the write-target contract. */
    summary: "scrape one URL directly",
  },
  {
    value: "full",
    workspaceMode: "batch",
    label: "Deep",
    input: "keyword",
    usesPageLimit: true,
    usesResultLimit: false,
    summary: "search a keyword, then scrape the top pages",
  },
  {
    value: "search",
    workspaceMode: "web",
    label: "Web",
    input: "keyword",
    usesPageLimit: false,
    usesResultLimit: true,
    summary: "search a keyword on the web, scraping nothing until a hit is opened",
  },
] as const;

/** The public mode vocabulary — what `scrape_mode` reports, what writes accept. */
export type ScrapeMode = (typeof SCRAPE_MODES)[number]["value"];

/** The workspace component's internal panel key. Never shown to an agent. */
export type WorkspaceMode = (typeof SCRAPE_MODES)[number]["workspaceMode"];

/** One entry of {@link SCRAPE_MODES}. */
export type ScrapeModeSpec = (typeof SCRAPE_MODES)[number];

/** The public mode values, in UI order — for enum prose and validation. */
export const SCRAPE_MODE_VALUES: readonly ScrapeMode[] = SCRAPE_MODES.map(
  (m) => m.value,
);

/** `"quick | full | search"` — interpolate this, never re-type it. */
export const SCRAPE_MODE_ENUM_TEXT = SCRAPE_MODE_VALUES.join(" | ");

/** Lookup by public value. */
export const SCRAPE_MODE_BY_VALUE: Record<ScrapeMode, ScrapeModeSpec> =
  Object.fromEntries(SCRAPE_MODES.map((m) => [m.value, m])) as Record<
    ScrapeMode,
    ScrapeModeSpec
  >;

/** Lookup by the workspace's internal panel key. */
export const SCRAPE_MODE_BY_WORKSPACE_MODE: Record<
  WorkspaceMode,
  ScrapeModeSpec
> = Object.fromEntries(
  SCRAPE_MODES.map((m) => [m.workspaceMode, m]),
) as Record<WorkspaceMode, ScrapeModeSpec>;

/** Runtime guard — the check the write handler runs on agent input. */
export function isScrapeMode(value: unknown): value is ScrapeMode {
  return (
    typeof value === "string" &&
    (SCRAPE_MODE_VALUES as readonly string[]).includes(value)
  );
}

/** Public mode → the workspace panel it selects. */
export function toWorkspaceMode(mode: ScrapeMode): WorkspaceMode {
  return SCRAPE_MODE_BY_VALUE[mode].workspaceMode;
}

/** Workspace panel → the public mode the surface reports for it. */
export function toScrapeMode(mode: WorkspaceMode): ScrapeMode {
  return SCRAPE_MODE_BY_WORKSPACE_MODE[mode].value;
}

/**
 * Bounds of the deep-mode page limit — the `min`/`max` the workspace's number
 * input enforces on the user, and therefore the exact bounds the write
 * handler enforces on an agent. One source, so a bound can never be raised in
 * the UI and left stale in the agent contract.
 */
export const PAGE_LIMIT_MIN = 1;
export const PAGE_LIMIT_MAX = 20;
/** What deep mode starts at, and the fallback for an unparseable input. */
export const PAGE_LIMIT_DEFAULT = 5;

/**
 * Bounds of the WEB-SEARCH result limit — the "Max" number input beside the
 * keyword field in search mode (`ScraperKeywordSearchCompactControls`, and the
 * full-page `ScraperKeywordSearchPageBody`). A different budget from
 * {@link PAGE_LIMIT_MAX} and deliberately wider: these hits come back
 * UNSCRAPED, so asking for 50 costs one search request — where 50 pages means
 * 50 fetches against other people's servers.
 */
export const RESULT_LIMIT_MIN = 1;
export const RESULT_LIMIT_MAX = 100;
/** What search mode starts at, and the fallback for an unparseable input. */
export const RESULT_LIMIT_DEFAULT = 10;

/** Runtime guard for the result limit — integer, in bounds. */
export function isValidResultLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RESULT_LIMIT_MIN &&
    value <= RESULT_LIMIT_MAX
  );
}

/** Runtime guard for the page limit — integer, in bounds. */
export function isValidPageLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PAGE_LIMIT_MIN &&
    value <= PAGE_LIMIT_MAX
  );
}
