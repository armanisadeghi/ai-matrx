/**
 * GUARD: Enter sends exactly when the Send button would show — ONE rule.
 *
 * THE FINDING (2026-09-28, /chat/new): the Send button hid on an empty draft,
 * but Enter ignored that and dispatched a send. A draft typed before the
 * composer hydrated was lost, Enter sent a turn with no message, the provider
 * refused it ("messages: at least one message is required") and a failed turn
 * stayed in the conversation. Both now ask `selectComposerHasSomethingToSend`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RootState } from "@/lib/redux/store";
import { selectComposerHasSomethingToSend } from "../aggregate.selectors";

const C = "c-kiln";

function state(over: {
  text?: string;
  resources?: Record<string, { blockType: string }>;
  submittedIds?: string[];
  definitions?: unknown[];
  status?: string;
}): RootState {
  return {
    instanceUserInput: { byConversationId: { [C]: { text: over.text ?? "" } } },
    instanceResources: {
      byConversationId: { [C]: over.resources ?? {} },
      submittedIds: { [C]: over.submittedIds ?? [] },
    },
    instanceVariableValues: { byConversationId: { [C]: { definitions: over.definitions ?? [] } } },
    messages: { byConversationId: { [C]: { orderedIds: [] } } },
    conversations: { byConversationId: { [C]: { status: over.status ?? "ready" } } },
  } as unknown as RootState;
}

const has = (s: RootState) => selectComposerHasSomethingToSend(C)(s);

it("an empty draft has nothing to send", () => {
  expect(has(state({}))).toBe(false);
});

it("text, an unsent attachment, a variables form or a live run each count", () => {
  expect(has(state({ text: "Load 12 came out clean" }))).toBe(true);
  expect(has(state({ resources: { r1: { blockType: "image" } } }))).toBe(true);
  expect(has(state({ definitions: [{ name: "kiln" }] }))).toBe(true);
  expect(has(state({ status: "streaming" }))).toBe(true);
});

it("the composer's Enter and its Send button both ask this one rule", () => {
  const dir = join(__dirname, "..", "..", "..", "..", "components", "inputs", "smart-input");
  const textarea = readFileSync(join(dir, "AgentTextarea.tsx"), "utf8");
  const buttons = readFileSync(join(dir, "InputActionButtons.tsx"), "utf8");
  expect(textarea).toMatch(/selectComposerHasSomethingToSend\(conversationId\)/);
  expect(textarea).toMatch(/if \(!hasSomethingToSend\) return;/);
  expect(buttons).toMatch(/selectComposerHasSomethingToSend\(conversationId\)/);
});
