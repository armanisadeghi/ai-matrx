/**
 * The write half of `matrx-user/scraper` — ONE implementation of the
 * manifest's `writeTargets`, shared by every mount that owns scraper state.
 *
 * This logic was written inline in `ScraperFloatingWorkspace` when the surface
 * first became agent-writable (2026-08-12), back when that panel was the only
 * mount with a `SurfaceRuntimeProvider`. The `/scraper/*` routes have now
 * adopted the surface too, and they own the SAME inputs — so the validation
 * moved here rather than being re-typed beside a second set of setters. A
 * manifest promising one contract while two handlers check it differently is
 * exactly the drift `scrape-command.ts` exists to prevent.
 *
 * PER-MOUNT POSTURE: a mount passes only the setters it really has, and this
 * factory returns a handler ONLY for the targets those setters cover. A target
 * with no handler on the current mount is not offered to the agent at all
 * (`listAgentWritableTargets` filters on `hasHandler`), which is how one
 * manifest serves the four-mode floating workspace and the single-mode route
 * pages without either lying. The `/scraper` routes cannot switch mode — there
 * the mode IS the route — so they pass no `setMode` and this file refuses a
 * mode CHANGE while treating a write of the mode the view is already in as the
 * no-op success it is.
 *
 * An agent may STAGE the next scrape command; it may never run one — that
 * spends real time on someone else's server and stays the user's click.
 * Every check validates against the SAME `scrape-command` constants the
 * manifest's contract prose is interpolated from, and THROWS on a bad shape
 * (the writeback seam turns a throw into a safe error envelope the agent
 * reads). Nothing mutates until the whole payload has passed.
 */

import {
  isScrapeMode,
  isValidPageLimit,
  isValidResultLimit,
  PAGE_LIMIT_MAX,
  PAGE_LIMIT_MIN,
  RESULT_LIMIT_MAX,
  RESULT_LIMIT_MIN,
  SCRAPE_MODE_BY_VALUE,
  SCRAPE_MODE_BY_WORKSPACE_MODE,
  SCRAPE_MODE_ENUM_TEXT,
  toScrapeMode,
  type WorkspaceMode,
} from "@/features/scraper/scrape-command";
// THE URL rule the workspace's own Scrape button uses — an agent must not be
// able to stage a URL the user's own click would have rejected.
import { normalizeUrl } from "@/features/scraper/utils/scraper-floating-helpers";

/**
 * What one mount owns. Absent setters mean "this view does not have that
 * input", and the matching target is either not offered or refused by name.
 */
export interface ScraperWriteMount {
  /** The mode this mount is currently in. */
  mode: WorkspaceMode;
  /** True while a scrape/search is in flight — every target refuses then. */
  isScraping: boolean;
  /**
   * Switch modes. Only the floating workspace has this; on the `/scraper`
   * routes the mode is the route, so they omit it and get the no-op /
   * refusal behaviour described above.
   */
  setMode?: (mode: WorkspaceMode) => void;
  setUrl?: (url: string) => void;
  /** Stage the keyword for the mode this mount runs in. */
  setKeyword?: (keyword: string, mode: WorkspaceMode) => void;
  setMaxPages?: (value: number) => void;
  setMaxResults?: (value: number) => void;
  /** Open an already-scraped page (index into `results_overview`). */
  selectResultPage?: (index: number) => void;
  /** Number of scraped pages this session holds. */
  resultCount?: number;
  /** Open a web-search hit (index into `search_hits`). */
  selectSearchHit?: (index: number) => void;
  /** Number of web-search hits loaded. */
  hitCount?: number;
  /**
   * Appended to a refusal that is about WHERE the user is rather than what
   * the agent sent — e.g. naming the route that owns the missing input.
   */
  notHereHint?: string;
}

type Handler = (value: unknown) => void;

function inFlight(target: string): never {
  throw new Error(
    `${target} is unavailable while a scrape or search is in flight (is_scraping is true). Wait for the run to finish.`,
  );
}

