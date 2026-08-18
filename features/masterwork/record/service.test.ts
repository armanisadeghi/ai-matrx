import { associateInterviewWhenPersisted } from "./service";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({ waitForConversationPersisted: jest.fn() }),
);

const mockedWaitForConversationPersisted = jest.mocked(
  waitForConversationPersisted,
);

describe("associateInterviewWhenPersisted", () => {
  beforeEach(() => {
    mockedWaitForConversationPersisted.mockReset();
  });

  it("does not watch an untouched client-minted interview draft", () => {
    associateInterviewWhenPersisted({
      rulebookId: "rulebook-1",
      conversationId: "conversation-1",
      rulebookName: "Example Rulebook",
      turnStarted: false,
    });

    expect(mockedWaitForConversationPersisted).not.toHaveBeenCalled();
  });
});
