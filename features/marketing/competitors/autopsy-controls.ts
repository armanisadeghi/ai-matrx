/**
 * features/marketing/competitors/autopsy-controls.ts
 *
 * The Competitor Opportunity Autopsy's CONTROL vocabulary and its pure
 * validators — the one place that knows what the run form's knobs can say,
 * what a competitor's tracking status can be, and what an opportunity's human
 * status can be.
 *
 * Deliberately runtime dependency-free (React, Supabase and the surface types
 * are all absent) so every consumer can share it without a cycle:
 *
 *  - `CompetitorAutopsyWorkspace` renders its two bound selects from
 *    {@link AUTOPSY_RUN_BOUND_CHOICES} and calls these validators from its
 *    surface write handlers,
 *  - `marketing-competitors.manifest.ts` INTERPOLATES the vocabulary into its
 *    `writeTargets` contract prose,
 *  - `data.ts` types its two canonical RPC wrappers from the same unions.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all these constants. Never re-type these literals at a call site,
 * and never hardcode a bound into manifest prose: interpolate it from here.
 * (A live drift bug of exactly that kind shipped on `keyword-research` — the
 * length bound was a const inside the component while the manifest quoted a
 * hardcoded literal.)
 *
 * WHY THE VALIDATORS LIVE HERE AND NOT IN THE REACT UPDATER: the surface
 * writeback seam (`features/surfaces/runtime/surface-writeback.ts`) converts a
 * THROW into the safe error envelope the agent reads. A throw raised inside a
 * `setState` updater callback fires during React's render commit, NOT inside
 * the seam's try/catch, so the agent would get a success envelope for a value
 * that never landed. Validating here means the throw is synchronous, lands in
 * the seam, and reaches the model verbatim.
 */

// ---------------------------------------------------------------------------
// Competitor tracking status — `seo.competitor.tracking_status`
// ---------------------------------------------------------------------------

/**
 * Every value `seo.competitor.tracking_status` may hold.
 *
 * SOURCE OF TRUTH — this list is the server's, twice over, and both agree:
 *   - `seo.competitor` CHECK `competitor_tracking_status_valid`
 *     → `('candidate','tracked','ignored','archived')`
 *   - `seo.update_competitor_tracking()` raises `22023 invalid competitor
 *     tracking status` for anything outside that same set.
 *
 * `candidate` is where discovery leaves a rival; the workspace's row actions
 * move it to `tracked` or `ignored`; `archived` retires one without implying a
 * judgment. Nothing here deletes anything.
 *
 * DRIFT THIS CONSTANT EXISTS TO KILL: until 2026-08-12 the two call sites in
 * `data.ts` and `CompetitorAutopsyWorkspace` re-typed this union by hand as
 * `"candidate" | "tracking" | "ignored"`. `"tracking"` is not a value the
 * server has ever accepted, so the Track row action raised the RPC's exception
 * on every click and the user got "Could not update competitor" — a live bug
 * that a hand-copied literal hid in plain sight, and exactly why the manifest
 * interpolates this list instead of quoting one.
 */
export const COMPETITOR_TRACKING_STATUSES = [
  "candidate",
  "tracked",
  "ignored",
  "archived",
] as const;

export type CompetitorTrackingStatus =
  (typeof COMPETITOR_TRACKING_STATUSES)[number];

/** `candidate | tracking | ignored` — interpolate, never re-type. */
export const COMPETITOR_TRACKING_STATUS_LIST =
  COMPETITOR_TRACKING_STATUSES.join(" | ");

/** The same vocabulary already quoted for JSON-shaped contract prose. */
export const COMPETITOR_TRACKING_STATUS_QUOTED_LIST =
  COMPETITOR_TRACKING_STATUSES.map((s) => `"${s}"`).join(" | ");

