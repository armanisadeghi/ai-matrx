/**
 * Surface manifest — Outreach Lists (`matrx-user/crm-outreach-lists`).
 *
 * The outreach campaign console at /crm/outreach-lists: every outreach list
 * (cold email / call / mixed audiences) the user can work, table-first, with
 * create + lifecycle actions. Registered by WP5 of the outreach-system program
 * (decision D14) as the anchor for the outreach agent roles and assist strip;
 * the surface itself is owned by the pipeline (WP1).
 *
 * READ-ONLY v1, deliberately: no writeTargets yet. The useful agent work here
 * is planning and drafting (the roles below) — every draft an agent produces
 * lands as a `crm.interaction` row with status 'planned' through the
 * outreach_single_send service (contract IC-6), never as a direct write to
 * this page. List lifecycle (activate / pause / delete) stays human.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const CRM_OUTREACH_LISTS_SURFACE_NAME = "matrx-user/crm-outreach-lists";

const groups: SurfaceValueGroup[] = [
  {
    key: "lists",
    label: "Outreach lists",
    sortOrder: 100,
    description: "The outreach lists currently loaded in the console table.",
  },
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 200,
    description: "Organizations and loading state available to this console.",
  },
];

/**
 * One row of `visible_lists` — the summary shape the emitter builds from the
 * loaded `OutreachListWithCount` rows. A mapped summary, not the raw DB row:
 * the raw row carries `definition` jsonb (sequence + enrollment provenance)
 * that can run to kilobytes per list and belongs to the detail surface.
 */
export interface OutreachListSummary {
  id: string;
  name: string;
  description: string | null;
  list_kind: string;
  status: string;
  member_count: number;
  started_at: string | null;
  updated_at: string;
}

const values: SurfaceValue[] = [
  {
    name: "visible_lists",
    label: "Visible outreach lists",
    description:
      "Summary of every outreach list loaded in the table: id, name, description, kind (list/email/call/mixed), status, member count, started and updated times. Empty array when the user has no outreach lists.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "lists",
    sortOrder: 100,
  },
  {
    name: "visible_list_ids",
    label: "Visible list IDs",
    description:
      "UUIDs of the outreach lists in the table, in display order. Empty array when none exist.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    group: "lists",
    sortOrder: 110,
  },
  {
    name: "list_count",
    label: "List count",
    description: "Number of outreach lists loaded. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "lists",
    sortOrder: 120,
  },
  {
    name: "available_organizations",
    label: "Available organizations",
    description:
      "Organizations whose outreach lists this console can show, as id and name pairs. Empty until memberships resolve or when the user belongs to none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "workspace",
    sortOrder: 200,
  },
  {
    name: "is_loading",
    label: "List is loading",
    description:
      "True while the outreach lists are still loading. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "workspace",
    sortOrder: 210,
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "Current load error message. Empty when the lists loaded successfully.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "workspace",
    sortOrder: 220,
  },
];

export const crmOutreachListsManifest: SurfaceManifest = {
  surfaceName: CRM_OUTREACH_LISTS_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Binding pass done 2026-08-16 (WP5 round 3). All three roles carry a default agent and were launched live from /crm/outreach-lists: Surface Context reported Live 5/6 supplied, contract honored (load_error correctly absent), and a real pitch_assistant run returned values it could not have guessed — both campaign UUIDs, names, kinds (email/call) and member counts. visible_lists is autoContext:false and ~4000 chars, so it arrives as a DEFERRED item: an agent told not to use tools correctly reports it as unavailable rather than inventing it, and returns it in full once retrieval is allowed. Verify a composite value WITH retrieval allowed. Known mismatch, deliberate: the personalization_writer role points at personalization_line_writer, a STRUCTURED batch agent (variables campaign_context/targets_json) — correct as the role's implementation, which the personalization run resolves through its slot, but it is not a conversational agent and the chat window will ask for its variables. Fix is a conversational front for that role, not a rebinding.",
  label: "Outreach Lists",
  urlPattern: "/crm/outreach-lists",
  intro: `<surface_intro>
You are in the outreach lists console — the campaign home for cold outreach.
Each list is a named audience (email, calling, or mixed) whose members are CRM
parties worked through sequences, the call queue, and single sends. The lists
values describe exactly what the table shows; workspace values say which
organizations are in play and whether the list is still loading.

WHAT YOU MAY DO HERE: explain, plan, prioritize, and draft. Anything you draft
becomes a planned message a human reviews in the Chasebox — you have no send
path, and you never imply one. Never state a fact about a recipient you cannot
trace to a stored record, and never fill a merge variable with a guess: an
unresolved variable correctly refuses to send.

WHAT YOU MAY NOT DO: activate, pause, delete, or enroll into lists — the user
presses those buttons. Suppression, do-not-contact, and sending eligibility are
decided by one authority server-side; never reason around a block, and never
suggest a workaround for one.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
  agentRoles: [
    {
      name: "outreach_strategist",
      label: "Outreach strategist",
      description:
        "Turns stored evidence and recommended actions into a prioritized outreach plan; drafts wording on request. Never sends and has no contact lookup.",
      kind: "single",
      // Platform agent `outreach_strategist` (WP5 roster) — plans + drafts, refuses to send.
      defaultAgentId: "6a8c6a97-a473-440f-87b1-ab09e02adfa2",
      sortOrder: 100,
    },
    {
      name: "personalization_writer",
      label: "Personalization writer",
      description:
        "Explains what personalizing this campaign will do, why a particular member has no line, and how to word one that only says what the evidence says. The lines themselves are written by the validated run, from facts read on each target's own pages — every one carrying the fact and the source page it came from.",
      kind: "single",
      // Platform agent `personalization_coach` (WP5 roster) — the CONVERSATIONAL
      // FRONT for this role (round 4). The role previously pointed at
      // `personalization_line_writer` (67df8ca0), the STRUCTURED batch writer
      // that actually writes the lines: correct as the implementation, which
      // the personalization run resolves through its own slot, but launched
      // from the agent menu it asked a non-technical user to fill in two JSON
      // variables. The batch writer is unchanged and still does the writing —
      // this agent is who you talk to about it, and it is deliberately NOT a
      // second writer (a line typed in chat has had none of the server-side
      // citation validation done to it, D-W5-7).
      defaultAgentId: "2b15f237-0cf7-4917-bd14-918d4bac6be8",
      sortOrder: 110,
    },
    {
      name: "pitch_assistant",
      label: "Pitch assistant",
      description:
        "Writes and sharpens the message a campaign actually sends — pitch body, subject-line options, and follow-ups that carry a new reason to reply. Uses only merge fields the outreach renderer can really fill.",
      kind: "single",
      // Platform agent `pitch_assistant` (WP5 roster) — conversational copy
      // specialist. Templates it writes become real `agent.message_template`
      // rows through the validated pitch-template door, never around it.
      defaultAgentId: "db484110-610f-4dd6-8fad-21e805681cd0",
      sortOrder: 120,
    },
  ],
};

export function createCrmOutreachListsScope(values: {
  visible_lists: OutreachListSummary[];
  visible_list_ids: string[];
  list_count: number;
  available_organizations?: Array<{ id: string; name: string }>;
  is_loading: boolean;
  load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
