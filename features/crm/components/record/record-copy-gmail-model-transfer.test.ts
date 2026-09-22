import type { InteractionRow } from "@/features/crm/types";
import {
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
      channel_code: "email",
      direction: "inbound",
      provider: "google_workspace",
      subject: "Restricted subject",
      body: "Restricted Gmail body",
    }),
    interaction({
      channel_code: "note",
      direction: "outbound",
      provider: "microsoft_365",
      attributes: {},
      subject: "Relabeled Gmail subject",
      body: "Relabeled Gmail body",
    }),
  ])("reduces a single Activity payload to its opaque ID", (row) => {
    const payload = interactionAgentPayload(parent, row);

    expect(payload.data).toEqual({ id: row.id });
    expect(payload.attributes).toEqual({
      record_id: parent.id,
      interaction_id: row.id,
    });
    expect(JSON.stringify(payload)).not.toContain(row.subject);
    expect(JSON.stringify(payload)).not.toContain(row.body);
    expect(JSON.stringify(payload)).not.toContain(row.provider);
  });

  it("strips all interaction text from a mixed Activity payload while retaining IDs and count", () => {
    const relabeledGmail = interaction({
      id: "44444444-4444-4444-8444-444444444444",
      channel_code: "phone",
      direction: "outbound",
      provider: "microsoft_365",
      attributes: {},
      subject: "Relabeled Gmail subject",
      body: "Relabeled Gmail body",
    });
    const crmNote = interaction({
      id: "55555555-5555-4555-8555-555555555555",
      subject: "Implementation note",
      body: "Known CRM note content",
    });

    const payload = interactionsAgentPayload(parent, [relabeledGmail, crmNote]);

    expect(payload.data).toEqual([
      { id: relabeledGmail.id },
      { id: crmNote.id },
    ]);
    expect(payload.attributes).toMatchObject({
      count: 2,
      includes_bodies: false,
    });
    expect(JSON.stringify(payload)).not.toContain("Relabeled Gmail");
    expect(JSON.stringify(payload)).not.toContain("Known CRM note content");
    expect(JSON.stringify(payload)).not.toContain("microsoft_365");
  });
});
