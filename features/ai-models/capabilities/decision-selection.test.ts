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

it("offers an agent author the three agent contracts and nothing else", () => {
  // The agent builder's picker: a message may be a conversational turn, a
  // Questions part answered by a decision holder, or a provider-managed
  // research agent (Arman, 2026-09-26) — but an embedding/extraction/realtime
  // model still is not.
  const research = otherContracts.find((m) => m.interaction === "agent")!;
  expect(
    modelsForSelectionPurpose(
      [chat, decision, hiddenChat, ...otherContracts],
      "agent",
    ),
  ).toEqual([chat, decision, hiddenChat, research]);
});

it("prevents fallback and replacement routes from crossing the decision boundary", () => {
  expect(hasCompatibleDecisionInteraction(chat, decision)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, chat)).toBe(false);
  expect(hasCompatibleDecisionInteraction(decision, decision)).toBe(true);
  expect(hasCompatibleDecisionInteraction(chat, hiddenChat)).toBe(true);
});

it("never offers a speech-to-text model as a chat or agent model", () => {
  // 2026-09-27: Whisper sat in the chat set; an agent's instructions are text, and
  // an audio-only model cannot take them. A live (realtime) session is exempt.
  const stt = { id: "whisper", interaction: "single" as const, input: ["audio"] };
  const sttTurn = { id: "scribe", interaction: "turn" as const, input: ["audio"] };
  const withText = { id: "chat", interaction: "turn" as const, input: ["text"] };
  expect(modelsForSelectionPurpose([stt, sttTurn, withText])).toEqual([withText]);
  expect(modelsForSelectionPurpose([stt, sttTurn, withText], "agent")).toEqual([
    withText,
  ]);
});