export function buildScraperWriteHandlers(
  mount: ScraperWriteMount,
): Record<string, Handler> {
  const { mode, isScraping, notHereHint } = mount;
  const hint = notHereHint ? ` ${notHereHint}` : "";
  const handlers: Record<string, Handler> = {};

  // ── scrape_command — mode + url + keyword, staged as one command ────────
  if (mount.setUrl || mount.setKeyword || mount.setMode) {
    handlers.scrape_command = (value: unknown) => {
      // A run in flight DISABLES these inputs for the user; staging into them
      // would land a value the user cannot see or correct, against a request
      // whose parameters are already captured. Refuse loudly instead.
      if (isScraping) inFlight("scrape_command");
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          "scrape_command expects an object: { mode?, url?, keyword? }.",
        );
      const patch = value as Record<string, unknown>;
      const accepted = ["mode", "url", "keyword"];
      const unsupported = Object.keys(patch).filter(
        (key) => !accepted.includes(key),
      );
      if (unsupported.length > 0)
        throw new Error(
          `scrape_command got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${accepted.join(" | ")}.`,
        );
      if (!accepted.some((key) => key in patch))
        throw new Error(
          `scrape_command needs at least one of: ${accepted.join(" | ")}.`,
        );

      // Resolve the mode this command runs in FIRST: it decides which config
      // input the workspace renders, so a field belonging to another mode is
      // refused rather than staged where the user cannot see it.
      const nextMode = "mode" in patch ? patch.mode : toScrapeMode(mode);
      if (!isScrapeMode(nextMode))
        throw new Error(
          `scrape_command.mode expects one of: ${SCRAPE_MODE_ENUM_TEXT}.`,
        );
      const spec = SCRAPE_MODE_BY_VALUE[nextMode];

      // A mount without `setMode` can still be SENT its own mode — an agent
      // naturally states the mode alongside the field it enables, and
      // refusing "be the thing you already are" would turn every well-formed
      // command into an error. Only a real mode CHANGE is refused.
      const modeChanges = spec.workspaceMode !== mode;
      if (modeChanges && !mount.setMode)
        throw new Error(
          `scrape_command cannot change the mode on this view — the mode here is fixed to "${toScrapeMode(mode)}".${hint}`,
        );

      let nextUrl: string | undefined;
      if ("url" in patch) {
        if (typeof patch.url !== "string" || !patch.url.trim())
          throw new Error("scrape_command.url expects a non-empty string.");
        if (spec.input !== "url")
          throw new Error(
            `scrape_command.url does not apply in "${spec.value}" mode (${spec.summary}). Send { mode, url } together to switch mode and stage the URL in one call.`,
          );
        if (!mount.setUrl)
          throw new Error(
            `scrape_command.url cannot be staged on this view — it has no single-URL input.${hint}`,
          );
        const normalized = normalizeUrl(patch.url);
        if (!normalized)
          throw new Error(
            `scrape_command.url is not a usable URL: "${patch.url}".`,
          );
        nextUrl = normalized;
      }

      let nextKeyword: string | undefined;
      if ("keyword" in patch) {
        if (typeof patch.keyword !== "string" || !patch.keyword.trim())
          throw new Error("scrape_command.keyword expects a non-empty string.");
        if (spec.input !== "keyword")
          throw new Error(
            `scrape_command.keyword does not apply in "${spec.value}" mode (${spec.summary}). Send { mode, keyword } together to switch mode and stage the keyword in one call.`,
          );
        if (!mount.setKeyword)
          throw new Error(
            `scrape_command.keyword cannot be staged on this view — it has no keyword input.${hint}`,
          );
        nextKeyword = patch.keyword.trim();
      }

      // Everything is validated before ANY state moves — a rejected key must
      // never leave a half-applied command staged in the form.
      if (modeChanges) mount.setMode!(spec.workspaceMode);
      if (nextUrl !== undefined) mount.setUrl!(nextUrl);
      // Which store holds the keyword depends on the mode — deep mode keeps
      // its own, web search uses the keyword form's. Resolved from the mode
      // THIS call staged, which is the whole reason mode and keyword share
      // one target instead of racing as two.
      if (nextKeyword !== undefined)
        mount.setKeyword!(nextKeyword, spec.workspaceMode);
    };
  }

  // ── The two budgets ─────────────────────────────────────────────────────
  if (mount.setMaxPages) {
    handlers.scrape_page_limit = (value: unknown) => {
      if (isScraping) inFlight("scrape_page_limit");
      if (!isValidPageLimit(value))
        throw new Error(
          `scrape_page_limit expects an integer from ${PAGE_LIMIT_MIN} to ${PAGE_LIMIT_MAX}.`,
        );
      mount.setMaxPages!(value);
    };
  }

  if (mount.setMaxResults) {
    handlers.scrape_result_limit = (value: unknown) => {
      if (isScraping) inFlight("scrape_result_limit");
      if (!isValidResultLimit(value))
        throw new Error(
          `scrape_result_limit expects an integer from ${RESULT_LIMIT_MIN} to ${RESULT_LIMIT_MAX}.`,
        );
      mount.setMaxResults!(value);
    };
  }

  // ── Selection targets (mode: "ui") ──────────────────────────────────────
  // Neither fetches anything: they move the user's view onto something this
  // session ALREADY has. Each one refuses in the modes that do not render
  // its list, because a selection the user cannot see is not a selection.
  if (mount.selectResultPage) {
    handlers.selected_result_page = (value: unknown) => {
      const spec = SCRAPE_MODE_BY_WORKSPACE_MODE[mode];
      if (mode === "web")
        throw new Error(
          `selected_result_page does not apply in "${spec.value}" mode (${spec.summary}) — the scraped-pages sidebar and results pane are not rendered. Switch with scrape_command { mode: "quick" } or { mode: "full" } first.`,
        );
      if (typeof value !== "number" || !Number.isInteger(value))
        throw new Error(
          `selected_result_page expects a zero-based integer index into results_overview, got ${typeof value}.`,
        );
      const count = mount.resultCount ?? 0;
      if (count === 0)
        throw new Error(
          "selected_result_page: no pages have been scraped in this session yet (result_count is 0).",
        );
      if (value < 0 || value >= count)
        throw new Error(
          `selected_result_page: index ${value} is out of range — this session has ${count} scraped page(s), so valid indexes are 0-${count - 1}.`,
        );
      mount.selectResultPage!(value);
    };
  }

  if (mount.selectSearchHit) {
    handlers.selected_search_hit = (value: unknown) => {
      const spec = SCRAPE_MODE_BY_WORKSPACE_MODE[mode];
      if (mode !== "web")
        throw new Error(
          `selected_search_hit does not apply in "${spec.value}" mode (${spec.summary}) — the web-search hit list is only rendered in search mode. Switch with scrape_command { mode: "search" } first.`,
        );
      if (typeof value !== "number" || !Number.isInteger(value))
        throw new Error(
          `selected_search_hit expects a zero-based integer index into search_hits, got ${typeof value}.`,
        );
      const hits = mount.hitCount ?? 0;
      if (hits === 0)
        throw new Error(
          "selected_search_hit: no web-search hits are loaded (search_hit_count is 0). The user has to run a search first.",
        );
      if (value < 0 || value >= hits)
        throw new Error(
          `selected_search_hit: index ${value} is out of range — there ${hits === 1 ? "is" : "are"} ${hits} hit(s), so valid indexes are 0-${hits - 1}.`,
        );
      mount.selectSearchHit!(value);
    };
  }

  return handlers;
}
