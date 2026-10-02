export {};

const mockRpc = jest.fn();
const mockSchema = jest.fn(() => ({ rpc: mockRpc }));
jest.mock("../../../host/db", () => ({ supabase: { schema: mockSchema } }));

const MODEL = "00ab8dc9-3635-4e4e-8800-223da060386d";
const PIN = "e500ce86-d54d-4e0e-af27-101bdc5cbf1d";
const PREFERRED = { model_id: MODEL, wire_format: "google_video", input_price: 1 };
const PINNED = { model_id: MODEL, wire_format: "replicate_video", input_price: 2 };

function load(): typeof import("../useMessageFlagProfile") {
  let mod!: typeof import("../useMessageFlagProfile");
  jest.isolateModules(() => {
    mod = require("../useMessageFlagProfile");
  });
  return mod;
}

describe("the message-flag profile follows the pinned CLASS", () => {
  let warn: jest.SpyInstance;
  let err: jest.SpyInstance;
  beforeEach(() => {
    mockRpc.mockReset();
    mockSchema.mockClear();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    err = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    err.mockRestore();
  });

  it("no pin reads the model-level form", async () => {
    mockRpc.mockResolvedValue({ data: PREFERRED, error: null });
    const { fetchMessageFlagProfile } = load();
    const p = await fetchMessageFlagProfile(MODEL);
    expect(mockRpc).toHaveBeenCalledWith("model_message_flag_profile", { p_model_id: MODEL });
    expect(p?.wire_format).toBe("google_video");
  });

  it("a pin reads the class-aware form and answers with the class's route", async () => {
    mockRpc.mockResolvedValue({ data: PINNED, error: null });
    const { fetchMessageFlagProfile } = load();
    const p = await fetchMessageFlagProfile(MODEL, PIN);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("model_message_flag_profile", {
      p_model_id: MODEL,
      p_offering_id: PIN,
    });
    expect(p?.wire_format).toBe("replicate_video");
    expect(warn).not.toHaveBeenCalled();
  });

  it("before the SQL lands (PGRST202) it falls back to the model level and warns once", async () => {
    mockRpc.mockImplementation((_fn: string, args: Record<string, unknown>) =>
      Promise.resolve(
        "p_offering_id" in args
          ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
          : { data: PREFERRED, error: null },
      ),
    );
    const { fetchMessageFlagProfile } = load();
    expect((await fetchMessageFlagProfile(MODEL, PIN))?.wire_format).toBe("google_video");
    await fetchMessageFlagProfile("another-model", PIN);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("class-aware-flags-and-capabilities.sql");
  });

  it("a pin that is not a class of the model (P0002) is unknown, never the preferred route", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "not an offering" } });
    const { fetchMessageFlagProfile } = load();
    expect(await fetchMessageFlagProfile(MODEL, PIN)).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
  });
});
