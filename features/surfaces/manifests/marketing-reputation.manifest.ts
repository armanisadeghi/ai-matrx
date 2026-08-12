import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  REPUTATION_CASE_USER_SETTABLE_STATUSES,
  REPUTATION_RULING_NOTE_MAX_LENGTH,
} from "@/features/marketing/data/reputation-types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "decisions",
    label: "Decisions",
    description: "Evidence-gated reputation and digital PR cases.",
    sortOrder: 100,
  },
  {
    key: "opportunities",
    label: "Opportunities",
    description: "Publications and narratives grounded in observed evidence.",
    sortOrder: 200,
  },
  {
    key: "quality",
    label: "Evidence quality",
    description: "Coverage, exclusions, limitations, and run state.",
    sortOrder: 300,
  },
];

const values: SurfaceValue[] = [
  {
    group: "decisions",
    name: "reputation_cases",
    label: "Reputation cases",
    description:
      "Durable accepted cases with protect/correct/respond/request-update/leave-alone/pitch decisions, facts, inferences, evidence references, scores, and human lifecycle state.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 7000,
    sortOrder: 400,
  },
  {
    group: "opportunities",
    name: "publication_opportunities",
    label: "Publication opportunities",
    description:
      "Publications with demonstrated prior interest, topical overlap, a supportable angle, available assets, confidence, and resolvable evidence.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 3500,
    sortOrder: 410,
  },
  {
    group: "opportunities",
    name: "reputation_narratives",
    label: "Observed narratives",
    description:
      "Recurring narratives with stance, verification status, prevalence, severity, handling, and exact evidence references.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 3000,
    sortOrder: 420,
  },
  {
    group: "quality",
    name: "reputation_brief",
    label: "Latest evidence brief",
    description:
      "The latest validated Content IR brief. Model output is admitted only after deterministic provenance, confidence, correction, and outreach gates.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 430,
  },
  {
    group: "quality",
    name: "evidence_inventory",
    label: "Evidence inventory",
    description:
      "Live counts of enriched backlinks, known referring domains, competitor opportunities, AI citations/claims, and first-party business facts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 440,
  },
  {
    group: "quality",
    name: "reputation_run_state",
    label: "Analysis run state",
    description:
      "The current streamed analysis stage and durable run identity when a run exists in this browser session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 450,
  },
];

