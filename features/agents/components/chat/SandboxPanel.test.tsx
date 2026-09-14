/**
 * THE DEFECT (owner, seen live 2026-09-14): picking a box in the chat's Sandbox
 * panel defaulted to the SURFACE-WIDE seed — the checkbox was "Only this
 * conversation", unchecked. One pick rewrote `activeAgentSandboxBySurface` and
 * moved every future chat on that surface onto the box.
 *
 * These mount the REAL SandboxPanel against a real store and assert the ACTIONS
 * it dispatches. Only the data hooks (network) and the DB thunk are doubled.
 *
 * The production change that makes them fail: flip the default back
 * (`useState(true)` on the share flag, or restore the old `applyRef` that wrote
 * the surface preference on the un-opted-in path).
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/code/views/sandboxes/CloneRepoDialog", () => ({
  CloneRepoDialog: () => null,
}));
// The DB write. It is a thunk, so it is replaced with a plain, identifiable
// action creator — what is asserted is THAT it is dispatched, with which args.
jest.mock(
  "@/features/agents/redux/conversation-list/conversation-row-actions.thunks",
  () => ({
    setConversationSandbox: jest.fn((args: unknown) => ({
      type: "conversationRow/setSandbox",
      payload: args,
    })),
  }),
);
jest.mock("@/hooks/sandbox/use-sandbox", () => ({
  useSandboxInstances: () => ({
    instances: [
      {
        id: "b0c1d2e3-4444-4444-8888-999999999999",
        name: "dev box",
        proxy_url: "https://proxy.example/dev-box",
        status: "running",
        tier: "ec2",
        template: "base",
        sandbox_id: "sbx-1",
        created_at: new Date().toISOString(),
        expires_at: null,
      },
    ],
    loading: false,
    fetchInstances: jest.fn(),
    createInstance: jest.fn(),
    renameInstance: jest.fn(),
    error: null,
  }),
}));
jest.mock("@/hooks/sandbox/use-compute-targets", () => ({
  useComputeTargets: () => ({ data: { targets: [] }, loading: false }),
}));
jest.mock("@/hooks/sandbox/use-verified-binding", () => ({
  useVerifiedSandboxBinding: () => ({
    ref: null,
    status: "unknown",
    isChecking: false,
  }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { SandboxPanel } from "./SandboxPanel";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const CONVERSATION_ID = "11111111-2222-3333-4444-555555555555";
const SANDBOX_ROW_ID = "b0c1d2e3-4444-4444-8888-999999999999";
const SURFACE = "chat-route";

type Action = { type: string; payload?: unknown };

function makeStore(dispatched: Action[]) {
  const state = {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          sourceFeature: SURFACE,
          isEphemeral: false,
          sandboxBinding: null,
        },
      },
    },
    userPreferences: {
      coding: { activeAgentSandboxBySurface: {} },
      sandbox: {
        template: "base",
        tier: "ec2",
        ttl_seconds: null,
        default_git_repo: null,
      },
    },
    chatIncognito: { isActive: false },
    appContext: { organization_id: "org-1" },
  };
  return {
    getState: () => state,
    subscribe: () => () => {},
    dispatch: (action: Action) => {
      dispatched.push(action);
      return action;
    },
  };
}

function renderPanel(dispatched: Action[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={makeStore(dispatched) as never}>
        <TooltipProvider>
          <SandboxPanel conversationId={CONVERSATION_ID} />
        </TooltipProvider>
      </Provider>,
    );
  });
  return { container, root };
}

function click(container: HTMLElement, selector: string) {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no element for ${selector}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SandboxPanel binding scope", () => {
  it("binds THIS CONVERSATION and writes no surface preference by default", () => {
    const dispatched: Action[] = [];
    const { container, root } = renderPanel(dispatched);

    click(container, `button[title*="dev box"]`);

    const bind = dispatched.find(
      (a) => a.type === "conversationRow/setSandbox",
    );
    expect(bind).toBeDefined();
    expect(bind?.payload).toMatchObject({
      conversationId: CONVERSATION_ID,
      ref: { rowId: SANDBOX_ROW_ID },
    });
    // THE defect: the un-opted-in pick used to also write the surface seed.
    expect(
      dispatched.filter((a) => a.type.includes("setPreference")),
    ).toHaveLength(0);
    expect(
      dispatched.some((a) =>
        JSON.stringify(a).includes("activeAgentSandboxBySurface"),
      ),
    ).toBe(false);

    act(() => root.unmount());
  });

  it("offers the surface-wide default as an UNCHECKED opt-in", () => {
    const dispatched: Action[] = [];
    const { container, root } = renderPanel(dispatched);

    const box = container.querySelector<HTMLElement>('[role="checkbox"]');
    expect(box).not.toBeNull();
    expect(box?.getAttribute("data-state")).toBe("unchecked");
    expect(box?.closest("label")?.textContent).toContain(
      "Also use for every new chat here",
    );
    // The old inverted wording must not come back.
    expect(container.textContent).not.toContain("Only this conversation");

    act(() => root.unmount());
  });

  it("writes the surface seed once the opt-in is checked — and still binds this chat", () => {
    const dispatched: Action[] = [];
    const { container, root } = renderPanel(dispatched);

    click(container, '[role="checkbox"]');
    click(container, `button[title*="dev box"]`);

    const pref = dispatched.find((a) =>
      JSON.stringify(a).includes("activeAgentSandboxBySurface"),
    );
    expect(pref).toBeDefined();
    expect(JSON.stringify(pref)).toContain(SURFACE);
    expect(
      dispatched.some((a) => a.type === "conversationRow/setSandbox"),
    ).toBe(true);

    act(() => root.unmount());
  });
});
