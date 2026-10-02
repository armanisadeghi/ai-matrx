/**
 * The offer verb must reach THE canvas (`useArtifactCanvas().offer`) — the old
 * `offerCanvasItem` slice action rendered nowhere after the @ai-matrx/canvas
 * rebuild, so a live run's browser silently lost its door.
 */
import { renderHook } from "@/test-utils/renderHook";

const offer = jest.fn();
const openContent = jest.fn();

jest.mock("@/features/canvas/host/useArtifactCanvas", () => ({
  useArtifactCanvas: () => ({ offer, openContent }),
}));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({
  useCanvas: () => ({ open: openContent }),
}));

import {
  cloudBrowserCanvasSourceId,
  useOfferCloudBrowserCanvas,
} from "./useOpenCloudBrowserCanvas";

beforeEach(() => {
  offer.mockClear();
  openContent.mockClear();
});

it("offers the browser to the canvas quietly, keyed to its chat", async () => {
  const hook = await renderHook(() => useOfferCloudBrowserCanvas());
  await hook.act(() => hook.current({ conversationId: "conv-1", runId: "run-1" }));

  expect(offer).toHaveBeenCalledTimes(1);
  expect(openContent).not.toHaveBeenCalled();
  expect(offer).toHaveBeenCalledWith({
    type: "cloud_browser",
    data: { initialProfileId: undefined, runId: "run-1" },
    metadata: {
      title: "Cloud Browser",
      conversationId: "conv-1",
      sourceMessageId: cloudBrowserCanvasSourceId("conv-1"),
    },
  });
});
