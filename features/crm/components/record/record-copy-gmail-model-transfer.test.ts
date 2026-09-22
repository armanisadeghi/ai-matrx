import type { InteractionRow } from "@/features/crm/types";
import {
  buildInteractionCopyView,
  interactionAgentPayload,
  interactionsAgentPayload,
  type CrmRecordCopyParent,
} from "./record-copy";

const parent: CrmRecordCopyParent = {
  type: "party",
  id: "33333333-3333-4333-8333-333333333333",
  label: "Harbor Dental",
};

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

describe("CRM Activity model-transfer boundary", () => {
  it.each([
    interaction({
      direction: "inbound",
      provider: "google_workspace",
      subject: "Restricted subject",
      body: "Restricted Gmail body",
    }),
    interaction({
      direction: "inbound",
      attributes: {
        outreach_inbound: {
          label: "interested",
          evidence: "Restricted classification evidence",
        },
      },
      subject: "Historical restricted subject",
      body: "Historical restricted Gmail body",
    }),
  ])("refuses a Gmail-derived row payload", (row) => {
    expect(() => interactionAgentPayload(parent, row)).toThrow(
      "Gmail-derived activity",
    );
  });

  it("removes Gmail rows from a mixed Activity payload and keeps non-Gmail CRM activity", () => {
    const gmail = interaction({
      id: "44444444-4444-4444-8444-444444444444",
      direction: "inbound",
      provider: "google_workspace",
      subject: "Restricted subject",
      body: "Restricted Gmail body",
    });
    const crmNote = interaction({
      id: "55555555-5555-4555-8555-555555555555",
      subject: "Implementation note",
      body: "Known-safe CRM note",
    });

    const payload = interactionsAgentPayload(parent, [gmail, crmNote]);

    expect(payload.attributes).toMatchObject({ count: 1 });
    expect(JSON.stringify(payload)).toContain("Known-safe CRM note");
    expect(JSON.stringify(payload)).not.toContain("Restricted Gmail body");
    expect(JSON.stringify(payload)).not.toContain("Restricted subject");
  });

  it("keeps organization-authored Gmail delivery available to Activity AI", () => {
    const outbound = interaction({
      direction: "outbound",
      provider: "google_workspace",
      subject: "Intake workflow",
      body: "Known-safe organization-authored email",
    });

    const payload = interactionAgentPayload(parent, outbound);

    expect(JSON.stringify(payload)).toContain(
      "Known-safe organization-authored email",
    );
  });
});
