/**
 * Pure validation for the `matrx-user/keyword-research` write targets.
 *
 * Deliberately NOT a React module, and it exists for two reasons.
 *
 * ONE — the throw has to land synchronously. The writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`) converts a throw into the
 * safe error envelope the agent reads, so validation must run on the handler
 * call itself, never inside a `setState` updater React may defer or replay.
 *
 * TWO — the bounds have to be advertised from the SAME constant they are
 * enforced from. `MAX_STAGED_KEYWORD_LENGTH` used to live inside
 * `KeywordResearchLauncher` while the manifest's `research_input_keyword`
 * description said "at most 200 characters" as a hardcoded literal, so
 * changing the bound would have silently made the model-facing contract a lie.
 * The manifest now interpolates this constant. Same shape as
 * `features/scraper/scrape-command.ts` does for the scraper surface.
 */

/** A primary keyword is a search phrase, not a paragraph. */
export const MAX_STAGED_KEYWORD_LENGTH = 200;

/**
 * The inline-tool layer JSON-parses an argument that LOOKS like JSON before a
 * handler ever sees it, so a string-typed target can arrive as an object or an
 * array. Naming the failure precisely — "plain text, not JSON and not
 * JSON-encoded" — is what stops the agent from "fixing" it by double-encoding,
 * which lands escaped \n and stray quotes in the user's input box.
 */
function requirePlainString(value: unknown, target: string): string {
  if (typeof value === "string") return value;
  const arrived =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "an array"
        : typeof value === "object"
          ? "an object"
          : typeof value;
  throw new Error(
    `${target} expects a plain text string — it arrived as ${arrived}. ` +
      `Send the phrase as plain text, not JSON and not JSON-encoded: ` +
      `send  botox cost  — never  "botox cost"  or  {"phrase":"botox cost"}.`,
  );
}

/**
 * Validate `research_input_keyword` — the phrase staged into the launcher
 * input that the USER then presses Research on. Returns the trimmed phrase.
 */
export function parseStagedKeywordWrite(value: unknown): string {
  const phrase = requirePlainString(value, "research_input_keyword").trim();
  if (!phrase) {
    throw new Error(
      "research_input_keyword needs a keyword phrase — an empty string would leave the Research button disabled.",
    );
  }
  // A newline means a LIST arrived. The pipeline takes exactly one primary
  // keyword and clusters outward from it, so keeping the first line silently
  // would research something the agent did not choose.
  if (/[\r\n]/.test(phrase)) {
    throw new Error(
      "research_input_keyword takes ONE keyword phrase, not a list — the launcher researches a single primary keyword per run, and discovers the cluster around it.",
    );
  }
  if (phrase.length > MAX_STAGED_KEYWORD_LENGTH) {
    throw new Error(
      `research_input_keyword: "${phrase.slice(0, 40)}…" is ${phrase.length} characters — a primary keyword must be at most ${MAX_STAGED_KEYWORD_LENGTH}.`,
    );
  }
  return phrase;
}

/**
 * Validate `library_search` — the explorer's substring filter. An empty string
 * is LEGAL and clears the filter, which is how an agent widens its own
 * evidence window back to the whole library.
 */
export function parseLibrarySearchWrite(value: unknown): string {
  const filter = requirePlainString(value, "library_search");
  if (/[\r\n]/.test(filter)) {
    throw new Error(
      "library_search is a single-line filter box — it is one substring match, not a list of phrases.",
    );
  }
  return filter;
}

/**
 * THE LINE this surface draws.
 *
 * A research run is a PAID server pipeline and the request captures its inputs
 * at the moment it is sent, so a write while a run is in flight would leave the
 * page describing something nobody researched. Refused, not applied — the same
 * reason `image-generate` refuses `generation_request` mid-generation and
 * `scraper` refuses `scrape_command` while `is_scraping`.
 *
 * Callers MUST pass a status read through a ref, not off a render closure: the
 * writeback seam resolves every handler BEFORE the user confirms the first ask
 * dialog, so a closure read can be a stale snapshot — precisely the case this
 * guard exists to catch.
 */
export function assertNoRunInFlight(runStatus: string, target: string): void {
  if (runStatus === "running") {
    throw new Error(
      `${target}: a keyword research run is in flight, so the input is locked — exactly as it is for the user. The running request already captured the old keyword; wait for run_status to leave "running", then stage the next phrase.`,
    );
  }
}