/**
 * WRITE TARGETS — why this surface ships exactly ONE, and why that one earns it.
 *
 * ## The honest count
 *
 * This surface has exactly one canonical write path: the RPC
 * `seo.update_reputation_case(p_case_id, p_status, p_human_ruling)`, reached
 * through `updateReputationCase` → `useUpdateReputationCase` → the case card's
 * own Dismiss / Monitor / Accept / Start action / Complete row. One write path
 * yields one target, and `reputation_case_triage` is it. The skill's ~2-target
 * floor exists to stop thin adoptions, and the campaign's accepted one-target
 * adoptions are the ones that are COMPOSITES over several fields or uniquely
 * high-leverage. This is both, which is the argument for shipping it:
 *
 *  - It is a composite. One call carries WHICH case, the lifecycle decision,
 *    and the written rationale that justifies it — three fields that are
 *    decided together and would be actively worse as three micro-targets.
 *  - It is the leverage. This manifest already declares a `reputation_adjudicator`
 *    agent role whose entire stated job is to "issue defensible handling
 *    decisions from closed evidence". Before this target that role could only
 *    TALK: it could read every fact, inference and evidence ref on a case and
 *    then had no way to record a single ruling. A declared role with no way to
 *    act is an incomplete surface, and this closes it.
 *  - The sweep is the point. Cases arrive as a QUEUE, each needing the same
 *    read-the-evidence-then-decide judgment. That is tedious one card at a
 *    time and is exactly what an agent is good at. Every call still raises its
 *    own ask dialog, so the human rules on each one.
 *
 * `features/surfaces/FEATURE.md` (2026-08-11, the `matrx-user/messages` entry)
 * lists `marketing-reputation` among surfaces that "fail the bar". That sweep
 * was a breadth pass across 14 candidates; read closely, this surface fails a
 * COUNT test, not a value test, and the same entry allows one-target adoptions
 * that are composites or uniquely high-leverage. The later campaign audit
 * reached the opposite conclusion and named this the one genuinely ready
 * candidate left. Both are recorded here on purpose — the disagreement is real
 * and the reader should be able to re-judge it rather than take this on faith.
 *
 * ## What is deliberately NOT writable, and why
 *
 *  - `reputation_brief`, `reputation_narratives`, `publication_opportunities`,
 *    `evidence_inventory` — model OUTPUT admitted only after deterministic
 *    provenance, confidence, correction and outreach gates. Writing them
 *    FORGES evidence, which is the one thing an evidence-closed surface must
 *    never allow. There is also no write path to them: they are derived.
 *  - Starting an analysis run ("Run intelligence" / "Recheck evidence") spends
 *    real model budget, so the human press stays the gate.
 *  - `verdict`, `pitch_angle`, `priority`, `confidence`, scores — pipeline
 *    output on the case row, with no UI affordance and no write path. Editing
 *    them would mean overwriting the analysis with a second opinion that
 *    claims to be the analysis.
 *  - The tab (`?tab=`) is a mechanical view toggle and does not earn a target
 *    on its own. There is no per-case selection state to point at either, and
 *    BUILDING one purely to reach a second target would be inventing product
 *    to hit a count.
 *  - `"open"` as a status: no control anywhere sets a case back to it. See
 *    REPUTATION_CASE_USER_SETTABLE_STATUSES.
 *
 * ## Mode: `entity`, not `draft`
 *
 * `draft` is the campaign's default preference, but it is only honest where a
 * declared read value actually reflects a staging buffer. There is NO staging
 * buffer on this page — the case card's buttons call the mutation directly and
 * the row is re-fetched. The read twin `reputation_cases` reports the STORED
 * row, so a "staged" status would be a value the twin could never see and the
 * user could never save. `entity` is the truthful mode here.
 *
 * ## Provenance
 *
 * The column is called `human_ruling`, and this surface's whole doctrine is
 * that facts, model inferences and human rulings stay separate. So the handler
 * stamps `decided_via: "agent_surface_write"` into the ruling alongside the
 * note. The human still rules — nothing lands without them pressing Apply on
 * the ask dialog — but the record never silently claims a human WROTE the
 * prose. Note `seo.update_reputation_case` REPLACES `human_ruling` wholesale
 * (and recomputes `resolved_assessment` as `analysis || human_ruling`), so the
 * handler always sends a complete ruling object rather than a patch.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "reputation_case_triage",
    label: "Case triage decision",
    description: `Record the human lifecycle decision on ONE reputation case, with the rationale that justifies it. Value is an object: { case_id: string, status: ${REPUTATION_CASE_USER_SETTABLE_STATUSES.join(
      " | ",
    )}, note?: string }.

\`case_id\` is REQUIRED and must be the \`id\` of a case in the \`reputation_cases\` value — this page is a QUEUE and there is no "selected case", so a decision that does not name its case has nowhere to land and is refused. \`status\` is exactly one of the five strings above, the same five the case card's own action row sets; "open" is the pipeline's starting state and can never be written back. "accepted" is only valid on a case whose current status is "open" (it is the Accept button, which the card only renders while the case is open) — sending it on any other case is refused, matching what the user can actually click.

\`note\` is optional and is the reason for the decision, ${REPUTATION_RULING_NOTE_MAX_LENGTH} characters or fewer. Write it from the evidence ON the case — its facts, inferences, evidence refs, contradictions and missing evidence — and say what the evidence supports, not what would be convenient. It REPLACES any note already stored on that case's ruling; there is no append. Omitting it clears the stored note, so when you are only changing the status of a case that already carries a rationale you should send the existing note back with it.

Persists immediately through the same case-update path the Dismiss / Monitor / Accept / Start action / Complete buttons use, once the user confirms — there is no draft to save afterwards. Reflected in the \`reputation_cases\` value as that case's \`status\` and \`human_ruling\`. This decides HANDLING only: it never edits the case's verdict, scores, facts or evidence, and it cannot delete anything. Completing or dismissing a case drops it out of the active queue, so use those for cases genuinely finished or genuinely not worth acting on.`,
    valueType: "object",
    updatesValue: "reputation_cases",
    mode: "entity",
    applyPolicy: "ask",
    group: "decisions",
    sortOrder: 500,
  },
];

export const marketingReputationManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-reputation",
  readiness: "verified",
  label: "Digital PR & Reputation",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/reputation",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are in the Digital PR & Reputation command center for one managed site. Read brand_context and site_context first, then use the evidence brief and durable cases.
This surface is evidence-closed. Facts, model inferences, and human rulings are separate. Never turn an allegation into fact, invent a publication relationship, infer control from a provider score, or recommend correction without the disputed source and contrary authoritative evidence.
Protect accurate positive coverage. Outreach requires demonstrated editorial interest, topic overlap, a genuinely supportable angle, an available source asset, and resolvable evidence. Negative coverage can be protect, correct, respond, request update, leave alone, monitor, or investigate; choose the least risky action the evidence supports.
The evidence_inventory states what the platform actually has. Missing lanes and the brief's limitations are part of the answer, not details to hide.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
  agentRoles: [
    {
      name: "reputation_adjudicator",
      label: "Reputation adjudicator",
      description:
        "Separates facts from inferences and issues defensible handling decisions from closed evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "digital_pr_strategist",
      label: "Digital PR strategist",
      description:
        "Finds genuinely relevant publication opportunities and evidence-backed resource angles.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

export function createMarketingReputationScope(values: {
  brand_id: string;
  site_id: string;
  reputation_cases?: Array<Record<string, unknown>>;
  publication_opportunities?: Array<Record<string, unknown>>;
  reputation_narratives?: Array<Record<string, unknown>>;
  reputation_brief?: Record<string, unknown>;
  evidence_inventory?: Record<string, unknown>;
  reputation_run_state?: Record<string, unknown>;
  brand_name?: string;
  gsc_synced_at?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
