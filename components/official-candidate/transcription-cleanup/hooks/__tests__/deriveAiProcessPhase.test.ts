import { deriveAiProcessPhase } from "../useAiPostProcess";

describe("deriveAiProcessPhase — a launch failure is never a silent idle", () => {
  it("a pre-request failure (e.g. no organization selected for the mandate) reads as error", () => {
    expect(deriveAiProcessPhase(false, "Select an organization to run this job", undefined)).toBe("error");
  });
  it("launching wins while the launch is in flight", () => {
    expect(deriveAiProcessPhase(true, null, undefined)).toBe("launching");
  });
  it("otherwise the request row's status drives it, idle when there is none", () => {
    expect(deriveAiProcessPhase(false, null, "streaming")).toBe("streaming");
    expect(deriveAiProcessPhase(false, null, undefined)).toBe("idle");
  });
});
