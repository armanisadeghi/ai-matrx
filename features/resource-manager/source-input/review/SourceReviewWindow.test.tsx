const ack = jest.fn();
const clear = jest.fn();
jest.mock("@/features/window-panels/diagnostics/overlayRenderWatchdog", () => ({
  ackOverlaySurfaceRender: (id: string) => ack(id),
  clearOverlaySurfaceRender: (id: string) => clear(id),
}));
jest.mock("./SourceReview", () => ({ SourceReview: () => null }));

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { renderHook } from "@/test-utils/renderHook";
import SourceReviewWindow from "./SourceReviewWindow";
import { SOURCE_REVIEW_OVERLAY_ID } from "./openSourceReview";

/**
 * V1-A (verifier shot 05): "Review what goes in" is a registered window overlay that
 * shows a Dialog, not a WindowPanel, so the silent-render watchdog saw no window and
 * toasted "“Review what goes in” didn't appear" over the open review. The window
 * acknowledges its own surface while it is open.
 */
const set = createSourceSet([createSourceRef("note", "0d0b92dc-a02d-42cc-af40-5bd9a476e137")]);

beforeEach(() => {
  ack.mockClear();
  clear.mockClear();
});

it("tells the watchdog it is on screen while open, and withdraws on close", async () => {
  const hook = await renderHook(() =>
    SourceReviewWindow({ isOpen: true, onClose: () => {}, callbackId: "cb-1", sourceSet: set, options: {} }),
  );
  expect(ack).toHaveBeenCalledWith(SOURCE_REVIEW_OVERLAY_ID);
  await hook.unmount();
  expect(clear).toHaveBeenCalledWith(SOURCE_REVIEW_OVERLAY_ID);
});

it("says nothing while closed", async () => {
  const hook = await renderHook(() =>
    SourceReviewWindow({ isOpen: false, onClose: () => {}, callbackId: null, sourceSet: set, options: {} }),
  );
  expect(ack).not.toHaveBeenCalled();
  await hook.unmount();
});
