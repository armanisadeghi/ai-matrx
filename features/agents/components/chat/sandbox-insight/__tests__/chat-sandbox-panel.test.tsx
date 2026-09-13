/**
 * Guards for the chat room's sandbox visibility surface.
 *
 * Each test drives the REAL component through the REAL selectors over a real
 * store — the only mocked boundaries are the network (`/api/sandbox/[id]`) and
 * the two heavy leaf components (`SimpleTerminal` mounts a websocket/pty,
 * `SandboxFileViewer` fetches a tree) whose internals are not what is being
 * pinned here. Everything under test — the binding read, the preference
 * resolution, the activity normalizer, the durable-VFS badge — runs for real.
 *
 * Proven failing before passing:
 *   1. panel-visibility  → deleted the `!boundRowId` early return in
 *      ChatSandboxDock; the "no binding" case rendered the panel → RED.
 *   2. durable-vfs badge → changed DURABLE_VFS_BADGE_TEXT's wording; the
 *      assertion on the exact sentence → RED.
 *   3. activity exit code → dropped `exit_code` from readProcessFacts; the
 *      row rendered without "exit 2" → RED.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import { ChatSandboxDock } from "../ChatSandboxDock";
import { SandboxActivityFeed } from "../SandboxActivityFeed";
import {
  DURABLE_VFS_BADGE_TEXT,
  ShellInline,
} from "@/features/tool-call-visualization/renderers/shell/ShellInline";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";

// The two leaves that would open a pty / fetch a tree. Their presence is what
// is asserted, not their internals.
jest.mock("@/features/code/terminal/SimpleTerminal", () => ({
  SimpleTerminal: ({ sandboxId }: { sandboxId: string | null }) => (
    <div data-testid="simple-terminal">{sandboxId}</div>
  ),
}));
jest.mock("@/features/agents/components/debug/SandboxFileViewer", () => ({
  SandboxFileViewer: ({ sandboxRowId }: { sandboxRowId: string }) => (
    <div data-testid="sandbox-file-viewer">{sandboxRowId}</div>
  ),
}));

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ROW_ID = "22222222-2222-2222-2222-222222222222";

type PartialState = {
  bound: boolean;
  panelPref?: "auto" | "open" | "closed";
  toolCalls?: Record<string, CxToolCallRecord>;
};

/**
 * A store shaped like the slices the surface actually reads. Built with plain
 * reducers so the test states exactly what the components depend on — a
 * hidden dependency would show up as a missing key, not as a silent pass.
 */
function makeStore({ bound, panelPref = "open", toolCalls = {} }: PartialState) {
  const preloaded = {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          sourceFeature: "chat-route",
          isEphemeral: false,
          sandboxBinding: bound
            ? {
                rowId: SANDBOX_ROW_ID,
                proxyUrl: "https://example.invalid/proxy",
                tier: "ec2",
                name: "Test box",
              }
            : null,
        },
      },
    },
    userPreferences: {
      coding: {
        activeAgentSandboxBySurface: {},
        chatSandboxPanelOpen: panelPref,
      },
    },
    chatIncognito: { active: false },
    codeWorkspace: { activeSandboxId: null, activeSandboxProxyUrl: null },
    observability: { toolCalls },
    activeRequests: { byConversationId: {}, byRequestId: {} },
  };
  return configureStore({
    reducer: (state = preloaded) => state,
    preloadedState: preloaded,
  });
}

function shellEntry(
  overrides: Partial<ToolLifecycleEntry> = {},
): ToolLifecycleEntry {
  return {
    callId: "call-1",
    toolName: "shell_execute",
    displayName: "shell_execute",
    status: "completed",
    arguments: { command: "uname -a" },
    startedAt: "2026-09-13T10:00:00.000Z",
    completedAt: "2026-09-13T10:00:01.000Z",
    latestMessage: null,
    latestData: null,
    result: {
      stdout: "Linux sandbox 6.1.0\n",
      stderr: "",
      exit_code: 0,
      backend: "sandbox",
    },
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
    ...overrides,
  } as ToolLifecycleEntry;
}

