import {
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
      },
    ];

    expect(formatInteractionsCopy(parent, views)).toContain("Paragraph two");
    expect(formatInteractionsCopy(parent, views, false)).not.toContain(
      "Paragraph two",
    );
    expect(interactionsAgentPayload(parent, views).attributes).toMatchObject({
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
