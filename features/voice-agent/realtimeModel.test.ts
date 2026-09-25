import { xaiRealtimeSocketUrl, xaiRealtimeWireModel } from "./realtimeModel";

// The voice session's model is the mandate Holder's catalog model, translated
// to xAI's wire name. A Holder on any other model must NOT silently fall back
// to a default — it resolves to null and the session refuses.
describe("realtime model from the mandate's Holder", () => {
  it("translates the xAI Realtime Voice catalog model to its wire name", () => {
    expect(xaiRealtimeWireModel("realtime-api")).toBe("grok-voice-latest");
  });

  it("has no answer for a non-xAI-realtime model (the session refuses loudly)", () => {
    expect(xaiRealtimeWireModel("gemini-3.1-flash-live-preview")).toBeNull();
    expect(xaiRealtimeWireModel(undefined)).toBeNull();
  });

  it("builds the socket URL from the broker endpoint, never a constant", () => {
    expect(xaiRealtimeSocketUrl("wss://api.x.ai/v1/realtime", "grok-voice-latest")).toBe(
      "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
    );
    expect(xaiRealtimeSocketUrl("wss://gw.example/rt?x=1", "m")).toBe("wss://gw.example/rt?x=1&model=m");
  });
});
