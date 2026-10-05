import { resolveHolderRealtimeModel, xaiRealtimeSocketUrl } from "./realtimeModel";
import { clearRealtimeSessionCache } from "./realtimeSession";

const postJson = jest.fn();
jest.mock("../host/server/python-client", () => ({
  postJson: (path: string, body: unknown) => postJson(path, body),
}));

// The voice session's model is the mandate Holder's catalog model, translated
// to xAI's wire name ON THE SERVER (P24v). A Holder on any other model must NOT
// silently fall back to a default — the server refuses and the error surfaces.
describe("realtime model from the mandate's Holder", () => {
  beforeEach(() => {
    postJson.mockReset();
    clearRealtimeSessionCache();
  });

  it("takes the wire model from the server-read session", async () => {
    postJson.mockResolvedValue({
      data: { agent_id: "a1", agent_type: "builtin", model_id: "m", wire_model: "grok-voice-latest", voice_id: "ara", instructions: "hi" },
    });
    await expect(resolveHolderRealtimeModel("a1")).resolves.toEqual({
      wireModel: "grok-voice-latest",
      error: null,
    });
    expect(postJson).toHaveBeenCalledWith("/ai/agents/a1/realtime-session", { is_version: false });
  });

  it("surfaces the server's refusal for a non-xAI-realtime model (no default model)", async () => {
    postJson.mockRejectedValue({
      detail: { code: "realtime_model_unsupported", message: 'Voice agent a2 is set to model "gemini-3.1-flash-live-preview"' },
    });
    const out = await resolveHolderRealtimeModel("a2");
    expect(out.wireModel).toBeNull();
    expect(out.error).toContain("gemini-3.1-flash-live-preview");
  });

  it("builds the socket URL from the broker endpoint, never a constant", () => {
    expect(xaiRealtimeSocketUrl("wss://api.x.ai/v1/realtime", "grok-voice-latest")).toBe(
      "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
    );
    expect(xaiRealtimeSocketUrl("wss://gw.example/rt?x=1", "m")).toBe("wss://gw.example/rt?x=1&model=m");
  });
});
