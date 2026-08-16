/**
 * Surface manifest — the unified outreach inbox (`matrx-user/crm-inbox`).
 *
 * Who replied, what they said, and what it means for the campaign they came out
 * of. D9: a VIEW over `crm.interaction` + `crm.outreach_list_member` — one row
 * is one INBOUND message with its classifier verdict and the evidence behind it.
 *
 * Registered by WP1 (which owns the surface), and for the same reason the
 * Chasebox was: `InboxPage` has been mounting
 * `<AssistStrip surfaceName="matrx-user/crm-inbox"/>` against a surface row that
 * never existed, so the strip could never render and no role could hang off it
 * (IC-7 — a surface with no manifest carries neither). It was the LAST
 * unregistered outreach surface.
 *
 * READ-ONLY v1, deliberately: no writeTargets. Marking a reply handled, replying
 * to it, and suppressing a contact all go through their own canonical paths
 * (`crm_inbox_set_handled`, the single-send dialog, the one suppression
 * authority). An agent reads and explains here; the human acts.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const CRM_INBOX_SURFACE_NAME = "matrx-user/crm-inbox";

const groups: SurfaceValueGroup[] = [
  {
    key: "view",
    label: "What is on screen",
    sortOrder: 100,
    description:
      "Which slice of the inbox the person is looking at — scope, search, filters, and how much of it they can see.",
  },
  {
    key: "replies",
    label: "Replies",
    sortOrder: 200,
    description:
      "The inbound messages in view, each with the classifier's verdict and the evidence for it.",
  },
];

/**
 * One row of `visible_replies`. The verdict AND its evidence, because that pair
 * is what the row MEANS — a label with nothing behind it is what the inbox
 * exists to avoid showing a non-technical reader.
 */
export interface InboxReplySummary {
  id: string;
  party_name: string | null;
  employer_name: string | null;
  outreach_list_name: string | null;
  subject: string | null;
  classification: string | null;
  evidence: string | null;
  member_status: string | null;
  handled: boolean;
  occurred_at: string | null;
}

const values: SurfaceValue[] = [
  {
    name: "scope",
    label: "Whose replies",
    description:
      "Which scope is open: `mine` (replies to campaigns I own) or `orgs` (every organization I belong to). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "view",
    sortOrder: 100,
  },
  {
    name: "search",
    label: "Search term",
    description:
      "What the person typed into the search box, empty when they have not searched. Deep search additionally matches the full message body.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "view",
    sortOrder: 110,
  },
  {
    name: "active_filters",
    label: "Active filters",
    description:
      "The facet filters narrowing the list right now (classification, handled state, campaign), as name/values pairs. Empty object when nothing is filtered — which is why a small list can still be the whole inbox.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "view",
    sortOrder: 120,
  },
  {
    name: "total_replies",
    label: "Replies in this view",
    description:
      "Server-side total for the current scope, search and filters — what the visible rows are a slice OF. Always populated, and a real 0 when nobody has replied.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "view",
    sortOrder: 130,
  },
  {
    name: "visible_replies",
    label: "Visible replies",
    description:
      "The rows on screen: who replied, from which company and campaign, the subject, the classifier's verdict, the evidence sentence behind that verdict, whether it has been handled, and when it arrived. Empty array when the view is clear.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "replies",
    sortOrder: 200,
  },
];

export const crmInboxManifest: SurfaceManifest = {
  surfaceName: CRM_INBOX_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Read vocabulary verified against crm_inbox_list_scoped's own return shape; values are emitted by the canonical entity-list shell (EntityListPage `surface` binding), so they cannot drift from what is rendered. `visible_replies` is autoContext:false at ~4000 chars, so it arrives DEFERRED — verify it with retrieval allowed. Pending: WP5 to fill reply_reader's default agent (IC-7).",
  label: "Outreach inbox",
  urlPattern: "/crm/inbox",
  intro: `<surface_intro>
You are in the outreach inbox — every reply that came back from a campaign, in
one list. Each row is a real message from a real person, carrying the
classifier's verdict (interested, not interested, unsubscribe, bounced, out of
office) and the evidence sentence that verdict was based on.

WHAT YOU MAY DO HERE: explain what a reply is actually asking for, say whether
the classifier's verdict matches what the person wrote, summarize a filtered
view, and point out the replies that most need a human today.

WHAT YOU MAY NOT DO: reply, send, mark anything handled, or suppress anyone.
Every one of those is a human action through one governed path. A bounce,
unsubscribe or do-not-contact is decided by one authority server-side — never
suggest working around one.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
  agentRoles: [
    {
      name: "reply_reader",
      label: "Reply reader",
      description:
        "Reads the replies in view and says what each person is actually asking for, whether the classifier's verdict matches their words, and which ones need a human first. Never replies, sends, or changes a record.",
      kind: "single",
      // Declared by WP1 (IC-7): WP5 authors the agent and fills this default.
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export function createCrmInboxScope(values: {
  scope: string;
  search: string;
  active_filters: Record<string, unknown>;
  total_replies: number;
  visible_replies: InboxReplySummary[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
