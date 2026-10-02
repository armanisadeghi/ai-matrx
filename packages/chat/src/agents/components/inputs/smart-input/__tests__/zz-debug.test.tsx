import React, { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../../../../store/hooks", () => ({ useAppDispatch: () => () => undefined, useAppSelector: () => "" }));
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../../store/hooks"));
jest.mock("@host/components/ui/file-upload/useClipboardPaste", () => ({ useClipboardPaste: () => undefined }));
jest.mock("../../resources/usePasteImageResource", () => ({ usePasteImageResource: () => ({ handlePaste: () => false }) }));
jest.mock("../../../../hooks/useInstanceInputUndoRedo", () => ({ useInstanceInputUndoRedo: () => undefined }));
jest.mock("../ComposerDraftNotice", () => ({ ComposerDraftNotice: () => null }));
jest.mock("@host/features/context-menu-v3/EditableContextMenu", () => ({ EditableContextMenu: ({ children }: { children: React.ReactNode }) => children }));
import { AgentTextarea } from "../AgentTextarea";
it("dbg", async () => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<AgentTextarea conversationId="c1" />); await new Promise(r => setTimeout(r, 150)); });
  console.log(host.innerHTML.slice(0, 600), document.activeElement?.outerHTML?.slice(0,100));
});
