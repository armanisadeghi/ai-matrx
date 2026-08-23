import { renderHook, settle } from "@/test-utils/renderHook";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { invalidateCanvasItemCache, useCanvasItem } from "./useCanvasItem";

jest.mock("@/lib/records/recordUnavailable", () => ({
  recordUnavailable: jest.fn(() => ({ message: "missing artifact" })),
}));

jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: {
    getById: jest.fn(),
    getVersionHistory: jest.fn(),
  },
}));

const ARTIFACT_ID = "00000000-0000-4000-8000-000000000091";

describe("useCanvasItem missing-row reporting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCanvasItemCache(ARTIFACT_ID);
    jest.mocked(canvasArtifactService.getById).mockResolvedValue(null);
  });

  it("does not capture an expected miss when the caller owns recovery", async () => {
    const hook = await renderHook(() =>
      useCanvasItem(ARTIFACT_ID, { reportUnavailable: false }),
    );

    await settle(hook, (value) => !value.loading, "suppressed artifact miss");

    expect(hook.current.row).toBeNull();
    expect(hook.current.error).toBeNull();
    expect(recordUnavailable).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("keeps unmatched missing refs on the record-unavailable boundary", async () => {
    const hook = await renderHook(() => useCanvasItem(ARTIFACT_ID));

    await settle(hook, (value) => !value.loading, "reported artifact miss");

    expect(recordUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: ARTIFACT_ID, token: "canvas_item" }),
    );
    expect(hook.current.error).toBe("missing artifact");
    await hook.unmount();
  });
});
