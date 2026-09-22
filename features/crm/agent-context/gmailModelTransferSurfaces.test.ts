import { createCrmChaseboxScope } from "@/features/surfaces/manifests/crm-chasebox.manifest";
import { createCrmInboxScope } from "@/features/surfaces/manifests/crm-inbox.manifest";

const REPLY = {
  intent: "Answer their question",
  grounded_on: ["They asked for a walkthrough [inbound_message]"],
  answering_label: "interested",
  thread_message_count: 2,
};

function replyScope() {
  return createCrmChaseboxScope({
    active_queue: "pending_drafts",
    queue_counts: { pending_drafts: 1 },
    total_items: 1,
    visible_items: [],
    draft_subject: "Re: intake workflow",
    draft_body: "Here is the requested workflow.",
    draft_personalization: [
      {
        name: "opening",
        text: "You asked about the intake workflow.",
        fact: "Historical reply text",
        source_url: null,
      },
    ],
    draft_reply: REPLY,
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

  it("removes every reply draft field from model scope", () => {
    const scope = replyScope();

    expect(scope).not.toHaveProperty("draft_subject");
    expect(scope).not.toHaveProperty("draft_body");
    expect(scope).not.toHaveProperty("draft_personalization");
    expect(scope).not.toHaveProperty("draft_reply");
    expect(scope).not.toHaveProperty("draft_approved");
    expect(JSON.stringify(scope)).not.toContain("requested workflow");
    expect(JSON.stringify(scope)).not.toContain("Historical reply text");
  });

  it("keeps unrelated Chasebox queues while a reply draft is open", () => {
    const scope = createCrmChaseboxScope({
      active_queue: "stalled_sequences",
      queue_counts: { stalled_sequences: 1 },
      total_items: 1,
      visible_items: [
        {
          id: "22222222-2222-4222-8222-222222222222",
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
      draft_subject: "Restricted reply",
      draft_body: "Restricted reply body",
      draft_reply: REPLY,
    });

    expect(scope.visible_items).toEqual([
      expect.objectContaining({ queue: "stalled_sequences" }),
    ]);
  });

  it("removes every draft field when the client-writable reply marker is absent", () => {
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

    expect(scope).not.toHaveProperty("draft_subject");
    expect(scope).not.toHaveProperty("draft_body");
    expect(scope).not.toHaveProperty("draft_personalization");
    expect(scope).not.toHaveProperty("draft_reply");
    expect(scope).not.toHaveProperty("draft_approved");
    expect(JSON.stringify(scope)).not.toContain("workflow review");
  });
});
