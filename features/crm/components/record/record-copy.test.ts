import {
  buildInteractionCopyView,
  formatIdentityCopy,
  formatInteractionsCopy,
  formatNotesCopy,
  interactionsAgentPayload,
  notesAgentPayload,
  type CrmRecordCopyParent,
  type IdentityCopyView,
  type InteractionCopyView,
  type NoteCopyView,
} from "./record-copy";
import type { InteractionRow } from "@/features/crm/types";

const parent: CrmRecordCopyParent = {
  type: "party",
  id: "4c1efc60-cb0f-46bb-b6ad-8ef67f943c6e",
  label: "Jinesh Shah",
};

describe("CRM record copy projections", () => {
  test("identity human copy mirrors visible fields and preserves multiline bio", () => {
    const view: IdentityCopyView = {
      name: "Jinesh Shah",
      kind: "person",
      first_name: "Jinesh",
      last_name: "Shah",
      title: "Developer",
      headline: null,
      legal_name: null,
      domain: null,
      timezone: null,
      bio: "Line one\nLine two",
      lifecycle_stage: null,
      rating: null,
      roles: ["Engineer"],
      do_not_contact: false,
    };

    expect(formatIdentityCopy(view)).toContain("Roles: Engineer");
    expect(formatIdentityCopy(view)).toContain("Bio:\nLine one\nLine two");
  });

  test("activity overview omits bodies while the full variant keeps them", () => {
    const views: InteractionCopyView[] = [
      {
        subject: "System design",
        channel: "email",
        direction: "outbound",
        occurred_at: "2026-08-27T18:00:00Z",
        duration_minutes: null,
        body: "Paragraph one\n\nParagraph two",
        classification: null,
        classification_evidence: null,
        model_transfer_restricted: false,
      },
    ];

    expect(formatInteractionsCopy(parent, views)).toContain("Paragraph two");
    expect(formatInteractionsCopy(parent, views, false)).not.toContain(
      "Paragraph two",
    );
    const row = {
      address_id: null,
      approval_assist_id: null,
      approved_at: null,
      approved_by: null,
      assigned_to: null,
      attempt_number: null,
      attributes: {},
      body: views[0].body,
      channel_code: "email",
      channel_id: null,
      contact_point_id: null,
      created_at: views[0].occurred_at,
      created_by: null,
      custom_fields: {},
      deal_id: null,
      deleted_at: null,
      direction: "outbound",
      drafted_by_agent_id: null,
      drafted_by_label: null,
      drafted_by_run_id: null,
      duration_seconds: null,
      id: "77777777-7777-4777-8777-777777777777",
      in_reply_to: null,
      message_id: null,
      metadata: {},
      occurred_at: views[0].occurred_at,
      organization_id: "22222222-2222-4222-8222-222222222222",
      outcome_id: null,
      outreach_list_id: null,
      party_id: parent.id,
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
      subject: views[0].subject,
      thread_key: null,
      updated_at: views[0].occurred_at,
      updated_by: null,
      version: 1,
    } satisfies InteractionRow;
    expect(buildInteractionCopyView(row)).toEqual(views[0]);
    expect(interactionsAgentPayload(parent, [row]).attributes).toMatchObject({
      count: 1,
      includes_bodies: true,
    });
  });

  test("notes preserve rendered order and offer a body-free overview", () => {
    const views: NoteCopyView[] = [
      {
        author: "Arman",
        created_at: "2026-08-27T18:00:00Z",
        updated_at: "2026-08-27T18:00:00Z",
        body: "Newest note",
      },
      {
        author: "Jinesh",
        created_at: "2026-08-26T18:00:00Z",
        updated_at: "2026-08-26T18:00:00Z",
        body: "Older note",
      },
    ];

    expect(formatNotesCopy(parent, views).indexOf("Newest note")).toBeLessThan(
      formatNotesCopy(parent, views).indexOf("Older note"),
    );
    expect(notesAgentPayload(parent, views, false).data).toEqual([
      {
        author: "Arman",
        created_at: "2026-08-27T18:00:00Z",
        updated_at: "2026-08-27T18:00:00Z",
      },
      {
        author: "Jinesh",
        created_at: "2026-08-26T18:00:00Z",
        updated_at: "2026-08-26T18:00:00Z",
      },
    ]);
  });
});
