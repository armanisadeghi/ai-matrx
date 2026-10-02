import { resolveLiveRunStatusText } from "../useLiveRunStatus";

describe("resolveLiveRunStatusText", () => {
  it("replaces a stale server phase after a request-only run completes", () => {
    expect(
      resolveLiveRunStatusText({
        streamPhase: null,
        requestStatus: "complete",
        requestPhase: "Saving…",
        isActive: false,
        pending: false,
      }),
    ).toBe("Done");
  });

  it("keeps the current server phase while the run is active", () => {
    expect(
      resolveLiveRunStatusText({
        streamPhase: null,
        requestStatus: "streaming",
        requestPhase: "Saving…",
        isActive: true,
        pending: false,
      }),
    ).toBe("Saving…");
  });
});
