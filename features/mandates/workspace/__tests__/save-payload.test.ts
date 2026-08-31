import { buildBindingSavePayload } from "../save-payload";

const holder = { agentId: "agent-1", agentVersionId: null, useLatest: true };

describe("buildBindingSavePayload", () => {
  it("legacy mandate sends NO consumption map (undefined, never {})", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasOffer: false,
      consumptionMap: {},
      capturedOverrides: undefined,
      storedOverrides: null,
    });
    expect(payload.consumptionMap).toBeUndefined();
  });

  it("provisioned mandate re-sends the FULL map every save", () => {
    const map = {
      // D18.2 — a target holds an ORDERED LIST of sources.
      topic: [
        { mapType: "offered_value" as const, target: "episode_topic", deliver: "variable" as const },
      ],
    };
    const payload = buildBindingSavePayload({
      holder,
      hasOffer: true,
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
      hasOffer: true,
      consumptionMap: {},
      capturedOverrides: undefined,
      storedOverrides: stored,
    });
    expect(payload.configOverrides).toEqual(stored);
  });

  it("settings step opened with genuine deltas -> deltas win", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasOffer: true,
      consumptionMap: {},
      capturedOverrides: { thinking_level: "high" },
      storedOverrides: { model: "old" },
    });
    expect(payload.configOverrides).toEqual({ thinking_level: "high" });
  });

  it("settings step opened and cleared -> explicit null (overrides removed)", () => {
    const payload = buildBindingSavePayload({
      holder,
      hasOffer: true,
      consumptionMap: {},
      capturedOverrides: {},
      storedOverrides: { model: "old" },
    });
    expect(payload.configOverrides).toBeNull();
  });

  it("pinned holder carries the version id + useLatest false", () => {
    const payload = buildBindingSavePayload({
      holder: { agentId: null, agentVersionId: "ver-9", useLatest: false },
      hasOffer: true,
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
        hasOffer: true,
        consumptionMap: {},
        capturedOverrides: undefined,
        storedOverrides: null,
      }),
    ).toThrow(/never both/);
  });
});

// ── P14 — the promise travels, and NULL is a real third answer ──────────────

describe("the auto-run promise on the wire", () => {
  const base = {
    holder: { agentId: "a1", agentVersionId: null, useLatest: true } as const,
    hasOffer: true,
    consumptionMap: {},
    capturedOverrides: undefined,
    storedOverrides: null,
  };

  it("carries the answer the screen was allowed to offer", () => {
    expect(buildBindingSavePayload({ ...base, autoRun: true }).autoRun).toBe(true);
    expect(buildBindingSavePayload({ ...base, autoRun: false }).autoRun).toBe(false);
  });

  it("says NOTHING when this binding has no opinion — never a silent false", () => {
    // `null` means "the layer below decides". Collapsing it to `false` is the
    // auto-run inversion itself: a binding that could never say "run it".
    expect(buildBindingSavePayload(base).autoRun).toBeNull();
    expect(buildBindingSavePayload({ ...base, autoRun: null }).autoRun).toBeNull();
  });

  it("carries it for a workflow Holder too — the promise is not agent-only", () => {
    const payload = buildBindingSavePayload({
      ...base,
      holder: { kind: "workflow", workflowId: "w1" },
      autoRun: true,
    });
    expect(payload.autoRun).toBe(true);
    expect(payload.holderType).toBe("workflow");
  });
});
