import type { InteractionRow } from "../types";
import { buildModelSafeInteractionContext } from "./buildCrmRecordContextData";

const BASE_INTERACTION = {
  address_id: null,
  approval_assist_id: null,
  approved_at: null,
  approved_by: null,
  assigned_to: null,
  attempt_number: null,
  attributes: {},
  body: null,
  channel_code: "note",
  channel_id: null,
  contact_point_id: null,
  created_at: "2026-09-22T08:00:00+00:00",
  created_by: null,
  custom_fields: {},
  deal_id: null,
  deleted_at: null,
  direction: "outbound",
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
  outreach_list_id: null,
  party_id: "33333333-3333-4333-8333-333333333333",
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

describe("CRM record model-transfer boundary", () => {
  it("removes canonically marked Gmail content and its derived last-touch time", () => {
    const dentalCall = interaction({
      id: "44444444-4444-4444-8444-444444444444",
      body: "Harbor Dental confirmed the intake review by phone.",
      channel_code: "phone",
      direction: "inbound",
      occurred_at: "2026-09-22T10:00:00+00:00",
    });
    const gmailReply = interaction({
      id: "55555555-5555-4555-8555-555555555555",
      body: "Restricted Gmail reply body",
      channel_code: "email",
      direction: "inbound",
      occurred_at: "2026-09-22T11:00:00+00:00",
      provider: "google_workspace",
      provider_interaction_id: "gmail-message-842",
    });

    const context = buildModelSafeInteractionContext([dentalCall, gmailReply]);

    expect(context.interactions).toEqual([dentalCall]);
    expect(context.lastTouchAt).toBe("2026-09-22T10:00:00+00:00");
    expect(JSON.stringify(context)).not.toContain(
      "Restricted Gmail reply body",
    );
  });

  it("also removes Gmail rows created before the canonical provider stamp", () => {
    const earlierGmailReply = interaction({
      id: "66666666-6666-4666-8666-666666666666",
      attributes: { outreach_inbound: { label: "interested" } },
      body: "Earlier restricted Gmail reply",
      channel_code: "email",
      direction: "inbound",
      occurred_at: "2026-09-21T16:00:00+00:00",
    });

    expect(buildModelSafeInteractionContext([earlierGmailReply])).toEqual({
      interactions: [],
      lastTouchAt: undefined,
    });
  });

  it("keeps organization-authored mail delivered through Google Workspace", () => {
    const outboundEmail = interaction({
      id: "77777777-7777-4777-8777-777777777777",
      body: "Harbor Dental intake walkthrough details.",
      channel_code: "email",
      direction: "outbound",
      occurred_at: "2026-09-22T12:00:00+00:00",
      provider: "google_workspace",
    });

    expect(buildModelSafeInteractionContext([outboundEmail])).toEqual({
      interactions: [outboundEmail],
      lastTouchAt: "2026-09-22T12:00:00+00:00",
    });
  });

  it("removes ambiguous inbound email while keeping inbound calls and known non-Gmail mail", () => {
    const ambiguousEmail = interaction({
      id: "88888888-8888-4888-8888-888888888888",
      channel_code: "email",
      direction: "inbound",
      provider: null,
      attributes: {},
      body: "Ambiguous inbound email body",
    });
    const inboundCall = interaction({
      id: "99999999-9999-4999-8999-999999999999",
      channel_code: "phone",
      direction: "inbound",
      provider: null,
      body: "Harbor Dental called about intake scheduling.",
    });
    const outlookEmail = interaction({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channel_code: "email",
      direction: "inbound",
      provider: "microsoft_365",
      body: "Known non-Gmail inbound email.",
    });

    const context = buildModelSafeInteractionContext([
      ambiguousEmail,
      inboundCall,
      outlookEmail,
    ]);

    expect(context.interactions).toEqual([inboundCall, outlookEmail]);
    expect(JSON.stringify(context)).not.toContain(
      "Ambiguous inbound email body",
    );
  });
});
