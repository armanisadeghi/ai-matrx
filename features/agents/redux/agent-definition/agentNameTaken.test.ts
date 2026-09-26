import { agentNameTaken, agentNameTakenError } from "./agentNameTaken";

// The exact refusal production raised in the V24-TAILS rehearsal (rolled back).
const REFUSAL = {
  code: "23505",
  hint: "agent_name_taken",
  details: "Agent Structure Builder (2)",
  message: 'An agent named "Agent Structure Builder" already exists in Matrx System. Name this one "Agent Structure Builder (2)".',
};

describe("a duplicate agent name is refused in words, with the offer", () => {
  it("reads the sentence and the free name from the database's refusal", () => {
    expect(agentNameTaken(REFUSAL)).toEqual({ sentence: REFUSAL.message, suggestion: "Agent Structure Builder (2)" });
  });
  it("the Error a thunk throws carries the sentence alone — no code, hint or detail", () => {
    expect(agentNameTakenError(REFUSAL)?.message).toBe(REFUSAL.message);
  });
  it("a serialized rejection (message only) still yields the offer", () => {
    expect(agentNameTaken({ message: REFUSAL.message })?.suggestion).toBe("Agent Structure Builder (2)");
  });
  it("any other error is not this refusal", () => {
    expect(agentNameTaken({ code: "23505", message: "duplicate key value violates unique constraint" })).toBeNull();
    expect(agentNameTaken(null)).toBeNull();
  });
});
