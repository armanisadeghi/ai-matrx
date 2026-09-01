import { googleTokenPrompt } from "./GoogleApiProvider";

describe("Google browser-token prompt policy", () => {
  it("uses explicit consent for a user-triggered Picker token", () => {
    expect(googleTokenPrompt({ interactive: true })).toBe("consent");
  });

  it("preserves silent token reuse for background callers", () => {
    expect(googleTokenPrompt()).toBe("");
  });
});
