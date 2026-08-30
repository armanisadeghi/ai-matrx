const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();
const mockGetManifest = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));

import { applySurfaceWrite, refuseSurfaceWrite } from "./surface-writeback";
import { registerSurfaceRuntime } from "./SurfaceRuntimeContext";

const target = {
  name: "review_field",
  label: "Review field",
  description: "Test target",
  valueType: "string" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
};

describe("surface writeback handler outcomes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManifest.mockReturnValue({ writeTargets: [target] });
  });

  it("returns an expected domain refusal without an error toast or capture", async () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () =>
            refuseSurfaceWrite("Use the correction target for agent columns."),
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "wrong target");

    expect(result).toEqual({
      ok: false,
      refused: true,
      error: "Use the correction target for agent columns.",
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
    unregister();
  });

  it("keeps unexpected handler failures loud", async () => {
    const failure = new Error("Database write failed.");
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () => {
            throw failure;
          },
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "value");

    expect(result).toEqual({ ok: false, error: "Database write failed." });
    expect(mockToastError).toHaveBeenCalledWith("Database write failed.");
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-writeback",
        message: "[surface-writeback] Database write failed.",
      }),
    );
    unregister();
  });
});
