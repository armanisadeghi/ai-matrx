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
  it("keeps only opaque IDs for every interaction", () => {
    const dentalCall = interaction({
      id: "44444444-4444-4444-8444-444444444444",
      body: "Harbor Dental confirmed the intake review by phone.",
      channel_code: "phone",
      direction: "inbound",
      occurred_at: "2026-09-22T10:00:00+00:00",
    });
    const gmailReply = interaction({
      id: "55555555-5555-4555-8555-555555555555",
      attributes: {
        outreach_inbound: {
          label: "interested",
          evidence: "They asked for a walkthrough.",
        },
      },
      body: "Restricted Gmail reply body",
      channel_code: "email",
      direction: "inbound",
      provider: "google_workspace",
      subject: "Restricted Gmail subject",
    });

    const context = buildModelSafeInteractionContext([dentalCall, gmailReply]);

    expect(context).toEqual({
      interactions: [
        { id: "44444444-4444-4444-8444-444444444444" },
        { id: "55555555-5555-4555-8555-555555555555" },
      ],
      lastTouchAt: undefined,
    });
    expect(JSON.stringify(context)).not.toContain("intake review");
    expect(JSON.stringify(context)).not.toContain("Restricted Gmail");
    expect(JSON.stringify(context)).not.toContain("walkthrough");
  });

  it.each([
    { direction: "outbound", channel_code: "note" },
    { direction: "outbound", channel_code: "phone" },
  ] as const)(
    "strips content after Gmail provenance is relabeled as $direction/$channel_code",
    ({ direction, channel_code }) => {
      const relabeledGmail = interaction({
        id: "66666666-6666-4666-8666-666666666666",
        attributes: {},
        body: "Relabeled Gmail body",
        channel_code,
        direction,
        provider: "microsoft_365",
        subject: "Relabeled Gmail subject",
      });

      const context = buildModelSafeInteractionContext([relabeledGmail]);

      expect(context).toEqual({
        interactions: [{ id: "66666666-6666-4666-8666-666666666666" }],
        lastTouchAt: undefined,
      });
      expect(JSON.stringify(context)).not.toContain("Relabeled Gmail");
      expect(JSON.stringify(context)).not.toContain("microsoft_365");
    },
  );
});
