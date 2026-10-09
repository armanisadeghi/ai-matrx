// Lane F6b: a build is ONE conversation — the fix round and every change continue the first run's.
import { buildConversationId, fixHostTurn } from "./build-session";

describe("one conversation per build", () => {
  it("is the first run's conversation, whatever came after", () => {
    expect(buildConversationId([])).toBeNull();
    expect(buildConversationId([{ conversation_id: null }])).toBeNull();
    expect(buildConversationId([{ conversation_id: null }, { conversation_id: "c-1" }, { conversation_id: "c-2" }])).toBe("c-1");
  });
  it("a fix round is a host turn that names the problem in her words and never pretends she typed it", () => {
    const turn = fixHostTurn('Use <RecordField> for "created_date"');
    expect(turn.text).toContain("the created date field");
    expect(turn.text).toContain("last_check");
    expect(turn.reason.length).toBeLessThanOrEqual(80);
    expect(fixHostTurn(null).text).not.toContain("()");
  });
});
