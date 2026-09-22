import type { InteractionRow } from "@/features/crm/types";
import { createCrmChaseboxScope } from "@/features/surfaces/manifests/crm-chasebox.manifest";
import { createCrmInboxScope } from "@/features/surfaces/manifests/crm-inbox.manifest";

const BASE_INTERACTION = {
  address_id: null,
  approval_assist_id: null,
  approved_at: null,
  approved_by: null,
  assigned_to: null,
  attempt_number: null,
  attributes: {},
  body: null,
  channel_code: "email",
  channel_id: null,
  contact_point_id: null,
  created_at: "2026-09-22T08:00:00+00:00",
  created_by: null,
  custom_fields: {},
  deal_id: null,
  deleted_at: null,
  direction: "inbound",
  drafted_by_agent_id: null,
  drafted_by_label: null,
  drafted_by_run_id: null,
  duration_seconds: null,
  id: "11111111-1111-4111-8111-111111111111",
  in_reply_to: null,
  message_id: null,
  metadata: {},
  occurred_at: "2026-09-22T08:00:00+00:00",
  organization_id: "22222222-2222-4222-8222-222222222222",
  outcome_id: null,
  outreach_list_id: "33333333-3333-4333-8333-333333333333",
  party_id: "44444444-4444-4444-8444-444444444444",
  performed_by: null,
  program_key: null,
  provider: null,
  provider_account_id: null,
  provider_interaction_id: null,
  provider_recording_id: null,
  provider_status: null,
  provider_status_at: null,
  provider_status_sequence: null,
  recording_channels: null,
  recording_custody_at: null,
  recording_duration_seconds: null,
  recording_file_id: null,
  recording_owner_id: null,
  recording_source: null,
  recording_started_at: null,
  recording_status: null,
  recording_status_at: null,
  recording_track: null,
  recording_url: null,
  scheduled_at: null,
  status: "completed",
  subject: null,
  thread_key: null,
  updated_at: "2026-09-22T08:00:00+00:00",
  updated_by: null,
  version: 1,
} satisfies InteractionRow;

function interaction(overrides: Partial<InteractionRow>): InteractionRow {
  return { ...BASE_INTERACTION, ...overrides };
}

const REPLY = {
  intent: "Answer their question",
  grounded_on: ["They asked for a walkthrough [inbound_message]"],
  answering_label: "interested",
  thread_message_count: 2,
  replying_to_interaction_id: BASE_INTERACTION.id,
};

function replyScope(sourceInteractions: InteractionRow[]) {
  return createCrmChaseboxScope({
    active_queue: "pending_drafts",
    queue_counts: { pending_drafts: 1 },
    total_items: 1,
    visible_items: [],
    draft_subject: "Re: intake workflow",
    draft_body: "Here is the requested workflow.",
    draft_personalization: [],
    draft_reply: REPLY,
    draft_reply_source_interactions: sourceInteractions,
    draft_approved: false,
  });
}

describe("Gmail model-transfer surface boundaries", () => {
  it("keeps inbox view state but removes every Gmail reply row", () => {
    const scope = createCrmInboxScope({
      scope: "mine",
      search: "intake review",
      active_filters: { classification: ["interested"] },
      total_replies: 1,
      visible_replies: [
        {
          id: BASE_INTERACTION.id,
          party_name: "Harbor Dental",
          employer_name: null,
          outreach_list_name: "Practice onboarding",
          subject: "Re: intake review",
          classification: "interested",
          evidence: "The sender asked for a walkthrough.",
          member_status: "replied",
          handled: false,
          occurred_at: "2026-09-22T11:00:00+00:00",
        },
      ],
    });

    expect(scope).toMatchObject({
      scope: "mine",
      search: "intake review",
      total_replies: 1,
      visible_replies: [],
    });
    expect(JSON.stringify(scope)).not.toContain("Re: intake review");
  });

  it.each([
    interaction({ provider: "google_workspace" }),
    interaction({ provider: "gmail" }),
    interaction({ provider: " google_workspace " }),
    interaction({ provider: "unverified_mail_provider" }),
    interaction({ provider: null, attributes: {} }),
    interaction({
      provider: "microsoft_365",
      attributes: { outreach_inbound: { label: "interested" } },
    }),
  ])("refuses restricted or ambiguous raw reply-thread rows", (source) => {
    const scope = replyScope([source]);

    expect(scope).not.toHaveProperty("draft_subject");
    expect(scope).not.toHaveProperty("draft_body");
    expect(scope).not.toHaveProperty("draft_reply");
    expect(JSON.stringify(scope)).not.toContain("requested workflow");
  });

  it("refuses when an earlier raw thread row is Gmail-derived", () => {
    const scope = replyScope([
      interaction({
        id: "55555555-5555-4555-8555-555555555555",
        provider: "google_workspace",
      }),
      interaction({ provider: "microsoft_365" }),
    ]);

    expect(scope).not.toHaveProperty("draft_body");
  });

  it("keeps a reply draft whose canonical thread rows name a non-Gmail provider", () => {
    const scope = replyScope([interaction({ provider: "microsoft_365" })]);

    expect(scope).toMatchObject({
      draft_subject: "Re: intake workflow",
      draft_body: "Here is the requested workflow.",
      draft_reply: REPLY,
    });
    expect(scope).not.toHaveProperty("draft_reply_source_interactions");
  });

  it("refuses a reply draft when the authoritative thread read is unavailable", () => {
    const scope = replyScope([]);

    expect(scope).not.toHaveProperty("draft_body");
  });

  it("keeps a non-reply CRM draft available for review", () => {
    const scope = createCrmChaseboxScope({
      active_queue: "pending_drafts",
      queue_counts: { pending_drafts: 1 },
      total_items: 1,
      visible_items: [],
      draft_subject: "Harbor Dental intake workflow",
      draft_body: "Would a workflow review be useful?",
      draft_personalization: [],
      draft_approved: false,
    });

    expect(scope).toMatchObject({
      draft_subject: "Harbor Dental intake workflow",
      draft_body: "Would a workflow review be useful?",
      draft_approved: false,
    });
  });
});
