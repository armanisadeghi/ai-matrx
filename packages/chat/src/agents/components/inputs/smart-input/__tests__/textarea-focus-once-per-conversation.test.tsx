/**
 * The composer takes the caret once per conversation. Effects re-run without
 * a remount when a board tile wakes from sleep (React `<Activity>`), and the
 * autofocus effect used to fire again on every wake — pulling the caret out of
 * whatever field the person was typing in, so their keystrokes landed in the
 * woken chat's draft.
 */
import React, { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../../../store/hooks", () => ({
  useAppDispatch: () => () => undefined,
  // Every selector reads as empty: no draft, not executing, nothing to send.
  useAppSelector: () => "",
}));
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../../store/hooks"));
jest.mock("@host/components/ui/file-upload/useClipboardPaste", () => ({ useClipboardPaste: () => undefined }));
jest.mock("../../resources/usePasteImageResource", () => ({ usePasteImageResource: () => ({ handlePaste: () => false }) }));
jest.mock("../../../../hooks/useInstanceInputUndoRedo", () => ({ useInstanceInputUndoRedo: () => undefined }));
jest.mock("../ComposerDraftNotice", () => ({ ComposerDraftNotice: () => null }));
jest.mock("@host/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));

import { AgentTextarea } from "../AgentTextarea";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Render, then let the effects' timers run (effects flush when the first act ends). */
async function show(ui: React.ReactNode) {
  await act(async () => root.render(ui));
  await act(async () => {
    await tick(150);
  });
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("a wake does not take the caret from the field the person is typing in", async () => {
  const elsewhere = document.createElement("input");
  document.body.appendChild(elsewhere);
  const ui = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <AgentTextarea conversationId="c-vendor-review" />
    </Activity>
  );
  await show(ui("visible"));
  expect(document.activeElement?.tagName).toBe("TEXTAREA");

  await show(ui("hidden"));
  elsewhere.focus();
  await show(ui("visible"));
  expect(document.activeElement).toBe(elsewhere);
  elsewhere.remove();
});

it("a new conversation in the same composer still takes the caret", async () => {
  const elsewhere = document.createElement("input");
  document.body.appendChild(elsewhere);
  await show(<AgentTextarea conversationId="c-first" />);
  elsewhere.focus();
  await show(<AgentTextarea conversationId="c-second" />);
  expect(document.activeElement?.tagName).toBe("TEXTAREA");
  elsewhere.remove();
});
