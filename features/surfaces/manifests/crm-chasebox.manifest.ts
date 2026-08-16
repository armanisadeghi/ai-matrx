/**
 * Surface manifest — the Chasebox (`matrx-user/crm-chasebox`).
 *
 * "What needs me now" for outreach: five queues over `crm.interaction` +
 * `crm.outreach_list_member` (D9 — saved filters, never a second store). The
 * work that happens here is TRIAGE AT VOLUME: fresh replies to answer, and
 * AI-personalized drafts to approve, reword, or reject one keystroke at a time.
 *
 * Registered by WP1 (which owns the surface) because the page has been mounting
 * `<AssistStrip surfaceName="matrx-user/crm-chasebox"/>` against a surface that
 * did not exist — and per IC-7 a surface with no manifest can carry neither an
 * assist strip nor an agent role. Both are needed here now that WP5's
 * personalization writer lands drafts into this queue.
 *
 * READ-ONLY v1, deliberately: no writeTargets. Approve / send / edit / reject
 * all go through the canonical `outreach_single_send` client, which owns the
 * fingerprint law and the earned-trust ladder. An agent may explain and
 * suggest wording here; only the human presses the button.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const CRM_CHASEBOX_SURFACE_NAME = "matrx-user/crm-chasebox";

const groups: SurfaceValueGroup[] = [
  {
    key: "queue",
    label: "Queue",
    sortOrder: 100,
    description: "Which queue is open and what it currently holds.",
  },
  {
    key: "draft",
    label: "Draft under review",
    sortOrder: 200,
    description:
      "The exact message a human is being asked to approve, with the evidence behind its AI-written lines.",
  },
];

/** One row of `visible_items` — the summary the emitter builds from the loaded
 * `crm_chasebox_items` rows. The problem AND its fix, because that pair is what
 * the row means; never the raw interaction body. */
export interface ChaseboxItemSummary {
  id: string;
  queue: string;
  party_name: string | null;
  outreach_list_name: string | null;
  step: number | null;
  problem_code: string | null;
  problem_message: string | null;
  problem_fix: string | null;
  occurred_at: string | null;
}

const values: SurfaceValue[] = [
  {
    name: "active_queue",
    label: "Open queue",
    description:
      "Which of the five queues is open: fresh_replies, pending_drafts, stalled_sequences, blocked_members, escalation_candidates. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    group: "queue",
    sortOrder: 100,
  },
  {
    name: "queue_counts",
    label: "Queue counts",
    description:
      "Live count per queue for the current scope, as name/number pairs. A queue with none is a real 0, never missing.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "queue",
    sortOrder: 110,
  },
  {
    name: "visible_items",
    label: "Visible items",
    description:
      "The rows on screen in the open queue: contact, campaign, step, the problem it names and the fix it offers. Empty array when the queue is clear.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "queue",
    sortOrder: 120,
  },
  {
    name: "total_items",
    label: "Items in this queue",
    description:
      "Server-side total for the open queue — what the visible page is a slice OF. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "queue",
    sortOrder: 130,
  },
  {
    name: "draft_subject",
    label: "Draft subject",
    description:
      "Subject line of the draft currently open for review. Empty when no draft is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "draft",
    sortOrder: 200,
  },
  {
    name: "draft_body",
    label: "Draft body",
    description:
      "The exact rendered message awaiting approval, footer included. Empty when no draft is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    group: "draft",
    sortOrder: 210,
  },
  {
    name: "draft_personalization",
    label: "Personalization evidence",
    description:
      "The AI-written lines in the open draft, each with the fact it stands on and the source page that fact came from. Empty when the draft has none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "draft",
    sortOrder: 220,
  },
  {
    name: "draft_approved",
    label: "Draft already approved",
    description:
      "True when a human has already approved these exact bytes and only sending remains.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "draft",
    sortOrder: 230,
  },
];

export const crmChaseboxManifest: SurfaceManifest = {
  surfaceName: CRM_CHASEBOX_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Read vocabulary verified against crm_chasebox_items + the draft review dialog; emitter and assist strip both mounted on ChaseboxPage. draft_reviewer carries its default agent (outreach_draft_reviewer, WP5 round 4) and was proven against a real draft + evidence pair. Note: draft_body and visible_items are autoContext:false, so they arrive DEFERRED — verify them with retrieval allowed or an emitter that works looks broken.",
  label: "Chasebox",
  urlPattern: "/crm/chasebox",
  intro: `<surface_intro>
You are in the Chasebox — the one place that answers "what needs me now" for
outreach. Five queues over the same records the campaigns use: replies nobody
answered, drafts the trust ladder held for a human, sequences that stopped,
members a send would refuse, and people the whole sequence never reached.

WHAT YOU MAY DO HERE: explain a queue item, compare a draft against the evidence
shown beside it, and suggest better wording for the AI-written lines. Say plainly
when a personalization line is not supported by the fact quoted under it — that
is the single most useful thing you can do on this surface.

WHAT YOU MAY NOT DO: approve, send, reject, or edit anything. Every one of those
is a human keystroke through the one governed send path. Never suggest working
around a block a queue reports: suppression, do-not-contact and sending
eligibility are decided by one authority server-side.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
  agentRoles: [
    {
      name: "draft_reviewer",
      label: "Draft reviewer",
      description:
        "Reads a held draft beside its personalization evidence and says whether the claim is actually supported by the quoted fact and source page, then suggests a better line. Never approves, sends, or edits — it hands wording to the human.",
      kind: "single",
      // Platform agent `outreach_draft_reviewer` (builtin, public card) — WP5
      // of the outreach program, authored through the sanctioned factory and
      // conversational per D-W5-3. It judges each AI-written line against the
      // fact and source page supplied beside it; it has no send, approve,
      // edit, or reject path and never claims one.
      defaultAgentId: "fa6a4506-a658-41c0-9094-8a370e490849",
      sortOrder: 100,
    },
  ],
};

export function createCrmChaseboxScope(values: {
  active_queue: string;
  queue_counts: Record<string, number>;
  visible_items: ChaseboxItemSummary[];
  total_items: number;
  draft_subject?: string;
  draft_body?: string;
  draft_personalization?: Array<{
    name: string;
    text: string;
    fact: string | null;
    source_url: string | null;
  }>;
  draft_approved?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
