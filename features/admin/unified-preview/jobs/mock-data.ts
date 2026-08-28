/**
 * THE JOB BOARD — preview mock data.
 *
 * NON-FUNCTIONAL PREVIEW. Nothing here reads or writes the database. These
 * types are the deliverable as much as the pixels are: they are shaped like
 * THE NEW MODEL (common-docs/systems/agents/mandates/THE-MODEL.md), not like
 * today's `mandate.definition` row.
 *
 * What is new versus today:
 *  - `goal` + `goal_grounding` — the frozen triad's first element, which has
 *    no management surface anywhere in the product today (harvest gap #9).
 *  - `discovery` — REFERENCED / DISCOVERED / BOTH replaces the species enum;
 *    "anchored"/"portable" are usage patterns, never a column (THE-MODEL).
 *  - `fallback_mandate_key` promoted from `metadata.fallback` to first class,
 *    with `follower_keys` so a leader states its blast radius
 *    (FALLBACK-MANDATES.md).
 *  - `altitudes` — ONE job record resolved at each principal altitude. The
 *    frozen triad (goal · output kind · input source) is altitude-INVARIANT;
 *    only the resolution (who holds it, which layer decided, what its coverage
 *    is) differs. That is law 1 rendered as a data shape.
 */

/** Green = met and silent · Orange = a fallback resolves, and it screams · Red = nothing. */
export type CoverageState = "met" | "fallback" | "unmet";

/** Where the written goal came from. Rendered as the H / V / A grounding badge. */
export type GoalGrounding = "human" | "verified" | "ai";

export type HolderType = "agent" | "workflow";

/** Who owns the carrying code — screams follow ownership (THE-MODEL law 5). */
export type MandateOrigin = "code" | "user";

/** How a mandate meets a place. One mandate may be both. */
export type DiscoveryMode = "referenced" | "discovered" | "both";

/** The input contract's source — the third element of the frozen triad. */
export type InputSource =
  | "provision"
  | "surface_manifest"
  | "known_values"
  | "context_items";

/** The four altitudes one board is viewed from. */
export type PrincipalScope = "system" | "organization" | "user";

/** Track latest, or hold a version still. */
export type VersionPolicy = "pinned" | "floating";

/**
 * The precedence chain, plus the layer that is NOT a layer: FALLBACK. It sits
 * below system because it is what answers when no layer decided at all.
 */
export type DecidingLayer = "run" | "user" | "org" | "system" | "fallback";

/** One job, resolved at one altitude. */
export interface JobAtAltitude {
  coverage: CoverageState;
  deciding_layer: DecidingLayer;
  holder_type: HolderType | null;
  holder_id: string | null;
  holder_name: string | null;
  version_policy: VersionPolicy | null;
  /** First-class column. Non-null exactly when coverage is `fallback`. */
  fallback_mandate_key: string | null;
  /** Jobs that follow THIS job as their fallback — the rebind blast radius. */
  follower_keys: string[];
  /**
   * The loud, named line. Required reading for orange and red: a coverage
   * board that says "4 orange" without naming them has buried the defect.
   */
  issue: string | null;
}

export interface PreviewJob {
  id: string;
  mandate_key: string;
  /** THE FROZEN TRIAD, part 1. Prose, written for a human, altitude-invariant. */
  goal: string;
  goal_grounding: GoalGrounding;
  /** THE FROZEN TRIAD, part 2. Nothing leaves an intelligence un-kinded. */
  output_kind: string;
  /** THE FROZEN TRIAD, part 3. */
  input_source: InputSource;
  origin: MandateOrigin;
  discovery: DiscoveryMode;
  domain: string;
  /** Where this job meets a place — a code position, a surface slot, a menu. */
  places: string[];
  /** Resolution per altitude. A missing key = this job does not exist there. */
  altitudes: Partial<Record<PrincipalScope, JobAtAltitude>>;
}

