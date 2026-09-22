import { readReplyProvenance } from "@/features/crm/inbox/attributes";
import { createCrmChaseboxScope } from "@/features/surfaces/manifests/crm-chasebox.manifest";
import { createCrmInboxScope } from "@/features/surfaces/manifests/crm-inbox.manifest";

describe("Gmail model-transfer surface boundaries", () => {
  it("treats a partially malformed provider receipt as ambiguous", () => {
    const reply = readReplyProvenance({
      outreach_single_send: {
        reply: {
          model_transfer_provenance: "full_thread_checked_v1",
          source_providers: ["microsoft_365", null],
        },
      },
    });

    expect(reply?.sourceProviders).toEqual([]);
  });

  it("keeps inbox view state but removes every Gmail reply row", () => {
    const scope = createCrmInboxScope({
      scope: "mine",
      search: "intake review",
      active_filters: { classification: ["interested"] },
      total_replies: 1,
      visible_replies: [
        {
          id: "11111111-1111-4111-8111-111111111111",
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

  it("removes fresh-reply rows and an open Gmail-derived reply draft", () => {
    const scope = createCrmChaseboxScope({
      active_queue: "fresh_replies",
      queue_counts: { fresh_replies: 1, stalled_sequences: 1 },
      total_items: 2,
      visible_items: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          queue: "fresh_replies",
          party_name: "Harbor Dental",
          outreach_list_name: "Practice onboarding",
          step: 2,
          problem_code: "reply_waiting",
          problem_message: "A Gmail reply is waiting.",
          problem_fix: "Review the reply.",
          occurred_at: "2026-09-22T11:00:00+00:00",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          queue: "stalled_sequences",
          party_name: "Harbor Dental",
          outreach_list_name: "Practice onboarding",
          step: 3,
          problem_code: "mailbox_paused",
          problem_message: "The mailbox is paused.",
          problem_fix: "Resume the mailbox.",
          occurred_at: "2026-09-22T12:00:00+00:00",
        },
      ],
      draft_subject: "Re: intake review",
      draft_body: "Here is the requested walkthrough.",
      draft_personalization: [],
      draft_reply: {
        intent: "Answer their question",
        grounded_on: ["They asked for a walkthrough [inbound_message]"],
        answering_label: "interested",
        thread_message_count: 2,
        model_transfer_provenance: null,
        source_providers: [],
      },
      draft_approved: false,
    });

    expect(scope.visible_items).toEqual([
      expect.objectContaining({ queue: "stalled_sequences" }),
    ]);
    expect(scope).not.toHaveProperty("draft_subject");
    expect(scope).not.toHaveProperty("draft_body");
    expect(scope).not.toHaveProperty("draft_reply");
    expect(JSON.stringify(scope)).not.toContain("requested walkthrough");
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

  it("keeps a reply draft with a server-issued non-Gmail transfer receipt", () => {
    const scope = createCrmChaseboxScope({
      active_queue: "pending_drafts",
      queue_counts: { pending_drafts: 1 },
      total_items: 1,
      visible_items: [],
      draft_subject: "Re: intake workflow",
      draft_body: "Here is the requested workflow.",
      draft_personalization: [],
      draft_reply: {
        intent: "Answer their question",
        grounded_on: ["They asked in a CRM note [record]"],
        answering_label: "interested",
        thread_message_count: 2,
        model_transfer_provenance: "full_thread_checked_v1",
        source_providers: ["microsoft_365"],
      },
      draft_approved: false,
    });

    expect(scope).toMatchObject({
      draft_subject: "Re: intake workflow",
      draft_body: "Here is the requested workflow.",
      draft_reply: {
        model_transfer_provenance: "full_thread_checked_v1",
        source_providers: ["microsoft_365"],
      },
    });
  });

  it.each<{ sourceProviders: string[] }>([
    { sourceProviders: ["google_workspace"] },
    { sourceProviders: ["unknown"] },
    { sourceProviders: [] },
  ])(
    "refuses a reply draft whose full-thread providers are restricted or ambiguous",
    ({ sourceProviders }) => {
      const scope = createCrmChaseboxScope({
        active_queue: "pending_drafts",
        queue_counts: { pending_drafts: 1 },
        total_items: 1,
        visible_items: [],
        draft_subject: "Restricted thread subject",
        draft_body: "Restricted thread body",
        draft_reply: {
          intent: "Answer their question",
          grounded_on: ["A restricted source [inbound_message]"],
          answering_label: "interested",
          thread_message_count: 3,
          model_transfer_provenance: "full_thread_checked_v1",
          source_providers: sourceProviders,
        },
      });

      expect(JSON.stringify(scope)).not.toContain("Restricted thread");
      expect(scope).not.toHaveProperty("draft_reply");
    },
  );
});
