/**
 * @jest-environment jsdom
 *
 * A refused clipboard (the kit copy resolves `false`; it never throws) must not strand the person:
 * "Open in Chat" still closes and navigates, and "Report Lost Recording" still opens the feedback
 * form — AP-2 regression: an early `return` on the failed copy skipped both.
 *
 * Every copy is ONE notice: the REAL kit hook runs here (only the browser clipboard is stubbed),
 * so its own success/failure toast and any toast the modal adds are both counted (AP-2: the modal
 * used to add "Text copied to clipboard" on top of the kit's, and a paste-it-yourself info on top
 * of the kit's failure).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = jest.fn<Promise<void>, [string]>();
const push = jest.fn();
const dispatch = jest.fn();
const notices: Array<[string, string]> = [];
jest.mock("@ai-matrx/kit/format", () => ({ formatDurationSeconds: () => "0:01" }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/toast", () => ({
  toast: {
    info: (m: string) => notices.push(["info", m]),
    error: (m: string) => notices.push(["error", m]),
    success: (m: string) => notices.push(["success", m]),
    warning: (m: string) => notices.push(["warning", m]),
  },
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({
  openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }),
}));
jest.mock("@ai-matrx/design-system", () => ({ ReadFailure: () => null }));
jest.mock("@/components/mardown-display/blocks/audio/AudioOutputBlock", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/ui/button", () => ({
  Button: (p: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={p.onClick}>
      {p.children}
    </button>
  ),
}));
jest.mock("@/components/ui/dialog", () => {
  const Pass = (p: { children?: React.ReactNode }) => <div>{p.children}</div>;
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogDescription: Pass };
});
jest.mock("../../services/audioFallbackUpload", () => ({ uploadAndTranscribeFull: jest.fn() }));

const items: Array<Record<string, unknown>> = [];
jest.mock("../../providers/AudioRecoveryProvider", () => ({
  useAudioRecovery: () => ({
    recoveredItems: items,
    dismissItem: jest.fn(),
    dismissAll: jest.fn(),
    hasRecoveredData: true,
    recoveryError: null,
    refreshRecovery: jest.fn(),
    getAudioBlob: jest.fn(async () => null),
  }),
}));

import { AudioRecoveryModal } from "../AudioRecoveryModal";

const record = (overrides: Record<string, unknown>) => ({
  id: "r1",
  sessionId: "s1",
  audioChunks: [],
  mimeType: "audio/webm",
  accumulatedText: "",
  status: "recording",
  failedChunkIndices: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const click = async (text: string) => {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent === text);
  expect(b).toBeDefined();
  await act(async () => b!.click());
};

beforeEach(() => {
  [writeText, push, dispatch, onClose].forEach((m) => m.mockReset());
  notices.length = 0;
  // A refused clipboard: the async write rejects and the execCommand fallback reports false.
  writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  document.execCommand = jest.fn(() => false);
  jest.spyOn(console, "error").mockImplementation(() => {});
  items.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("Open in Chat closes and navigates even when the clipboard refuses — with ONE notice", async () => {
  items.push(record({ accumulatedText: "my transcript" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Open in Chat");
  expect(writeText).toHaveBeenCalledWith("my transcript");
  expect(onClose).toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith("/agents/all");
  expect(notices).toEqual([["error", "Couldn't copy the transcription — copy it here before opening chat"]]);
});

it("Report Lost Recording opens the feedback form even when the clipboard refuses — with ONE notice", async () => {
  items.push(record({ accumulatedText: "" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Report Lost Recording");
  expect(writeText).toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith({ type: "overlay/open", payload: { overlayId: "feedbackDialog" } });
  expect(notices).toEqual([["error", "Couldn't copy the bug report — please describe what happened"]]);
});

it("a landed copy navigates with the one copied notice, no paste-it-yourself hint", async () => {
  writeText.mockResolvedValue(undefined);
  items.push(record({ accumulatedText: "my transcript" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Open in Chat");
  expect(push).toHaveBeenCalledWith("/agents/all");
  expect(notices).toEqual([["success", "Transcription copied — paste it into your conversation"]]);
});

it("Copy Text that lands shows exactly ONE success toast (AP-2: the kit's and the modal's both fired)", async () => {
  writeText.mockResolvedValue(undefined);
  items.push(record({ accumulatedText: "my transcript" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Copy Text");
  expect(writeText).toHaveBeenCalledWith("my transcript");
  expect(notices).toEqual([["success", "Text copied to clipboard"]]);
});
