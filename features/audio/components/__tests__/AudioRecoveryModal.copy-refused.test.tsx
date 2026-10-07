/**
 * @jest-environment jsdom
 *
 * A refused clipboard (the kit copy resolves `false`; it never throws) must not strand the person:
 * "Open in Chat" still closes and navigates, and "Report Lost Recording" still opens the feedback
 * form — AP-2 regression: an early `return` on the failed copy skipped both.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copyText = jest.fn<Promise<boolean>, [string, string?]>();
const push = jest.fn();
const dispatch = jest.fn();
const toastInfo = jest.fn();
jest.mock("@ai-matrx/kit/clipboard", () => ({ useClipboard: () => ({ copyText }) }));
jest.mock("@ai-matrx/kit/format", () => ({ formatDurationSeconds: () => "0:01" }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/toast", () => ({
  toast: { info: (...a: unknown[]) => toastInfo(...a), error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({
  openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }),
}));
jest.mock("@/components/read-state/ReadFailure", () => ({ ReadFailure: () => null }));
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
  [copyText, push, dispatch, toastInfo, onClose].forEach((m) => m.mockReset());
  copyText.mockResolvedValue(false);
  items.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("Open in Chat closes and navigates even when the clipboard refuses", async () => {
  items.push(record({ accumulatedText: "my transcript" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Open in Chat");
  expect(copyText).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith("/agents/all");
  expect(toastInfo).toHaveBeenCalledWith("Navigate to chat and paste your transcription");
});

it("Report Lost Recording opens the feedback form even when the clipboard refuses", async () => {
  items.push(record({ accumulatedText: "" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Report Lost Recording");
  expect(copyText).toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith({ type: "overlay/open", payload: { overlayId: "feedbackDialog" } });
});

it("a landed copy navigates without the paste-it-yourself hint", async () => {
  copyText.mockResolvedValue(true);
  items.push(record({ accumulatedText: "my transcript" }));
  await act(async () => root.render(<AudioRecoveryModal isOpen onClose={onClose} />));
  await click("Open in Chat");
  expect(push).toHaveBeenCalledWith("/agents/all");
  expect(toastInfo).not.toHaveBeenCalled();
});
