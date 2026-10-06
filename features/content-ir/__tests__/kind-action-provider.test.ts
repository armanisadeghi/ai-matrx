/**
 * Kind actions live on the app's ONE action registry (@ai-matrx/alchemy) as
 * the provider `content-ir.kind-actions`. These tests pin:
 *  - the census: every capability a component can name, by key and by id;
 *  - absent from every menu: a plain click target resolves none of them;
 *  - runnable by id: the invocation target resolves exactly one and runs it
 *    with the capability-scoped context, the handler's envelope coming back;
 *  - never throws: an unknown id is `not-registered`, a throwing handler is
 *    `failed` (captured by alchemy's run path).
 */
import {
  createActionRegistry,
  createClickTarget,
  type RunActionOptions,
} from "@ai-matrx/alchemy/actions";
import type { KindActionContext } from "../react/actions/kind-action-context";
import {
  KIND_ACTIONS,
  KIND_ACTIONS_PROVIDER_ID,
  kindActionId,
  kindActionProvider,
} from "../react/actions/kind-action-provider";
import {
  ensureInvokedProvider,
  invokeRegisteredAction,
  invokedActionProvider,
} from "../react/actions/invoked-actions";

jest.mock("@ai-matrx/chat/surfaces/runtime/surface-writeback", () => ({
  applySurfaceWrite: jest.fn(),
  listLiveWriteTargets: () => [],
}));

function setup() {
  const capture = jest.fn();
  const notify = { error: jest.fn(), success: jest.fn(), info: jest.fn() };
  const ports = { diagnostics: { capture }, notify } as unknown as RunActionOptions["ports"];
  const registry = createActionRegistry({ ports });
  return { registry, ports, capture, notify };
}

const ctx: KindActionContext = {
  launchAgent: async () => ({ conversationId: "c1", requestId: "r1" }) as never,
  userId: "u1",
};

describe("kind actions on the one action registry", () => {
  it("census: every kind action key and its registry id", () => {
    expect(KIND_ACTIONS.map((d) => d.key)).toEqual([
      "trigger_agent",
      "apply_surface_write",
      "list_surface_write_targets",
    ]);
    expect(kindActionProvider.id).toBe(KIND_ACTIONS_PROVIDER_ID);
    expect(kindActionProvider.declaredIds?.()).toEqual([
      "kind.trigger_agent",
      "kind.apply_surface_write",
      "kind.list_surface_write_targets",
    ]);
    for (const def of KIND_ACTIONS) {
      expect(def.label.trim()).not.toBe("");
      expect(def.description.trim()).not.toBe("");
    }
  });

  it("registers once per registry and is absent from every menu", async () => {
    const { registry } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    ensureInvokedProvider(registry, kindActionProvider);
    expect(registry.providers()).toEqual([KIND_ACTIONS_PROVIDER_ID]);
    const menu = await registry.resolve(
      createClickTarget({ auth: { authenticated: true } }),
    );
    expect(menu).toEqual([]);
  });

  it("runs trigger_agent by id with the bound context and returns its envelope", async () => {
    const { registry, ports } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    const launchAgent = jest.fn(
      async () => ({ conversationId: "c", requestId: "r" }) as never,
    );
    const ran = await invokeRegisteredAction(
      registry,
      ports,
      kindActionId("trigger_agent"),
      { agentId: "agent-1", variables: { prompt: "hi" } },
      { launchAgent, userId: "u1" } satisfies KindActionContext,
    );
    expect(ran).toEqual({ status: "ran", value: expect.objectContaining({ ok: true }) });
    expect(launchAgent).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        sourceFeature: "ai-results",
        runtime: { variables: { prompt: "hi" } },
      }),
    );

    // A malformed input is the handler's own safe envelope, never a throw.
    const bad = await invokeRegisteredAction(
      registry,
      ports,
      kindActionId("trigger_agent"),
      {},
      ctx,
    );
    expect(bad).toEqual({
      status: "ran",
      value: { ok: false, error: expect.stringContaining("agentId") },
    });
  });

  it("an unknown id is not-registered, never a throw", async () => {
    const { registry, ports } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    await expect(
      invokeRegisteredAction(registry, ports, kindActionId("no_such_action"), {}, ctx),
    ).resolves.toEqual({ status: "not-registered" });
  });

  it("a throwing handler is failed, captured and announced once by alchemy's run path", async () => {
    const { registry, ports, capture, notify } = setup();
    registry.register(
      invokedActionProvider("test.throwing", [
        {
          id: "test.boom",
          label: "Boom",
          description: "throws",
          handler: async () => {
            throw new Error("kaboom");
          },
        },
      ]),
    );
    const out = await invokeRegisteredAction(registry, ports, "test.boom", null, ctx);
    expect(out.status).toBe("failed");
    expect(capture).toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it("a duplicate id from another provider is refused at registration", () => {
    const { registry } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    expect(() =>
      registry.register(
        invokedActionProvider("test.dup", [
          {
            id: "kind.trigger_agent",
            label: "Dup",
            description: "dup",
            handler: async () => null,
          },
        ]),
      ),
    ).toThrow(/trigger_agent/);
  });
});
