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

it("prevents fallback and replacement routes from crossing the decision boundary", () => {
  expect(hasCompatibleDecisionInteraction(chat, decision)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, chat)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, decision)).toBe(true);
  expect(hasCompatibleDecisionInteraction(chat, hiddenChat)).toBe(true);
});
