import {
  hasCompatibleDecisionInteraction,
  modelsForSelectionPurpose,
} from "./types";

const chat = { id: "chat", interaction: "turn" as const };
const decision = { id: "jev", interaction: "decision" as const };
const hiddenChat = { id: "admin-chat", interaction: "single" as const };
const otherContracts = (
  ["extraction", "embedding", "realtime", "agent"] as const
).map((interaction) => ({ id: interaction, interaction }));

it("keeps a chat picker on the chat contract when Admin mode expands the catalog", () => {
  expect(modelsForSelectionPurpose([chat])).toEqual([chat]);
  expect(
    modelsForSelectionPurpose([chat, decision, hiddenChat, ...otherContracts]),
  ).toEqual([chat, hiddenChat]);
});

it("admits decision models only for an explicit decision or catalog editing purpose", () => {
  expect(modelsForSelectionPurpose([chat, decision], "decision")).toEqual([
    decision,
  ]);
  expect(modelsForSelectionPurpose([chat, decision], "admin")).toEqual([
    chat,
    decision,
  ]);
});

it("offers an agent author BOTH contracts and nothing else", () => {
  // The agent builder's picker: a message may be a conversational turn or a
  // Questions part answered by a decision holder, so both are selectable —
  // but an embedding/extraction/realtime/background model still is not.
  expect(
    modelsForSelectionPurpose(
      [chat, decision, hiddenChat, ...otherContracts],
      "agent",
    ),
  ).toEqual([chat, decision, hiddenChat]);
});

it("prevents fallback and replacement routes from crossing the decision boundary", () => {
  expect(hasCompatibleDecisionInteraction(chat, decision)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, chat)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, decision)).toBe(true);
  expect(hasCompatibleDecisionInteraction(chat, hiddenChat)).toBe(true);
});
