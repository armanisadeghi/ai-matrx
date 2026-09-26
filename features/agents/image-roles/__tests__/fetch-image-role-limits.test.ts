const mockRpc = jest.fn();
const mockSchema = jest.fn(() => ({ rpc: mockRpc }));
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: mockSchema } }));
const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: mockCaptureError }));

// Veo 3.1's live row from ai.offering_capabilities, as a non-admin reads it.
const VEO_ROW = {
  model_id: "8eb0413e-10c2-4f6d-99f1-4aea3a8434a4",
  offering_id: "09420ee3-e236-4a6a-b76e-2ff1f2118b3d",
  reference_roles: {
    image_reference_roles: { asset: 3, total: 3, last_frame: 1, first_frame: 1 },
    video_reference_roles: { named: 3, extend: 1 },
  },
  multi_speaker: null,
  supports_prefill: false,
  is_decision_model: false,
};

function load(): typeof import("../useImageRoleLimits") {
  let mod!: typeof import("../useImageRoleLimits");
  jest.isolateModules(() => {
    mod = require("../useImageRoleLimits");
  });
  return mod;
}

describe("fetchImageRoleLimits reads the member-readable capability door", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockSchema.mockClear();
    mockCaptureError.mockReset();
  });

  it("returns the offering's role limits through ai.offering_capabilities", async () => {
    mockRpc.mockResolvedValue({ data: [VEO_ROW], error: null });
    const { fetchImageRoleLimits } = load();
    const limits = await fetchImageRoleLimits(VEO_ROW.model_id);
    expect(mockSchema).toHaveBeenCalledWith("ai");
    expect(mockRpc).toHaveBeenCalledWith("offering_capabilities", {
      p_model_ids: [VEO_ROW.model_id],
    });
    expect(limits).not.toBeNull();
    expect(limits).toMatchObject({ first_frame: 1, last_frame: 1, asset: 3 });
  });

  it("an empty read is unknown (null), never 'takes no roles'", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { fetchImageRoleLimits } = load();
    expect(await fetchImageRoleLimits("m-none")).toBeNull();
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
  });

  it("a model with no available offering is unknown (null)", async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...VEO_ROW, offering_id: null, reference_roles: null }],
      error: null,
    });
    const { fetchImageRoleLimits } = load();
    expect(await fetchImageRoleLimits(VEO_ROW.model_id)).toBeNull();
  });

  it("a failed read throws so the hook reports unknown", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("permission denied") });
    const { fetchImageRoleLimits } = load();
    await expect(fetchImageRoleLimits("m-err")).rejects.toThrow("permission denied");
  });
});
