/**
 * THE ORACLE TAP LANDS A REVIEWABLE DRAFT, WITH ITS PROVENANCE.
 *
 * The second half of census row 11: it is not enough that a menu item exists —
 * what it writes has to be a draft the Expert can review AND trace. Before
 * 2026-09-12 the append recorded the conversation but not the message, so a
 * draft in "Waiting on you" could not point back at the turn it came from.
 *
 * Only the Rulebook store underneath the canonical `saveRules` CAS is faked;
 * the rule the Expert will see is built by the real `appendDraftRuleFromMessage`.
 */

const getRulebook = jest.fn();
const saveRules = jest.fn();

jest.mock("../../service", () => ({
  getRulebook: (...args: unknown[]) => getRulebook(...args),
  saveRules: (...args: unknown[]) => saveRules(...args),
}));

// The picker's own queries are the other half of the module and never run here.
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "u1",
  getUserId: () => "u1",
}));
jest.mock("@/lib/list-scope", () => ({ scopeToOwner: async () => true }));

import {
  appendDraftRuleFromMessage,
  precedingQuestion,
} from "../service";
import { ruleState } from "../../types";
import type { Rulebook } from "../../types";

const rulebook: Rulebook = {
  id: "rb1",
  name: "Fix — oracle tap",
  description: "",
  sections: { G: { label: "General" } },
  rules: [],
  version: 3,
} as unknown as Rulebook;

beforeEach(() => {
  getRulebook.mockReset().mockResolvedValue(rulebook);
  saveRules
    .mockReset()
    .mockImplementation(async ({ rules }: { rules: unknown[] }) => ({
      ...rulebook,
      rules,
      version: 4,
    }));
});

describe("the Oracle tap's write", () => {
  it("lands a DRAFT rule carrying the source message id", async () => {
    const { rule } = await appendDraftRuleFromMessage({
      rulebookId: "rb1",
      content: "Refund it anyway when the customer has been with us a year.",
      conversationId: "conv-1",
      messageId: "msg-77",
      question: "What do I do if a customer wants a refund past 30 days?",
    });

    expect(ruleState(rule)).toBe("draft");
    expect(rule.source_ref?.approach).toBe("oracle_tap");
    expect(rule.source_ref?.message_id).toBe("msg-77");
    expect(rule.source_ref?.conversation_id).toBe("conv-1");
    // The answer is kept verbatim — there is no distiller, so nothing is
    // paraphrased into the Expert's mouth.
    expect(rule.quote).toContain("Refund it anyway");
    // And the question that made it worth keeping survives.
    expect(rule.name).toContain("refund");
    expect(rule.rationale).toContain("past 30 days");

    // It went through the canonical CAS with the version it read.
    expect(saveRules).toHaveBeenCalledWith(
      expect.objectContaining({ rulebookId: "rb1", expectedVersion: 3 }),
    );
  });

  it("still works — and stays a draft — with no question to attach", async () => {
    const { rule } = await appendDraftRuleFromMessage({
      rulebookId: "rb1",
      content: "Always photograph the serial plate before pickup.",
      conversationId: null,
      messageId: "msg-78",
    });
    expect(ruleState(rule)).toBe("draft");
    expect(rule.source_ref?.message_id).toBe("msg-78");
    expect(rule.rationale).toBeUndefined();
  });
});

describe("precedingQuestion", () => {
  const thread = [
    { id: "m1", role: "user", content: "First question?" },
    { id: "m2", role: "assistant", content: "First answer." },
    { id: "m3", role: "user", content: "Second question?" },
    { id: "m4", role: "assistant", content: "Second answer." },
  ];

  it("finds the user turn the answer replied to", () => {
    expect(precedingQuestion(thread, "m4")).toBe("Second question?");
    expect(precedingQuestion(thread, "m2")).toBe("First question?");
  });

  it("returns null for the first message, an unknown id, or no id", () => {
    expect(precedingQuestion(thread, "m1")).toBeNull();
    expect(precedingQuestion(thread, "nope")).toBeNull();
    expect(precedingQuestion(thread, null)).toBeNull();
  });
});
