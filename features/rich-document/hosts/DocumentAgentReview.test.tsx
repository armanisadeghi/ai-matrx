/**
 * Review-and-apply on a rendered document: Apply saves ONLY the changed
 * blocks through the source's save adapter; Discard writes nothing; a
 * proposal that would rewrite a protected island is refused before Apply.
 */
jest.mock("@ai-matrx/diff/react", () => ({
  DiffViewer: (p: { original: string; modified: string }) => (
    <pre data-testid="diff">{`${p.original}\n=>\n${p.modified}`}</pre>
  ),
}));
let proposalToOffer = "";
jest.mock("@/components/official/ProTextareaAgentPanel", () => ({
  ProTextareaAgentPanel: (p: { onApplySourceText: (t: string) => void }) => (
    <button onClick={() => p.onApplySourceText(proposalToOffer)}>use-result</button>
  ),
}));
jest.mock("@/components/official/ProTextAgentActionPopoverBody", () => ({
  ProTextAgentActionPopoverBody: () => null,
}));
jest.mock("@/components/official/useProTextareaAgentAction", () => ({
  useProTextareaAgentAction: () => ({
    phase: "idle", isBusy: false, isThinking: false, result: "", error: null,
    run: jest.fn(), reset: jest.fn(),
  }),
}));
jest.mock("@/features/surfaces/hooks/useSurfaceConfig", () => ({
  useSurfaceAgentRoles: () => ({ roles: {} }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DocumentAgentReview } from "./DocumentAgentReview";
import { chatContext } from "../test-utils/chatContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED = "# Policy\n\nGold gets 60 days.\n\n```ts\nconst w = 60;\n```\n\nSilver gets 30 days.\n";

async function mount(proposal: string) {
  proposalToOffer = proposal;
  const edit = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  const base = chatContext("assistant");
  const ctx = {
    ...base,
    content: SAVED,
    extensions: base.extensions && base.extensions.type === "chat-message"
      ? { ...base.extensions, messageContent: SAVED }
      : base.extensions,
    sourceAdapter: { ...base.sourceAdapter, edit },
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DocumentAgentReview actionId="help" ctx={ctx} onClose={onClose} />);
  });
  await act(async () => {
    (Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "use-result") as HTMLButtonElement).click();
  });
  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;
  return { edit, onClose, button, cleanup: () => act(async () => root.unmount()) };
}

it("Apply saves the splice: only the changed block differs, the rest is byte-identical", async () => {
  const proposed = SAVED.replace("Gold gets 60 days.", "Gold customers get sixty days.");
  const m = await mount(proposed);
  await act(async () => m.button("Apply").click());
  expect(m.edit).toHaveBeenCalledTimes(1);
  expect(m.edit.mock.calls[0][0].newContent).toBe(proposed);
  expect(m.onClose).toHaveBeenCalled();
  await m.cleanup();
});

it("Discard writes nothing", async () => {
  const m = await mount(SAVED.replace("Silver", "Bronze"));
  await act(async () => m.button("Discard").click());
  expect(m.edit).not.toHaveBeenCalled();
  expect(m.onClose).toHaveBeenCalled();
  await m.cleanup();
});

it("a proposal that rewrites a protected code block is refused before Apply", async () => {
  const m = await mount("Everything rewritten, code block gone.\n");
  expect(m.button("Apply").disabled).toBe(true);
  expect(document.body.textContent).toMatch(/protected|island/i);
  expect(m.edit).not.toHaveBeenCalled();
  await m.cleanup();
});
