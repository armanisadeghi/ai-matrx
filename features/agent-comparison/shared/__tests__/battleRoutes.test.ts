import {
  battleModeBasePath,
  battleUrl,
  isBattleModeId,
} from "../battleRoutes";

describe("isBattleModeId", () => {
  it("accepts every declared mode id", () => {
    const modes = [
      "open",
      "variations",
      "model",
      "tuning",
      "settings",
      "tools",
      "system-prompt",
      "request-mod",
    ];
    for (const m of modes) {
      expect(isBattleModeId(m)).toBe(true);
    }
  });

  it("rejects an unknown mode id and non-string values", () => {
    expect(isBattleModeId("blind")).toBe(false);
    expect(isBattleModeId("")).toBe(false);
    expect(isBattleModeId(null)).toBe(false);
    expect(isBattleModeId(undefined)).toBe(false);
    expect(isBattleModeId(42)).toBe(false);
  });
});

describe("battleModeBasePath", () => {
  it("returns the Battle root for open mode", () => {
    expect(battleModeBasePath("open")).toBe("/agents/battle");
  });

  it("returns each other mode's own nested path", () => {
    expect(battleModeBasePath("model")).toBe("/agents/battle/model");
    expect(battleModeBasePath("variations")).toBe(
      "/agents/battle/variations",
    );
    expect(battleModeBasePath("system-prompt")).toBe(
      "/agents/battle/system-prompt",
    );
    expect(battleModeBasePath("request-mod")).toBe(
      "/agents/battle/request-mod",
    );
  });
});

describe("battleUrl", () => {
  it("nests an open-mode battle's id under /agents/battle/open", () => {
    expect(battleUrl("open", "set-123")).toBe("/agents/battle/open/set-123");
  });

  it("nests every other mode's battle id under that mode's own base path", () => {
    expect(battleUrl("model", "set-abc")).toBe("/agents/battle/model/set-abc");
    expect(battleUrl("variations", "set-xyz")).toBe(
      "/agents/battle/variations/set-xyz",
    );
    expect(battleUrl("tuning", "set-1")).toBe("/agents/battle/tuning/set-1");
    expect(battleUrl("settings", "set-2")).toBe(
      "/agents/battle/settings/set-2",
    );
    expect(battleUrl("tools", "set-3")).toBe("/agents/battle/tools/set-3");
    expect(battleUrl("system-prompt", "set-4")).toBe(
      "/agents/battle/system-prompt/set-4",
    );
    expect(battleUrl("request-mod", "set-5")).toBe(
      "/agents/battle/request-mod/set-5",
    );
  });

  it("URI-encodes the id", () => {
    expect(battleUrl("model", "set with space/slash")).toBe(
      "/agents/battle/model/set%20with%20space%2Fslash",
    );
    expect(battleUrl("open", "id?with&chars")).toBe(
      "/agents/battle/open/id%3Fwith%26chars",
    );
  });

  it("returns null for an unrecognized mode instead of guessing a path", () => {
    // @ts-expect-error — deliberately passing an invalid mode to prove the runtime guard
    expect(battleUrl("not-a-mode", "set-1")).toBeNull();
  });
});
