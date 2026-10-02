/**
 * Guards for ONE IDENTITY AND ONE BOX-STATUS SOURCE in the sandbox pane.
 *
 * The defect (owner, seen live 2026-09-13): the same pane read
 * "Unnamed · 7942bd / Running / hosted" in one place and
 * "Sandbox · 2c23df07 / Idle" in another. Three separate causes:
 *   - two formatters slicing two DIFFERENT identifiers (orchestrator id vs
 *     row uuid), so the label changed identity the moment a fetch resolved;
 *   - the box-status pill was conditional, so before the row landed there was
 *     no box status at all;
 *   - an UNLABELLED "Idle"/"Working" dot — a different axis entirely (is the
 *     agent running a sandbox tool right now?) — read as a second, conflicting
 *     status source.
 *
 * Proven failing before passing:
 *   - restored the `Sandbox · ${sandboxRowId.slice(0, 8)}` pre-load fallback;
 *     the before/after short ids diverged → RED.
 *   - restored `{status && (<pill/>)}`; the pre-load pill vanished → RED.
 *   - restored the bare "Idle" label; the axis assertion → RED.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import { SandboxCanvasBody } from "../SandboxCanvasBody";

jest.mock("@/features/code/terminal/SimpleTerminal", () => ({
  SimpleTerminal: () => <div data-testid="simple-terminal" />,
}));
jest.mock("@/features/agents/components/debug/SandboxFileViewer", () => ({
  SandboxFileViewer: () => <div data-testid="sandbox-file-viewer" />,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const ROW_ID = "2c23df07-1111-2222-3333-444444444444";
const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";

function makeStore() {
  return configureStore({
    reducer: {
      activeRequests: () => ({ byConversationId: {}, byRequestId: {} }),
      observability: () => ({ toolCalls: {} }),
    },
  });
}

async function mount(
  respond: () => Promise<unknown> | never,
): Promise<{ container: HTMLDivElement; unmount: () => Promise<void> }> {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(respond);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <SandboxCanvasBody
          sandboxRowId={ROW_ID}
          conversationId={CONVERSATION_ID}
        />
      </Provider>,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function identity(container: HTMLElement): string {
  return (
    container.querySelector('[data-testid="sandbox-identity"]')?.textContent ??
    ""
  );
}

describe("the sandbox pane names ONE box", () => {
  it("shows the same short id before the row loads and after", async () => {
    // Before: a fetch that never resolves — the pane has only the pointer.
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const before = await mount(() => pending as Promise<unknown>);
    const preLoad = identity(before.container);
    expect(preLoad).toContain("2c23df");
    // The box status is always STATED, never simply absent.
    expect(
      before.container.querySelector('[data-testid="sandbox-status-pill"]')
        ?.textContent,
    ).toBe("Checking…");
    release({});
    await before.unmount();

    // After: the real row lands, with a different ORCHESTRATOR id.
    const after = await mount(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        instance: {
          id: ROW_ID,
          sandbox_id: "sbx-7712966b7942bd",
          name: null,
          status: "running",
          tier: "hosted",
          config: { template: "bare" },
          expires_at: null,
        },
      }),
    }));
    const postLoad = identity(after.container);

    expect(postLoad).toBe("bare · hosted · 2c23df");
    // THE GUARD: one identity. The suffix does not change under the user, and
    // the orchestrator id never appears as a competing identity.
    expect(postLoad).toContain("2c23df");
    expect(postLoad).not.toContain("7942bd");
    expect(
      after.container.querySelector('[data-testid="sandbox-status-pill"]')
        ?.textContent,
    ).toBe("Running");
    await after.unmount();
  });

  it("says out loud that the agent-activity dot is a different question", async () => {
    const view = await mount(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        instance: {
          id: ROW_ID,
          sandbox_id: "sbx-7712966b7942bd",
          name: null,
          status: "running",
          tier: "hosted",
          config: { template: "bare" },
          expires_at: null,
        },
      }),
    }));
    // "Running" (the box) beside a bare "Idle" read as two status sources
    // contradicting each other. The activity axis names itself.
    expect(view.container.textContent).toContain("Agent idle");
    expect(view.container.textContent).toContain("Running");
    await view.unmount();
  });

  it("states an unreadable box instead of leaving the status blank", async () => {
    const view = await mount(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "Sandbox not found" }),
    }));
    expect(
      view.container.querySelector('[data-testid="sandbox-status-pill"]')
        ?.textContent,
    ).toBe("Unreadable");
    await view.unmount();
  });
});
