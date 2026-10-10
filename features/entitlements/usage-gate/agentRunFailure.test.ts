import { agentRunFailureWords, APPROVAL_BLOCKED_MESSAGE, classifyAgentRunFailure } from "./agentRunFailure";
import { USAGE_BLOCKED_MESSAGE } from "./usageGate";

const run = (message: string, detail?: string) => Object.assign(new Error(message), { detail });
const WRONG = "That did not come out right.";

describe("a failed agent run says the real reason", () => {
  it("a usage cap is told as the usage limit, not as a bad answer", () => {
    expect(agentRunFailureWords(run("The agent run failed", "usage_limit_reached"), WRONG)).toBe(USAGE_BLOCKED_MESSAGE);
    expect(agentRunFailureWords(run("You've reached your monthly AI limit.", "usage_limit_reached · 402"), WRONG)).toBe("You've reached your monthly AI limit.");
  });
  it("an approval gate is told as needing approval", () => {
    expect(agentRunFailureWords(run("The agent run failed", "agent_not_approved"), WRONG)).toBe(APPROVAL_BLOCKED_MESSAGE);
  });
  it("any other failure keeps the surface's own sentence", () => {
    expect(agentRunFailureWords(run("boom", "stream_error"), WRONG)).toBe(WRONG);
    expect(classifyAgentRunFailure(null)).toBe("other");
  });
});
