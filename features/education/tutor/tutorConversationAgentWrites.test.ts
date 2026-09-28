import {
  parseTutorConversationArchive,
  parseTutorConversationDelete,
  parseTutorConversationRename,
} from "./tutorConversationAgentWrites";

const conversations = [{ id: "tutor-1", title: "Algebra", status: "active" }];

describe("tutor conversation agent writes", () => {
  it("only accepts loaded tutor conversation ids before approval", () => {
    expect(
      parseTutorConversationRename(
        { conversation_id: "tutor-1", title: "Linear algebra" },
        conversations,
      ),
    ).toEqual({ conversation: conversations[0], title: "Linear algebra" });
    expect(() =>
      parseTutorConversationArchive(
        { conversation_id: "other", archived: true },
        conversations,
      ),
    ).toThrow("owned, loaded AI Tutor conversation");
    expect(() =>
      parseTutorConversationDelete({ conversation_id: "other" }, conversations),
    ).toThrow("owned, loaded AI Tutor conversation");
  });

  it("requires an explicit archive state", () => {
    expect(
      parseTutorConversationArchive(
        { conversation_id: "tutor-1", archived: true },
        conversations,
      ),
    ).toEqual({ conversation: conversations[0], archived: true });
    expect(() =>
      parseTutorConversationArchive(
        { conversation_id: "tutor-1" },
        conversations,
      ),
    ).toThrow("must be true to archive or false to restore");
  });
});
