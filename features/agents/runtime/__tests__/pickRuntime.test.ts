import {
  pickRuntime,
  isRealtimeRuntime,
  EXECUTION_MODES,
} from "../pickRuntime";

describe("pickRuntime — local-runtime (Phase 5)", () => {
  it("is a declared execution mode", () => {
    expect(EXECUTION_MODES).toContain("local-runtime");
  });

  it("is a turn-based transport, not a realtime runtime", () => {
    expect(isRealtimeRuntime("local-runtime")).toBe(false);
  });

  it("a turn-based model on a local-runtime surface resolves to local-runtime", () => {
    expect(
      pickRuntime({ modelInteraction: "turn", surfaceMode: "local-runtime" }),
    ).toEqual({ runtime: "local-runtime" });
  });

  it("an agent hint of local-runtime is honored on a turn-based surface", () => {
    expect(
      pickRuntime({
        modelInteraction: "turn",
        surfaceMode: "python-stream",
        agentHint: "local-runtime",
      }),
    ).toEqual({ runtime: "local-runtime" });
  });

  it("a realtime model rejects a local-runtime surface (no realtime transport)", () => {
    const result = pickRuntime({
      modelInteraction: "realtime",
      surfaceMode: "local-runtime",
    });
    expect("error" in result).toBe(true);
  });
});
