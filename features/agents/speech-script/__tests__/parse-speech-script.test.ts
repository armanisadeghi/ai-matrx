/**
 * A saved agent whose message holds a speech_script part must LOAD. The reader
 * refusing it dropped every message of the agent (the builder came back empty
 * over an intact row) — the same failure the decision_questions part had.
 */
import { parseAgentMessages } from "@/features/agents/redux/agent-definition/parse-messages-variables";

describe("agent definition reader", () => {
  it("keeps a message whose only part is a speech script", () => {
    const part = {
      type: "speech_script",
      __kind: "speech_script",
      turns: [{ speaker: "Maya", voice: "kore", text: "Hi {{guest_name}}.", direction: "warm" }],
    };
    const messages = parseAgentMessages([{ role: "user", content: [part] }]);
    expect(messages).toHaveLength(1);
    expect(messages[0].content[0]).toEqual(part);
  });
});
