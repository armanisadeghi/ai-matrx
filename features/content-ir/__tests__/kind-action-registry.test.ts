/**
 * The action registry is the extensible seam that lets kind components trigger
 * platform capabilities. These tests pin the two safety invariants that make
 * "trigger anything" safe to expose to imperfect, agent-authored code:
 * a handler's deps arrive only via ctx, and the surface is enumerable/typed.
 */
import {
  registerKindAction,
  getKindAction,
  listKindActions,
  clearKindActionRegistry,
  type KindActionContext,
  type KindActionResult,
} from "../react/actions/kind-action-registry";

const ctx: KindActionContext = {
  launchAgent: async () => ({ conversationId: "c1", requestId: "r1" }) as never,
  userId: "u1",
};

describe("kind-action-registry", () => {
  beforeEach(() => clearKindActionRegistry());

  it("registers and resolves a capability by key", async () => {
    const handler = jest.fn(
      async (): Promise<KindActionResult> => ({ ok: true, result: 42 }),
    );
    registerKindAction({ key: "demo", description: "d", handler });

    const def = getKindAction("demo");
    expect(def?.key).toBe("demo");
    await expect(def!.handler({ any: true }, ctx)).resolves.toEqual({
      ok: true,
      result: 42,
    });
  });

  it("rejects an empty key — a registry of thousands must have no unaddressable entry", () => {
    expect(() =>
      registerKindAction({ key: "  ", description: "d", handler: async () => ({ ok: true, result: null }) }),
    ).toThrow(/non-empty/);
  });

  it("re-registering a key replaces it (HMR/reset friendly) and listing enumerates all", () => {
    registerKindAction({ key: "a", description: "1", handler: async () => ({ ok: true, result: 1 }) });
    registerKindAction({ key: "a", description: "2", handler: async () => ({ ok: true, result: 2 }) });
    registerKindAction({ key: "b", description: "x", handler: async () => ({ ok: true, result: 0 }) });
    expect(getKindAction("a")?.description).toBe("2");
    expect(listKindActions().map((d) => d.key).sort()).toEqual(["a", "b"]);
  });

  it("the built-in trigger_agent handler validates input into a safe envelope, never throwing", async () => {
    // Import for its registration side-effect.
    await import("../react/actions/handlers/trigger-agent");
    const def = getKindAction("trigger_agent");
    expect(def).toBeDefined();

    // Missing agentId → { ok:false } with a reason, not a throw.
    await expect(def!.handler({}, ctx)).resolves.toEqual({
      ok: false,
      error: expect.stringContaining("agentId"),
    });

    // Valid spec → delegates to ctx.launchAgent and returns ok.
    const launchAgent = jest.fn(
      async () => ({ conversationId: "c", requestId: "r" }) as never,
    );
    const res = await def!.handler(
      { agentId: "agent-1", variables: { prompt: "hi" } },
      { launchAgent, userId: "u1" },
    );
    expect(res.ok).toBe(true);
    expect(launchAgent).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        sourceFeature: "kind-action",
        runtime: { variables: { prompt: "hi" } },
      }),
    );
  });
});