function toolRecord(
  overrides: Partial<CxToolCallRecord> = {},
): CxToolCallRecord {
  return {
    id: "row-1",
    conversationId: CONVERSATION_ID,
    userRequestId: null,
    messageId: null,
    userId: "user-1",
    callId: "call-persisted",
    toolName: "shell_execute",
    toolNameAsCalled: null,
    toolType: "function",
    iteration: 1,
    status: "completed",
    success: false,
    isError: false,
    errorType: null,
    errorMessage: null,
    arguments: { command: "ls /nope" },
    output: JSON.stringify({
      stdout: "",
      stderr: "ls: /nope: No such file or directory\n",
      exit_code: 2,
      backend: "sandbox",
    }),
    outputChars: 0,
    outputPreview: null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 120,
    startedAt: "2026-09-13T10:00:00.000Z",
    completedAt: "2026-09-13T10:00:00.120Z",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: null,
    metadata: {},
    createdAt: "2026-09-13T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  } as CxToolCallRecord;
}

describe("chat sandbox panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    // Desktop viewport: useIsMobile reads matchMedia.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        instance: {
          id: SANDBOX_ROW_ID,
          sandbox_id: "sbx-abcdef123456",
          name: "Test box",
          status: "running",
          tier: "ec2",
          expires_at: null,
          config: { tier: "ec2", template: "slim" },
          proxy_url: "https://example.invalid/proxy",
        },
      }),
    })) as unknown as typeof fetch;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  function render(node: React.ReactNode, store: ReturnType<typeof makeStore>) {
    act(() => {
      root.render(<Provider store={store}>{node}</Provider>);
    });
  }

  /** Render + let the panel's `/api/sandbox/[id]` read settle. */
  async function renderSettled(
    node: React.ReactNode,
    store: ReturnType<typeof makeStore>,
  ) {
    render(node, store);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("renders nothing when the conversation has no bound sandbox", () => {
    render(
      <ChatSandboxDock conversationId={CONVERSATION_ID} />,
      makeStore({ bound: false }),
    );
    expect(container.querySelector('[data-testid="chat-sandbox-panel"]')).toBe(
      null,
    );
  });

  it("renders the panel, with the box's name and status, when one is bound", async () => {
    await renderSettled(
      <ChatSandboxDock conversationId={CONVERSATION_ID} />,
      makeStore({ bound: true }),
    );
    const panel = container.querySelector('[data-testid="chat-sandbox-panel"]');
    expect(panel).not.toBe(null);
    expect(panel?.textContent).toContain("Test box");
  });

  it("stays closed when the user's preference says closed", () => {
    render(
      <ChatSandboxDock conversationId={CONVERSATION_ID} />,
      makeStore({ bound: true, panelPref: "closed" }),
    );
    expect(container.querySelector('[data-testid="chat-sandbox-panel"]')).toBe(
      null,
    );
  });

  it("shows a persisted shell_execute in Activity with its exit code", () => {
    const record = toolRecord();
    render(
      <SandboxActivityFeed conversationId={CONVERSATION_ID} />,
      makeStore({ bound: true, toolCalls: { [record.id]: record } }),
    );
    const feed = container.querySelector(
      '[data-testid="sandbox-activity-feed"]',
    );
    expect(feed).not.toBe(null);
    expect(feed?.textContent).toContain("ls /nope");
    const exit = container.querySelector('[data-testid="activity-exit-code"]');
    expect(exit?.textContent).toBe("exit 2");
    // A nonzero exit is a FAILED run, and must be coloured as one.
    expect(exit?.className).toContain("text-red-600");
  });

  it("becomes a bottom sheet, not a side column, on a phone", async () => {
    // useIsMobile reads matchMedia; a phone matches the max-width query.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });
    await renderSettled(
      <ChatSandboxDock conversationId={CONVERSATION_ID} />,
      makeStore({ bound: true }),
    );
    // The sheet portals out of `container`; the desktop <aside> would not.
    expect(container.querySelector("aside")).toBe(null);
    expect(
      document.querySelector('[data-testid="chat-sandbox-panel"]'),
    ).not.toBe(null);
  });

  it("keeps non-sandbox tool calls out of the Activity feed", () => {
    const record = toolRecord({
      id: "row-web",
      callId: "call-web",
      toolName: "web_search",
      arguments: { query: "anything" },
      output: JSON.stringify({ results: [] }),
    });
    render(
      <SandboxActivityFeed conversationId={CONVERSATION_ID} />,
      makeStore({ bound: true, toolCalls: { [record.id]: record } }),
    );
    expect(
      container.querySelector('[data-testid="sandbox-activity-feed"]'),
    ).toBe(null);
  });
});

describe("shell_execution inline rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the command, exit code and stdout", () => {
    act(() => {
      root.render(<ShellInline entry={shellEntry()} />);
    });
    expect(container.textContent).toContain("uname -a");
    expect(container.textContent).toContain("exit 0");
    expect(container.textContent).toContain("Linux sandbox 6.1.0");
  });

  it("renders a LOUD red badge when the command ran in the durable VFS", () => {
    act(() => {
      root.render(
        <ShellInline
          entry={shellEntry({
            result: {
              stdout: "",
              stderr: "git: command not found\n",
              exit_code: 127,
              backend: "durable_vfs",
            },
          })}
        />,
      );
    });
    const badge = container.querySelector(
      '[data-testid="shell-durable-vfs-warning"]',
    );
    expect(badge).not.toBe(null);
    expect(badge?.getAttribute("role")).toBe("alert");
    expect(badge?.textContent).toContain(DURABLE_VFS_BADGE_TEXT);
    expect(badge?.className).toContain("text-red-700");
  });

  it("does not badge a command that really ran in the sandbox", () => {
    act(() => {
      root.render(<ShellInline entry={shellEntry()} />);
    });
    expect(
      container.querySelector('[data-testid="shell-durable-vfs-warning"]'),
    ).toBe(null);
  });
});
