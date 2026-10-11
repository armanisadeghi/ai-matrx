/**
 * Kind actions live on the app's ONE action registry (@ai-matrx/alchemy) as
 * the provider `content-ir.kind-actions`. These tests pin:
 *  - the census: every capability a component can name, by key and by id;
 *  - absent from every menu: a plain click target resolves none of them;
 *  - runnable by id: alchemy's `invokeAction` runs it with the
 *    capability-scoped context, the handler's envelope coming back as `data`;
 *  - never throws: an unknown id is `not_registered`, a throwing handler is
 *    `action_failed` (captured + announced once by alchemy).
 */
import {
  createActionRegistry,
  createClickTarget,
  invokeAction,
  type InvokeActionOptions,
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
  invokedActionProvider,
} from "../react/actions/invoked-actions";

jest.mock("@ai-matrx/chat/surfaces/runtime/surface-writeback", () => ({
  applySurfaceWrite: jest.fn(),
  listLiveWriteTargets: () => [],
}));

function setup() {
  const capture = jest.fn();
  const notify = { error: jest.fn(), success: jest.fn(), info: jest.fn() };
  const ports = { diagnostics: { capture }, notify } as unknown as InvokeActionOptions["ports"];
  const registry = createActionRegistry({ ports });
  return { registry, ports, capture, notify };
}

const ctx: KindActionContext = {
  launchAgent: async () => ({ conversationId: "c1", requestId: "r1" }) as never,
  userId: "u1",
  openShortcut: async () => ({ conversationId: "c2" }),
  runShortcut: async () => ({ ok: true, data: null }),
  itemState: null,
  openFile: () => undefined,
  shareFile: () => undefined,
};

describe("kind actions on the one action registry", () => {
  it("census: every kind action key and its registry id", () => {
    expect(KIND_ACTIONS.map((d) => d.key)).toEqual([
      "trigger_agent",
      "apply_surface_write",
      "list_surface_write_targets",
      "run_shortcut",
      "save_item_state",
      "open_file",
      "share_file",
    ]);
    expect(kindActionProvider.id).toBe(KIND_ACTIONS_PROVIDER_ID);
    expect(kindActionProvider.declaredIds?.()).toEqual([
      "kind.trigger_agent",
      "kind.apply_surface_write",
      "kind.list_surface_write_targets",
      "kind.run_shortcut",
      "kind.save_item_state",
      "kind.open_file",
      "kind.share_file",
    ]);
    for (const def of KIND_ACTIONS) {
      expect(def.label.trim()).not.toBe("");
      expect(def.description.trim()).not.toBe("");
    }
  });

  it("registers once per registry, is absent from every menu and programmatic-only", async () => {
    const { registry } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    ensureInvokedProvider(registry, kindActionProvider);
    expect(registry.providers()).toEqual([KIND_ACTIONS_PROVIDER_ID]);
    const menu = await registry.resolve(
      createClickTarget({ auth: { authenticated: true } }),
    );
    expect(menu).toEqual([]);
    const action = await registry.get(kindActionId("trigger_agent"));
    expect(action?.surfaces).toEqual(["invoke"]);
    expect(typeof action?.invoke).toBe("function");
  });

  it("runs trigger_agent by id with the bound context and returns its envelope", async () => {
    const { registry, ports } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    const launchAgent = jest.fn(
      async () => ({ conversationId: "c", requestId: "r" }) as never,
    );
    const ran = await invokeAction(
      registry,
      kindActionId("trigger_agent"),
      { agentId: "agent-1", variables: { prompt: "hi" } },
      { ports, context: { launchAgent, userId: "u1", openShortcut: async () => ({ conversationId: "c2" }), runShortcut: async () => ({ ok: true, data: null }), itemState: null, openFile: () => undefined, shareFile: () => undefined } satisfies KindActionContext },
    );
    expect(ran).toEqual({ ok: true, data: expect.objectContaining({ ok: true }) });
    expect(launchAgent).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        sourceFeature: "ai-results",
        runtime: { variables: { prompt: "hi" } },
      }),
    );

    // A malformed input is the handler's own safe envelope, never a throw.
    const bad = await invokeAction(registry, kindActionId("trigger_agent"), {}, { ports, context: ctx });
    expect(bad).toEqual({
      ok: true,
      data: { ok: false, error: expect.stringContaining("agentId") },
    });
  });

  it("an unknown id is not_registered, never a throw", async () => {
    const { registry, ports } = setup();
    ensureInvokedProvider(registry, kindActionProvider);
    await expect(
      invokeAction(registry, kindActionId("no_such_action"), {}, { ports, context: ctx }),
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_registered" }),
    });
  });

  it("a throwing handler is action_failed, captured and announced once by alchemy", async () => {
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
    const out = await invokeAction(registry, "test.boom", null, { ports, context: ctx });
    expect(out).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "action_failed", message: "kaboom" }),
    });
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
