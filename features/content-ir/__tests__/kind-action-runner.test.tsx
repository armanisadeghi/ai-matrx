/**
 * useKindActionRunner runs kind actions through the app's ONE action registry.
 * Pins the component-facing contract: the provider lands on the registry the
 * host supplies, a known key runs, an unknown key is an `{ ok:false }`
 * envelope (toast + capture, never a throw), and a second call for the same
 * target while the first is in flight is refused.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createActionRegistry, type ActionRegistry } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider } from "@ai-matrx/alchemy/react/host";
import type { AlchemyHostPorts } from "@ai-matrx/alchemy/ports";
import type { FloatingRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";

const mockToastError = jest.fn();
const mockCapture = jest.fn();
let mockLaunch: jest.Mock;

jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (...a: unknown[]) => mockCapture(...a),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "user-1",
  useAppStore: () => ({ getState: () => ({}) }),
}));
// The mock run window implements the WHOLE FloatingRun contract (typed with `satisfies`), so a
// member the package adds is a type error here instead of a runtime "x is not a function".
const mockSettle = jest.fn();
jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({
  useFloatingRunWindow: () => ({
    start: () =>
      ({
        bind: jest.fn(),
        bindRequest: jest.fn(),
        close: jest.fn(),
        fail: jest.fn(),
        settle: (reason: string) => mockSettle(reason),
      }) satisfies FloatingRun,
    close: jest.fn(),
  }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("@ai-matrx/chat/agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchAgent: (...a: unknown[]) => mockLaunch(...a) }),
}));
jest.mock("../react/kind-interaction", () => ({ emitKindInteraction: jest.fn() }));
const mockHeadless = jest.fn();
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  runHeadlessAgentJson: (...a: unknown[]) => mockHeadless(...a),
  livePosture: (bind?: unknown) => (bind ? { displayMode: "direct", keepInstance: true, onConversationCreated: bind } : {}),
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectConversationOrganizationId: () => () => "org-9",
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-writeback", () => ({
  applySurfaceWrite: jest.fn(),
  listLiveWriteTargets: () => [],
}));

import { useKindActionRunner, type RunKindAction } from "../react/actions/useKindActionRunner";
import { KIND_ACTIONS_PROVIDER_ID } from "../react/actions/kind-action-provider";
import { invokedActionProvider } from "../react/actions/invoked-actions";

describe("useKindActionRunner on the one registry", () => {
  let container: HTMLDivElement;
  let root: Root;
  let registry: ActionRegistry;
  let ports: AlchemyHostPorts;
  let runAction: RunKindAction | null;

  const saved: Record<string, unknown> = {};
  function Probe() {
    runAction = useKindActionRunner(undefined, {
      itemState: { hosted: true, read: () => saved, patch: (p) => Object.assign(saved, p) },
    });
    return null;
  }

  beforeEach(async () => {
    mockToastError.mockReset();
    mockCapture.mockReset();
    mockLaunch = jest.fn(async () => ({ conversationId: "c", requestId: "r" }));
    ports = {
      diagnostics: { capture: jest.fn() },
      notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
    } as unknown as AlchemyHostPorts;
    registry = createActionRegistry({ ports });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runAction = null;
    await act(async () => {
      root.render(
        <AlchemyActionsProvider ports={ports} registry={registry}>
          <Probe />
        </AlchemyActionsProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("registers the kind provider on the host's registry", () => {
    expect(registry.providers()).toContain(KIND_ACTIONS_PROVIDER_ID);
  });

  it("runs a known key with the viewing user's launcher", async () => {
    const res = await runAction!("trigger_agent", { agentId: "agent-9" });
    expect(res.ok).toBe(true);
    expect(mockLaunch).toHaveBeenCalledWith("agent-9", expect.any(Object));
  });

  it("an unknown key resolves to the envelope error, never throws", async () => {
    await expect(runAction!("does_not_exist", {})).resolves.toEqual({
      ok: false,
      error: 'No action registered for "does_not_exist".',
    });
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("a throwing handler is an envelope, announced once (by alchemy), never a throw", async () => {
    registry.register(
      invokedActionProvider("test.throwing", [
        {
          id: "kind.boom",
          label: "Boom",
          description: "throws",
          handler: async () => {
            throw new Error("kaboom");
          },
        },
      ]),
    );
    await expect(runAction!("boom", {})).resolves.toEqual({ ok: false, error: "kaboom" });
    expect(ports.notify!.error).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("refuses a second in-flight call for the same agent", async () => {
    let release!: () => void;
    mockLaunch = jest.fn(
      () => new Promise((resolve) => (release = () => resolve({ conversationId: "c", requestId: "r" }))),
    );
    const first = runAction!("trigger_agent", { agentId: "agent-1" });
    const second = await runAction!("trigger_agent", { agentId: "agent-1" });
    expect(second).toEqual({ ok: false, error: '"trigger_agent" is already running.' });
    await new Promise((r) => setTimeout(r, 0));
    release();
    await expect(first).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it("outside the action host it renders and answers an envelope, never a throw", async () => {
    const bare = document.createElement("div");
    const bareRoot = createRoot(bare);
    let bareRun: RunKindAction | null = null;
    function BareProbe() {
      bareRun = useKindActionRunner();
      return null;
    }
    await act(async () => bareRoot.render(<BareProbe />));
    await expect(bareRun!("trigger_agent", { agentId: "a" })).resolves.toEqual({
      ok: false,
      error: expect.stringContaining("can't run here"),
    });
    expect(mockLaunch).not.toHaveBeenCalled();
    await act(async () => bareRoot.unmount());
  });

  it("run_shortcut with saveAs runs the shortcut headless, live, page-free — and saves the image onto the item", async () => {
    mockHeadless.mockImplementation(async (_d: unknown, _g: unknown, opts: Record<string, any>) => {
      const result = {
        success: true,
        data: [{ kind: "image", fileId: "f9", mimeType: "image/png", width: 8, height: 10 }],
        fullResponse: "",
        conversationId: "c9",
        requestId: "r9",
      };
      await opts.onResult?.(result);
      return result;
    });
    const res = await runAction!("run_shortcut", {
      shortcutId: "sc-1",
      scope: { selection: "Two Envelopes" },
      expect: "image",
      saveAs: "idea_2_image",
    });
    const opts = mockHeadless.mock.calls[0][2];
    expect(opts).toMatchObject({
      shortcutId: "sc-1",
      applicationScope: { selection: "Two Envelopes" },
      expect: "media",
      surfaceName: null,
      displayMode: "direct",
      keepInstance: true,
    });
    const image = { file_id: "f9", mime_type: "image/png", width: 8, height: 10, organization_id: "org-9" };
    expect(res).toEqual({ ok: true, result: { data: image, saved: true } });
    expect(saved).toEqual({ idea_2_image: image });
    // The launch returned, so the window is told — once — how to end if no stream bound it.
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });
});
