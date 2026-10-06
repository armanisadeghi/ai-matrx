/**
 * Assist actions live on the app's ONE action registry (@ai-matrx/alchemy) as
 * the provider `assists.actions`: census of every kind, absent from menus,
 * runnable by id through alchemy's `invokeAction`, and an unknown kind is
 * `not_registered` (never a throw).
 */
import {
  createActionRegistry,
  createClickTarget,
  invokeAction,
  type InvokeActionOptions,
} from "@ai-matrx/alchemy/actions";
import { ensureInvokedProvider } from "@/features/content-ir/react/actions/invoked-actions";
import {
  ASSIST_ACTIONS,
  ASSIST_ACTIONS_PROVIDER_ID,
  assistActionId,
  assistActionProvider,
} from "./assist-action-provider";
import type { AssistActionContext } from "./assist-action-types";
import type { Assist } from "../types";

function setup() {
  const ports = {
    diagnostics: { capture: jest.fn() },
    notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
  } as unknown as InvokeActionOptions["ports"];
  const registry = createActionRegistry({ ports });
  ensureInvokedProvider(registry, assistActionProvider);
  return { registry, ports };
}

describe("assist actions on the one action registry", () => {
  it("census: every assist action kind and its registry id", () => {
    const kinds = [
      "apply_keyword_meaning",
      "apply_page_meta",
      "launch_agent",
      "run_mandate",
      "navigate",
      "open_in_own_browser",
      "approval_proposal",
      "server_action",
      "surface_write",
    ];
    expect(ASSIST_ACTIONS.map((d) => d.kind)).toEqual(kinds);
    expect(assistActionProvider.id).toBe(ASSIST_ACTIONS_PROVIDER_ID);
    expect(assistActionProvider.declaredIds?.()).toEqual(kinds.map((k) => `assist.${k}`));
  });

  it("is absent from every menu", async () => {
    const { registry } = setup();
    expect(registry.providers()).toEqual([ASSIST_ACTIONS_PROVIDER_ID]);
    await expect(registry.resolve(createClickTarget({ auth: { authenticated: true } }))).resolves.toEqual([]);
  });

  it("runs navigate by id with the bound context", async () => {
    const { registry, ports } = setup();
    const navigate = jest.fn();
    const ctx = { navigate } as unknown as AssistActionContext;
    const assist = { action: { kind: "navigate", href: "/assists" } } as unknown as Assist;
    const out = await invokeAction(registry, assistActionId("navigate"), assist, { ports, context: ctx });
    expect(out).toEqual({ ok: true, data: { ok: true, result: { href: "/assists" } } });
    expect(navigate).toHaveBeenCalledWith("/assists");
  });

  it("an unknown kind is not_registered, never a throw", async () => {
    const { registry, ports } = setup();
    await expect(
      invokeAction(registry, assistActionId("nope"), {}, { ports, context: {} }),
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_registered" }),
    });
  });
});
