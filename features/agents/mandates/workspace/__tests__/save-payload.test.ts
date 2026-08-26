import { buildBindingSavePayload } from "../save-payload";

const holder = { agentId: "agent-1", agentVersionId: null, useLatest: true };

describe("buildBindingSavePayload", () => {
  it("legacy mandate sends NO consumption map (undefined, never {})", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasProvision: false,
      consumptionMap: {},
      capturedOverrides: undefined,
      storedOverrides: null,
    });
    expect(payload.consumptionMap).toBeUndefined();
  });

  it("provisioned mandate re-sends the FULL map every save", () => {
    const map = {
      topic: { mapType: "offered_value" as const, target: "episode_topic", deliver: "variable" as const },
    };
    const payload = buildBindingSavePayload({
      holder,
      hasProvision: true,
      consumptionMap: map,
      capturedOverrides: undefined,
      storedOverrides: null,
    });
    expect(payload.consumptionMap).toEqual(map);
  });

  it("settings step never opened -> stored overrides survive (the wipe guard)", () => {
    const stored = { model: "abc", temperature: 0.2 };
    const payload = buildBindingSavePayload({
      holder,
      hasProvision: true,
      consumptionMap: {},
      capturedOverrides: undefined,
      storedOverrides: stored,
    });
    expect(payload.configOverrides).toEqual(stored);
  });

  it("settings step opened with genuine deltas -> deltas win", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasProvision: true,
      consumptionMap: {},
      capturedOverrides: { thinking_level: "high" },
      storedOverrides: { model: "old" },
    });
    expect(payload.configOverrides).toEqual({ thinking_level: "high" });
  });

  it("settings step opened and cleared -> explicit null (overrides removed)", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasProvision: true,
      consumptionMap: {},
      capturedOverrides: {},
      storedOverrides: { model: "old" },
    });
    expect(payload.configOverrides).toBeNull();
  });

  it("pinned holder carries the version id + useLatest false", () => {
    const payload = buildBindingSavePayload({
      holder: { agentId: null, agentVersionId: "ver-9", useLatest: false },
      hasProvision: true,
      consumptionMap: {},
      capturedOverrides: undefined,
      storedOverrides: null,
    });
    expect(payload.agentId).toBeNull();
    expect(payload.agentVersionId).toBe("ver-9");
    expect(payload.useLatest).toBe(false);
  });

  it("refuses both holder ids (the server's XOR, enforced pre-wire)", () => {
    expect(() =>
      buildBindingSavePayload({
        holder: { agentId: "a", agentVersionId: "v", useLatest: false },
        hasProvision: true,
        consumptionMap: {},
        capturedOverrides: undefined,
        storedOverrides: null,
      }),
    ).toThrow(/never both/);
  });
});