const met = (
  holder_type: HolderType,
  holder_name: string,
  version_policy: VersionPolicy,
  deciding_layer: DecidingLayer = "system",
  follower_keys: string[] = [],
): JobAtAltitude => ({
  coverage: "met",
  deciding_layer,
  holder_type,
  holder_id: `holder-${holder_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  holder_name,
  version_policy,
  fallback_mandate_key: null,
  follower_keys,
  issue: null,
});

const following = (
  leaderKey: string,
  leaderName: string,
  issue: string,
): JobAtAltitude => ({
  coverage: "fallback",
  deciding_layer: "fallback",
  holder_type: "agent",
  holder_id: `holder-${leaderName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  holder_name: leaderName,
  version_policy: "floating",
  fallback_mandate_key: leaderKey,
  follower_keys: [],
  issue,
});

const unmet = (issue: string): JobAtAltitude => ({
  coverage: "unmet",
  deciding_layer: "system",
  holder_type: null,
  holder_id: null,
  holder_name: null,
  version_policy: null,
  fallback_mandate_key: null,
  follower_keys: [],
  issue,
});

/** The organization every org-altitude row in this preview belongs to. */
export const PREVIEW_ORG_NAME = "Titanium";

/** The domain the fourth chip slices to. */
export const PREVIEW_DOMAIN = "SEO";

export const PREVIEW_JOBS: readonly PreviewJob[] = [
  {
    id: "job-01",
    mandate_key: "seo.keyword_classification",
    goal: "Classify every harvested keyword against the client's own taxonomy, and say which tier of the funnel it belongs to.",
    goal_grounding: "human",
    output_kind: "keyword_classification",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "SEO",
    places: ["aidream · seo/keyword_pipeline.py:212"],
    altitudes: {
      system: met("agent", "Keyword Taxonomist", "pinned"),
      organization: met("agent", "Titanium Keyword Taxonomist", "pinned", "org"),
    },
  },
  {
    id: "job-02",
    mandate_key: "seo.generic_analysis",
    goal: "Read any SEO artifact and produce the best general analysis available, whatever the artifact is.",
    goal_grounding: "human",
    output_kind: "markdown",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "SEO",
    places: ["aidream · seo/analysis.py:88"],
    altitudes: {
      system: met("agent", "Generalist SEO Analyst", "floating", "system", [
        "seo.serp_intent_summary",
        "seo.content_gap_brief",
        "seo.backlink_risk_note",
      ]),
    },
  },
  {
    id: "job-03",
    mandate_key: "seo.serp_intent_summary",
    goal: "Summarise what the searcher actually wants from the top ten SERP results, in the client's voice.",
    goal_grounding: "ai",
    output_kind: "markdown",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "SEO",
    places: ["aidream · seo/serp.py:141"],
    altitudes: {
      system: following(
        "seo.generic_analysis",
        "Generalist SEO Analyst",
        "No explicit intelligence. Every run is served by the generic SEO analyst — more tools loaded, more expensive, results that are good enough rather than right.",
      ),
      organization: following(
        "seo.generic_analysis",
        "Generalist SEO Analyst",
        "Titanium has not bound this job either; the system fallback is what your members get.",
      ),
    },
  },
  {
    id: "job-04",
    mandate_key: "seo.content_gap_brief",
    goal: "Name the topics the client's site cannot answer that its three named competitors can, and rank them by winnability.",
    goal_grounding: "ai",
    output_kind: "markdown",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "SEO",
    places: ["aidream · seo/gap.py:57"],
    altitudes: {
      system: following(
        "seo.generic_analysis",
        "Generalist SEO Analyst",
        "No explicit intelligence. The generic SEO analyst has served this job on every run since it was created.",
      ),
    },
  },
  {
    id: "job-05",
    mandate_key: "seo.backlink_risk_note",
    goal: "Flag backlinks that would embarrass the client if a journalist found them, and say why each one is a risk.",
    goal_grounding: "ai",
    output_kind: "markdown",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "SEO",
    places: ["aidream · seo/backlinks.py:304"],
    altitudes: {
      system: following(
        "seo.generic_analysis",
        "Generalist SEO Analyst",
        "No explicit intelligence. Risk judgement is being made by a generalist that was never given the risk criteria.",
      ),
    },
  },
  {
    id: "job-06",
    mandate_key: "crm_contact.next_best_action",
    goal: "Tell the rep the ONE thing to do next with this contact, and the one sentence of evidence behind it.",
    goal_grounding: "human",
    output_kind: "next_best_action",
    input_source: "surface_manifest",
    origin: "code",
    discovery: "referenced",
    domain: "CRM",
    places: ["surface · crm_contact_detail → slot `next_action`"],
    altitudes: {
      system: met("agent", "Next Action Coach", "floating"),
      organization: met("agent", "Titanium Sales Coach", "pinned", "org"),
      user: met("agent", "Titanium Sales Coach", "pinned", "org"),
    },
  },
  {
    id: "job-07",
    mandate_key: "crm_deal.risk_digest",
    goal: "Say, in three lines, why this deal might not close — and what would change the answer.",
    goal_grounding: "human",
    output_kind: "deal_risk_digest",
    input_source: "surface_manifest",
    origin: "code",
    discovery: "referenced",
    domain: "CRM",
    places: ["surface · crm_deal_detail → slot `risk_digest`"],
    altitudes: {
      system: unmet(
        "Nothing holds this job and nothing is named as its fallback. Every run of the deal detail surface errors at this slot.",
      ),
      organization: unmet(
        "Titanium's deal board renders an error card where the risk digest belongs.",
      ),
    },
  },
  {
    id: "job-08",
    mandate_key: "utility.translate_selection",
    goal: "Translate whatever the user selected into their UI language, keeping the tone of the original.",
    goal_grounding: "human",
    output_kind: "markdown",
    input_source: "known_values",
    origin: "code",
    discovery: "discovered",
    domain: "Utility",
    places: [
      "any place where `selection` exists",
      "context menu",
      "kind components",
    ],
    altitudes: {
      system: met("agent", "Tone-Preserving Translator", "floating"),
      user: met("agent", "Tone-Preserving Translator", "floating", "system"),
    },
  },
  {
    id: "job-09",
    mandate_key: "utility.summarize_selection",
    goal: "Compress the selection to its argument, not its words — and keep every number that carried meaning.",
    goal_grounding: "verified",
    output_kind: "markdown",
    input_source: "known_values",
    origin: "code",
    discovery: "discovered",
    domain: "Utility",
    places: ["any place where `selection` exists", "context menu"],
    altitudes: {
      system: met("agent", "Argument Compressor", "pinned"),
      user: met("agent", "My Summarizer", "floating", "user"),
    },
  },
  {
    id: "job-10",
    mandate_key: "case.draft_status_email",
    goal: "Draft the weekly client status email from the case file, in my voice, never promising a date I have not confirmed.",
    goal_grounding: "human",
    output_kind: "markdown",
    input_source: "context_items",
    origin: "user",
    discovery: "discovered",
    domain: "Casework",
    places: ["wherever `case_file` and `client_contact` both resolve"],
    altitudes: {
      user: met("agent", "My Client Voice", "floating", "user"),
    },
  },
  {
    id: "job-11",
    mandate_key: "education.page_guidance",
    goal: "Guide a learner through whatever is on this page without ever giving them the answer outright.",
    goal_grounding: "human",
    output_kind: "guidance_stream",
    input_source: "surface_manifest",
    origin: "code",
    discovery: "both",
    domain: "Education",
    places: ["surface · education_lesson", "30 education page slots"],
    altitudes: {
      system: met("workflow", "Socratic Guidance Flow", "pinned", "system", [
        "research.source_credibility",
      ]),
      organization: met(
        "workflow",
        "Socratic Guidance Flow",
        "pinned",
        "system",
        ["research.source_credibility"],
      ),
    },
  },
  {
    id: "job-12",
    mandate_key: "education.lesson_recap",
    goal: "Recap the lesson as the learner would have to explain it to someone else.",
    goal_grounding: "ai",
    output_kind: "markdown",
    input_source: "surface_manifest",
    origin: "code",
    discovery: "referenced",
    domain: "Education",
    places: ["surface · education_lesson → slot `recap`"],
    altitudes: {
      system: unmet(
        "No holder and no fallback named. The lesson recap panel has never rendered anything but its error state.",
      ),
    },
  },
  {
    id: "job-13",
    mandate_key: "finance.invoice_extraction",
    goal: "Pull line items, totals and terms out of an invoice, and refuse rather than guess when a field is unreadable.",
    goal_grounding: "verified",
    output_kind: "invoice_extraction",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "Finance",
    places: ["aidream · finance/ingest.py:96"],
    altitudes: {
      system: met("workflow", "Invoice Extraction Pipeline", "floating"),
      organization: met(
        "workflow",
        "Titanium AP Pipeline",
        "pinned",
        "org",
      ),
    },
  },
  {
    id: "job-14",
    mandate_key: "support.ticket_triage",
    goal: "Route the ticket to the right queue and say what the customer is actually upset about.",
    goal_grounding: "human",
    output_kind: "ticket_triage",
    input_source: "provision",
    origin: "code",
    discovery: "referenced",
    domain: "Support",
    places: ["aidream · support/intake.py:44"],
    altitudes: {
      system: met("agent", "Triage Officer", "pinned"),
      organization: met("agent", "Triage Officer", "pinned", "system"),
      user: met("agent", "Triage Officer", "pinned", "system"),
    },
  },
  {
    id: "job-15",
    mandate_key: "research.source_credibility",
    goal: "Judge how much weight this source deserves, and say what would have to be true for it to deserve more.",
    goal_grounding: "ai",
    output_kind: "credibility_verdict",
    input_source: "known_values",
    origin: "code",
    discovery: "both",
    domain: "Research",
    places: ["aidream · research/sources.py:150", "context menu on a citation"],
    altitudes: {
      system: following(
        "education.page_guidance",
        "Socratic Guidance Flow",
        "No explicit intelligence. A teaching workflow is being asked to judge sources — it answers, and the answer is generic.",
      ),
      user: following(
        "education.page_guidance",
        "Socratic Guidance Flow",
        "You have not bound this job; the system fallback answers for you too.",
      ),
    },
  },
];

/** Rows that exist at this altitude, worst coverage first. */
export function jobsAtScope(
  scope: PrincipalScope,
  domainFilter: string | null,
): PreviewJob[] {
  const order: Record<CoverageState, number> = {
    unmet: 0,
    fallback: 1,
    met: 2,
  };
  return PREVIEW_JOBS.filter((job) => {
    if (!job.altitudes[scope]) return false;
    if (domainFilter && job.domain !== domainFilter) return false;
    return true;
  }).sort((a, b) => {
    const ca = a.altitudes[scope];
    const cb = b.altitudes[scope];
    if (!ca || !cb) return 0;
    const d = order[ca.coverage] - order[cb.coverage];
    return d !== 0 ? d : a.mandate_key.localeCompare(b.mandate_key);
  });
}

export function coverageCounts(
  jobs: readonly PreviewJob[],
  scope: PrincipalScope,
): Record<CoverageState, number> {
  const counts: Record<CoverageState, number> = {
    met: 0,
    fallback: 0,
    unmet: 0,
  };
  for (const job of jobs) {
    const at = job.altitudes[scope];
    if (at) counts[at.coverage] += 1;
  }
  return counts;
}

/** The leader a follower points at, so the fallback door can open it. */
export function findJobByKey(key: string): PreviewJob | undefined {
  return PREVIEW_JOBS.find((job) => job.mandate_key === key);
}
