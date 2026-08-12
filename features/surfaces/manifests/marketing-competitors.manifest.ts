import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  AUTOPSY_MAX_DOMAIN_ENTRIES,
  AUTOPSY_RUN_BOUND_LIST,
  COMPETITOR_TRACKING_STATUS_QUOTED_LIST,
  OPPORTUNITY_STATUS_QUOTED_LIST,
} from "@/features/marketing/competitors/autopsy-controls";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "selection", label: "Selected site", sortOrder: 100, description: "The managed site currently being investigated." },
  { key: "run_form", label: "Autopsy run plan", sortOrder: 150, description: "The staged, not-yet-run evidence plan sitting in the \"Run a fresh autopsy\" card." },
  { key: "competitors", label: "Competitors", sortOrder: 200, description: "Stable competitors and their resolved threat assessments." },
  { key: "opportunities", label: "Opportunities", sortOrder: 300, description: "Prioritized actions produced from the evidence." },
  { key: "evidence", label: "Evidence", sortOrder: 400, description: "The latest verdict, coverage, limitations, and run state." },
];

const values: SurfaceValue[] = [
  { group: "selection", name: "site_id", label: "Site id", description: "The selected web.site identity.", valueType: "string", alwaysAvailable: false, typicalCharCount: 36, sortOrder: 100 },
  { group: "selection", name: "site", label: "Selected site", description: "Name, domain, and root URL for the selected managed site.", valueType: "object", alwaysAvailable: false, typicalCharCount: 300, sortOrder: 110 },
  { group: "competitors", name: "competitors", label: "Competitor assessments", description: "The currently loaded stable competitors, including tracking, relevance, threat, overlap, visibility, and latest resolved judgment.", valueType: "array", alwaysAvailable: false, typicalCharCount: 5000, autoContext: false, sortOrder: 200 },
  { group: "opportunities", name: "opportunities", label: "Prioritized opportunities", description: "The currently loaded normalized opportunities with verdicts, actions, evidence, dependencies, owned-page relationships, scores, and human status.", valueType: "array", alwaysAvailable: false, typicalCharCount: 9000, autoContext: false, sortOrder: 300 },
  { group: "evidence", name: "latest_autopsy", label: "Latest autopsy", description: "The latest completed Content IR strategist artifact, including executive verdict and evidence coverage.", valueType: "object", alwaysAvailable: false, typicalCharCount: 7000, autoContext: false, sortOrder: 400 },
  { group: "evidence", name: "active_run", label: "Active run", description: "Current run status, durable run id, and visible pipeline stage.", valueType: "object", alwaysAvailable: false, typicalCharCount: 300, sortOrder: 410 },
  { group: "run_form", name: "autopsy_competitor_domains", label: "Staged competitor domains", description: "The competitor domains currently typed into the run form, one per line, that the NEXT autopsy would include. Empty means the run would discover competitors automatically from keyword overlap.", valueType: "array", alwaysAvailable: true, typicalCharCount: 120, sortOrder: 150 },
  { group: "run_form", name: "autopsy_max_competitors", label: "Staged competitor budget", description: "How many competitors the next autopsy would analyse.", valueType: "number", alwaysAvailable: true, typicalCharCount: 1, sortOrder: 160 },
  { group: "run_form", name: "autopsy_pages_per_competitor", label: "Staged pages-per-competitor budget", description: "How many pages of each competitor the next autopsy would crawl.", valueType: "number", alwaysAvailable: true, typicalCharCount: 1, sortOrder: 170 },
  { group: "run_form", name: "autopsy_force_refresh", label: "Ignore cached provider evidence", description: "Whether the next autopsy would bypass today's cached provider evidence and re-buy it. Read-only to agents — see the writeTargets docblock.", valueType: "boolean", alwaysAvailable: true, typicalCharCount: 5, sortOrder: 180 },
];