export function isCompetitorTrackingStatus(
  value: unknown,
): value is CompetitorTrackingStatus {
  return (
    typeof value === "string" &&
    (COMPETITOR_TRACKING_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Opportunity status — `seo.competitor_opportunity.status`
// ---------------------------------------------------------------------------

/**
 * Every value `seo.competitor_opportunity.status` may hold, and the only
 * values `update_competitor_opportunity_status(p_status)` accepts.
 *
 * `open` is where the strategist leaves a fresh recommendation. The workspace's
 * row actions walk it forward (`accepted` → `in_progress` → `completed`) or
 * retire it (`dismissed`).
 */
export const OPPORTUNITY_STATUSES = [
  "open",
  "accepted",
  "in_progress",
  "completed",
  "dismissed",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** `open | accepted | in_progress | completed | dismissed` — interpolate. */
export const OPPORTUNITY_STATUS_LIST = OPPORTUNITY_STATUSES.join(" | ");

/** The same vocabulary already quoted for JSON-shaped contract prose. */
export const OPPORTUNITY_STATUS_QUOTED_LIST = OPPORTUNITY_STATUSES.map(
  (s) => `"${s}"`,
).join(" | ");

export function isOpportunityStatus(
  value: unknown,
): value is OpportunityStatus {
  return (
    typeof value === "string" &&
    (OPPORTUNITY_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Run-form bounds — "how much evidence do we buy"
// ---------------------------------------------------------------------------

/**
 * The only values the run form's two bound selects can DISPLAY.
 *
 * This is a hard constraint, not a preference: both controls are
 * `<Select>`s built from this list, so a staged value outside it renders as an
 * empty trigger — a staged value the user cannot see, which is not a draft.
 * The write handler refuses anything not in this list for that reason.
 */
export const AUTOPSY_RUN_BOUND_CHOICES = [1, 2, 3, 4, 5] as const;

export type AutopsyRunBound = (typeof AUTOPSY_RUN_BOUND_CHOICES)[number];

export const AUTOPSY_MIN_RUN_BOUND = AUTOPSY_RUN_BOUND_CHOICES[0];
export const AUTOPSY_MAX_RUN_BOUND =
  AUTOPSY_RUN_BOUND_CHOICES[AUTOPSY_RUN_BOUND_CHOICES.length - 1];

/** `"1, 2, 3, 4, 5"` — interpolate into contract prose, never re-type. */
export const AUTOPSY_RUN_BOUND_LIST = AUTOPSY_RUN_BOUND_CHOICES.join(", ");

function isAutopsyRunBound(value: unknown): value is AutopsyRunBound {
  return (
    typeof value === "number" &&
    (AUTOPSY_RUN_BOUND_CHOICES as readonly number[]).includes(value)
  );
}

/**
 * How many competitor domains the run form will accept in one staged plan.
 *
 * The textarea itself is unbounded for a human, but an agent handing over a
 * hundred domains is staging a plan nobody reviewed. This ceiling is generous
 * relative to {@link AUTOPSY_MAX_RUN_BOUND} on purpose: the extra entries are
 * candidates the discovery step chooses among, not extra crawls.
 */
export const AUTOPSY_MAX_DOMAIN_ENTRIES = 25;

// ---------------------------------------------------------------------------
// Domain normalization
// ---------------------------------------------------------------------------

/**
 * Reduce one user- or agent-supplied competitor reference to the bare
 * registrable host the run form holds ("https://www.Acme.com/pricing" →
 * "www.acme.com"). Scheme, path, query, fragment, port and surrounding
 * whitespace are stripped; case is normalized.
 *
 * `www.` is deliberately KEPT — `seo.competitor` stores both `display_domain`
 * and a separately-derived `normalized_domain`, and guessing at host equivalence
 * here would put this module in the business of a column it does not own.
 *
 * Throws with actionable text when what is left cannot be a hostname.
 */
export function normalizeCompetitorDomain(raw: unknown, index: number): string {
  if (typeof raw !== "string") {
    throw new Error(
      `competitor_domains[${index}] must be a domain string; received ${describeType(raw)}.`,
    );
  }
  const host = raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // scheme
    .replace(/^[^/@]*@/, "") // userinfo
    .split(/[/?#]/)[0] // path / query / fragment
    .replace(/:\d+$/, "") // port
    .replace(/\.$/, "") // trailing root dot
    .toLowerCase();

  if (!host) {
    throw new Error(
      `competitor_domains[${index}] is blank after trimming — remove it or send a real domain.`,
    );
  }
  if (/\s/.test(host)) {
    throw new Error(
      `competitor_domains[${index}] ("${host}") contains whitespace — send ONE domain per array entry, not a sentence or a delimited list.`,
    );
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    throw new Error(
      `competitor_domains[${index}] ("${host}") is not a domain — send a bare host like "example.com", not a company name, a search phrase, or a URL fragment.`,
    );
  }
  return host;
}

// ---------------------------------------------------------------------------
// The staged run plan
// ---------------------------------------------------------------------------

/**
 * A validated PARTIAL patch over the run form. Every key is optional — an
 * agent narrowing only the competitor list must not have to restate the
 * budgets, and vice versa.
 */
export interface AutopsyRunPlanPatch {
  /** Normalized, de-duplicated hosts. Present only when the agent sent them. */
  domains?: string[];
  maxCompetitors?: AutopsyRunBound;
  pagesPerCompetitor?: AutopsyRunBound;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Validate an agent-supplied `autopsy_run_plan` value and return the patch the
 * page should apply. THROWS on every bad shape — the surface writeback seam
 * turns the throw into the error envelope the agent reads, and nothing is
 * staged (validate-then-apply).
 *
 * Accepts an OBJECT, never a JSON string: the inline-tool layer parses a
 * JSON-looking argument before the handler ever sees it, so a target that
 * declared a string here would receive an already-parsed object, throw, and
 * teach the agent to double-encode its next attempt.
 */
export function parseAutopsyRunPlan(value: unknown): AutopsyRunPlanPatch {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `autopsy_run_plan expects an object with any of { competitor_domains, max_competitors, pages_per_competitor }; received ${describeType(value)}.`,
    );
  }
  const input = value as Record<string, unknown>;

  const known = new Set([
    "competitor_domains",
    "max_competitors",
    "pages_per_competitor",
  ]);
  const unknownKeys = Object.keys(input).filter((key) => !known.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `autopsy_run_plan does not accept ${unknownKeys.map((k) => `"${k}"`).join(", ")}. Only ${[...known].map((k) => `"${k}"`).join(", ")} may be set. The site being analysed, the cached-evidence toggle, and RUNNING the autopsy are not agent-writable.`,
    );
  }
  if (unknownKeys.length === 0 && Object.keys(input).length === 0) {
    throw new Error(
      "autopsy_run_plan was empty — set at least one of competitor_domains, max_competitors, pages_per_competitor.",
    );
  }

  const patch: AutopsyRunPlanPatch = {};

  if ("competitor_domains" in input) {
    const raw = input.competitor_domains;
    if (!Array.isArray(raw)) {
      throw new Error(
        `autopsy_run_plan.competitor_domains expects a real array of plain domain strings (e.g. ["example.com","rival.io"]) — not JSON-encoded text and not one delimited string; received ${describeType(raw)}.`,
      );
    }
    if (raw.length > AUTOPSY_MAX_DOMAIN_ENTRIES) {
      throw new Error(
        `autopsy_run_plan.competitor_domains accepts at most ${AUTOPSY_MAX_DOMAIN_ENTRIES} domains; received ${raw.length}.`,
      );
    }
    const seen = new Set<string>();
    const domains: string[] = [];
    raw.forEach((entry, index) => {
      const host = normalizeCompetitorDomain(entry, index);
      if (seen.has(host)) return;
      seen.add(host);
      domains.push(host);
    });
    patch.domains = domains;
  }

  for (const key of ["max_competitors", "pages_per_competitor"] as const) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (!isAutopsyRunBound(raw)) {
      throw new Error(
        `autopsy_run_plan.${key} must be one of ${AUTOPSY_RUN_BOUND_LIST} — those are the only values the form's select can display, and a value it cannot show is not a draft the user can review. Received ${JSON.stringify(raw)}.`,
      );
    }
    if (key === "max_competitors") patch.maxCompetitors = raw;
    else patch.pagesPerCompetitor = raw;
  }

  return patch;
}

/** Serialize the staged domain list into the exact text the textarea holds. */
export function serializeCompetitorDomains(domains: string[]): string {
  return domains.join("\n");
}

/** Parse the textarea's text the same way the Run button does — the read twin
 *  of {@link serializeCompetitorDomains}. */
export function parseCompetitorDomainsField(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Selection-scoped entity writes
// ---------------------------------------------------------------------------

export interface CompetitorTrackingWrite {
  competitorId: string;
  trackingStatus: CompetitorTrackingStatus;
}

export interface OpportunityStatusWrite {
  opportunityId: string;
  status: OpportunityStatus;
}

/**
 * Validate a `competitor_tracking` value against the rows the user can see
 * RIGHT NOW.
 *
 * `visible` MUST be read live (through a ref), not off a render closure: when
 * an agent stages several targets in one turn the writeback seam resolves every
 * handler BEFORE the user confirms the first dialog, so a closure-captured row
 * list can be a stale snapshot and the write would land on a row the user is no
 * longer looking at.
 */
export function parseCompetitorTrackingWrite(
  value: unknown,
  visible: ReadonlyArray<{ id: string; label: string }>,
): CompetitorTrackingWrite {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `competitor_tracking expects an object { competitor_id, tracking_status }; received ${describeType(value)}.`,
    );
  }
  const input = value as Record<string, unknown>;
  const competitorId = input.competitor_id;
  if (typeof competitorId !== "string" || !competitorId.trim()) {
    throw new Error(
      "competitor_tracking.competitor_id must be the id of a competitor in the Competitors table — read the `competitors` value first and copy an id from it.",
    );
  }
  const match = visible.find((row) => row.id === competitorId.trim());
  if (!match) {
    throw new Error(
      `competitor_tracking.competitor_id "${competitorId}" is not a competitor currently loaded for this site (${visible.length} loaded). Nothing was changed. Re-read the \`competitors\` value and use an id from it.`,
    );
  }
  if (!isCompetitorTrackingStatus(input.tracking_status)) {
    throw new Error(
      `competitor_tracking.tracking_status must be one of ${COMPETITOR_TRACKING_STATUS_LIST}; received ${JSON.stringify(input.tracking_status)}.`,
    );
  }
  return { competitorId: match.id, trackingStatus: input.tracking_status };
}

/** The opportunity twin of {@link parseCompetitorTrackingWrite}; the same
 *  live-`visible` rule applies. */
export function parseOpportunityStatusWrite(
  value: unknown,
  visible: ReadonlyArray<{ id: string; label: string }>,
): OpportunityStatusWrite {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `opportunity_status expects an object { opportunity_id, status }; received ${describeType(value)}.`,
    );
  }
  const input = value as Record<string, unknown>;
  const opportunityId = input.opportunity_id;
  if (typeof opportunityId !== "string" || !opportunityId.trim()) {
    throw new Error(
      "opportunity_status.opportunity_id must be the id of a row in the Opportunities table — read the `opportunities` value first and copy an id from it.",
    );
  }
  const match = visible.find((row) => row.id === opportunityId.trim());
  if (!match) {
    throw new Error(
      `opportunity_status.opportunity_id "${opportunityId}" is not an opportunity currently loaded for this site (${visible.length} loaded). Nothing was changed. Re-read the \`opportunities\` value and use an id from it.`,
    );
  }
  if (!isOpportunityStatus(input.status)) {
    throw new Error(
      `opportunity_status.status must be one of ${OPPORTUNITY_STATUS_LIST}; received ${JSON.stringify(input.status)}.`,
    );
  }
  return { opportunityId: match.id, status: input.status };
}