/**
 * Write targets — the autopsy PLAN, and the human triage of what it produced.
 *
 * THE LINE THIS SURFACE DRAWS, and it is the same line every adopter in this
 * campaign draws: **an agent may stage the evidence plan; it may never buy the
 * evidence.** "Run competitor autopsy" POSTs
 * `/seo/sites/{site_id}/competitor-autopsy`, which spends DataForSEO provider
 * calls, crawls `max_competitors × pages_per_competitor` pages of someone
 * else's site, and runs an LLM strategist over the result — the run history
 * table on this very page carries a `reported_cost` column, so the spend is not
 * hypothetical. `image-generate` stopped at Generate, `scraper` at Scrape,
 * `marketing-crawls` at starting a crawl, `matrx-admin/email` at Send, and
 * `matrx-user/keyword-research` at the Research button. This surface stops at
 * Run: the agent fills the card in, the USER presses the button.
 *
 * WHY ONE PLAN OBJECT, not three scalars: `competitor_domains`,
 * `max_competitors` and `pages_per_competitor` are ONE decision — "who do we
 * look at, and how much do we buy looking at them" — taken together and
 * submitted by a single button. They are also interdependent in the direction
 * that matters: naming five rivals while leaving the budget at one silently
 * discards four. Bundling them means the handler resolves them ATOMICALLY, and
 * the user reads one coherent plan in one ask dialog instead of confirming
 * three fragments that only make sense together. (It matters mechanically too:
 * when an agent stages several targets in one turn, the writeback seam resolves
 * every handler closure BEFORE the user confirms the first dialog, so
 * interdependent fields split across targets can resolve against different
 * snapshots.) Every key is optional, so narrowing just the domain list does not
 * force the agent to restate budgets it did not reason about.
 *
 * WHY THE TWO TRIAGE TARGETS: `competitor_tracking` and `opportunity_status`
 * are not part of the plan at all. They answer a different question, at a
 * different time, against evidence that ALREADY exists: "of the rivals and
 * recommendations this autopsy produced, which ones deserve our attention?"
 * That is the textbook planning field an agent derives from context — it has
 * just read `latest_autopsy`'s verdict, every opportunity's `why_competitor_wins`
 * and `current_advantage`, and each competitor's overlap scores, so a triage
 * ruling is genuinely reasoned rather than mechanical. Both persist through the
 * page's canonical RPC wrappers (`updateCompetitorTracking`,
 * `updateOpportunityStatus` in `./data`), never raw supabase, so the agent's
 * write is indistinguishable from the user clicking the row action — including
 * the `human_ruling` provenance the RPC stamps.
 *
 * Both are SELECTION-SCOPED, which is the trap they are written against: a
 * handler that decided WHICH row to write from a render closure could act on a
 * stale snapshot and change a row the user cannot see. So each carries its
 * target id IN the value, the handler resolves the visible rows through a REF,
 * and an id that is not currently loaded is refused outright with the loaded
 * count — the whole write, not a best-effort partial.
 *
 * DELIBERATELY NOT DECLARED:
 *  - **Running the autopsy.** The line above. Not a target in any form.
 *  - **`site_id`** (the Site select). It is the tenancy/scope identity of the
 *    whole workspace and, worse, it redirects WHERE the next paid run points.
 *    An agent quietly moving it is the failure mode where a user presses a
 *    button they already reviewed and buys evidence about the wrong property.
 *  - **`force_refresh`** ("Ignore today's cached provider evidence"). Its only
 *    effect is to make the next run cost MORE by declining the cache. A control
 *    whose sole axis is spend belongs to whoever pays. It has a read value so
 *    an agent can SEE and reason about the plan it is filling in.
 *  - **Everything downstream of a run** — the competitors' provider metrics,
 *    the opportunities' verdicts and recommended actions, `latest_autopsy`, the
 *    run history. That is observed and reasoned EVIDENCE; writing it would
 *    fabricate findings the user's own reading treats as real. Only the HUMAN
 *    STATUS column of those rows is writable, which is exactly the separation
 *    the page's own footer promises: "Every provider fact, crawl observation,
 *    AI judgment, and human status remains separate in the stored record."
 *
 * MOUNT: `CompetitorAutopsyWorkspace` is the only component that mounts a
 * `SurfaceRuntimeProvider` for this surface, and it owns every piece of state
 * these targets touch, so all three handlers register there.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "autopsy_run_plan",
    label: "Autopsy run plan",
    description: `Fills in the "Run a fresh autopsy" card WITHOUT running it — the user still presses "Run competitor autopsy", which is what spends provider credits and crawls competitor pages. Send an object with any of: "competitor_domains" (a real JSON array of bare domain strings like ["example.com","rival.io"] — not JSON-encoded text, not one delimited string; at most ${AUTOPSY_MAX_DOMAIN_ENTRIES}; scheme and path are stripped, duplicates dropped; an empty array clears the box, which means "discover competitors automatically from keyword overlap"), "max_competitors" and "pages_per_competitor" (each one of ${AUTOPSY_RUN_BOUND_LIST} — the only values the form's selects can display). Keys you omit are left exactly as the user set them. Refused while an autopsy is already running. Read autopsy_competitor_domains / autopsy_max_competitors / autopsy_pages_per_competitor first to see what is already staged.`,
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "run_form",
    sortOrder: 150,
  },
  {
    name: "competitor_tracking",
    label: "Competitor tracking status",
    description: `Sets one competitor's tracking status — the same change as the Track / Stop tracking row action, saved immediately through the canonical RPC. Send an object { "competitor_id": "<id from the competitors value>", "tracking_status": ${COMPETITOR_TRACKING_STATUS_QUOTED_LIST} }. The id must belong to a competitor currently loaded for this site — an unknown id changes nothing and returns the loaded count. This moves only the HUMAN ruling; every provider fact and AI judgment on the row is untouched. Refused while an autopsy is running, because a finishing run replaces these rows.`,
    valueType: "object",
    updatesValue: "competitors",
    mode: "entity",
    applyPolicy: "ask",
    group: "competitors",
    sortOrder: 200,
  },
  {
    name: "opportunity_status",
    label: "Opportunity status",
    description: `Moves one prioritized opportunity through its workflow — the same change as the Accept / Start / Complete / Dismiss row actions, saved immediately through the canonical RPC. Send an object { "opportunity_id": "<id from the opportunities value>", "status": ${OPPORTUNITY_STATUS_QUOTED_LIST} }. The id must belong to an opportunity currently loaded for this site — an unknown id changes nothing and returns the loaded count. This moves only the HUMAN status; the verdict, recommended action and evidence on the row are untouched. Refused while an autopsy is running, because a finishing run replaces these rows.`,
    valueType: "object",
    updatesValue: "opportunities",
    mode: "entity",
    applyPolicy: "ask",
    group: "opportunities",
    sortOrder: 300,
  },
];

export const marketingCompetitorsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-competitors",
  readiness: "verified",
  label: "Competitor Opportunity Autopsy",
  urlPattern: "/marketing/competitors",
  intro: `<surface_intro>
You are on the competitor opportunity autopsy workspace. The selected site is the client; competitors are only rivals supported by provider overlap or explicitly supplied by the user. Read latest_autopsy for the causal verdict and evidence limitations, competitors for stable threat assessments, and opportunities for the concrete work queue.
Keep provider facts, crawler observations, AI judgments, and human workflow status separate. Never restate authority or keyword counts as strategy. Lead with why the competitor wins, what the client already has, and the smallest high-leverage action that closes the gap. Every owned page id and competitor URL is a real door; use it rather than naming an unreachable record.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
  agentRoles: [
    { name: "competitor_strategist", label: "Competitor strategist", description: "Explains causal advantages and prioritizes the minimum action set from stored evidence.", kind: "single", defaultAgentId: null, sortOrder: 100 },
  ],
};

export function createMarketingCompetitorsScope(values: {
  site_id?: string;
  site?: Record<string, unknown>;
  competitors?: Array<Record<string, unknown>>;
  opportunities?: Array<Record<string, unknown>>;
  latest_autopsy?: Record<string, unknown>;
  active_run?: Record<string, unknown>;
  autopsy_competitor_domains?: string[];
  autopsy_max_competitors?: number;
  autopsy_pages_per_competitor?: number;
  autopsy_force_refresh?: boolean;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
