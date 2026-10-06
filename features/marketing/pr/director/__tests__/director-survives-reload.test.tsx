/**
 * A RELOAD MID-ANSWER KEEPS THE PR DIRECTOR'S CONVERSATION.
 *
 * Acceptance 2026-09-29: reloading the Press Room while the Director streamed opened a
 * brand-new empty conversation — the old one persisted but the page could not find it
 * again. The fix: once a turn has been sent, the conversation id rides the URL
 * (`?director=<id>`, as /chat carries its id), and a mount that finds one reopens it
 * through the canonical resume sequence (`resumeConversation`: hydrate, re-surface a
 * pending tool prompt, reattach to a turn the server is still running) instead of
 * minting a new one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const launchMandate = jest.fn(async (_key: string, opts?: { conversationId?: string }) => ({
  conversationId: opts?.conversationId ?? "fresh-conv",
}));
jest.mock("@ai-matrx/chat/agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchMandate }),
}));

const resumeCalls: unknown[] = [];
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/thunks/resume-conversation.thunk",
  () => ({
    resumeConversation: (args: unknown) => {
      resumeCalls.push(args);
      return { type: "resume", args };
    },
  }),
);

let messageCount = 0;
let executing = false;
let cacheOnly = false;
let serverOperations = 0;
jest.mock("@/lib/api/typed-client", () => ({
  buildPath: (p: string, params: Record<string, string>) =>
    p.replace(/\{(\w+)\}/g, (_m, k: string) => params[k]),
  apiGet: async () => ({ data: { operation_count: serverOperations, operations: [] } }),
}));
let userMessages: Array<{ role: string; content: unknown }> = [];
/** Resume outcomes in order: "fail" rejects as an unwritten row, "hang" never settles. */
let resumePlan: Array<"ok" | "fail" | "hold"> = [];
let releaseHeld: (() => void) | null = null;
/** What the last resume left in the store: the real thunk FULFILLS on an unwritten row and records
 *  a hydration failure instead (load-conversation.thunk, expectMaterialized). */
let hydrationFailure: string | null = null;
const dispatch = jest.fn((action: unknown) => {
  const a = action as { type?: string };
  if (a?.type === "resume") {
    const outcome = resumePlan.shift() ?? "ok";
    return {
      unwrap: async () => {
        if (outcome === "hold") await new Promise<void>((r) => (releaseHeld = r));
        hydrationFailure = outcome === "fail" ? "not readable" : null;
        return {
          conversationId: (a as { args: { conversationId: string } }).args.conversationId,
        };
      },
    };
  }
  return action;
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppStore: () => ({ getState: () => ({ chatRoute: {} }) }),
  // The Director's composer reads `chatRoute.composerMode`; an empty route state is the default.
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ chatRoute: {} }),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({
    selectIsExecuting: () => () => executing,
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({
    selectIsCacheOnly: () => () => cacheOnly,
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectMessageCount: () => () => messageCount,
    selectConversationMessages: () => () => userMessages,
    selectMessagesHydrationFailure: () => () => hydrationFailure,
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice",
  () => ({
    setContextEntries: (p: unknown) => ({ type: "ctx", p }),
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice",
  () => ({
    setUserInputText: (p: unknown) => ({ type: "input", p }),
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    smartExecute: (p: unknown) => ({ type: "exec", p }),
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/components/shared/AgentConversationColumn",
  () => ({
    AgentConversationColumn: ({
      conversationId,
    }: {
      conversationId: string;
    }) => <div data-testid="column">{conversationId}</div>,
  }),
);
jest.mock("../director-context", () => ({
  PR_BRAND_CONTEXT_KEY: "pr_brand_context",
  DIRECTOR_CONVERSATION_PARAM: "director",
  DIRECTOR_ASK_PARAM: "ask",
  PR_BRAND_CONTEXT_LABEL: "ctx",
  PR_DIRECTOR_MANDATE_KEY: "seo.press_strategist",
  bindConversationToBrand: async () => null,
  prBrandContextValue: () => ({}),
}));

import { PrDirectorPanel } from "../PrDirectorPanel";

// jsdom has no ResizeObserver; the composer measures its panel with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
  launchMandate.mockClear();
  resumeCalls.length = 0;
  messageCount = 0;
  executing = false;
  cacheOnly = false;
  serverOperations = 0;
  userMessages = [];
  sessionStorage.clear();
  resumePlan = [];
  hydrationFailure = null;
  window.history.replaceState(null, "", "/marketing/brand-1/pr");
});

let root: ReturnType<typeof createRoot>;
async function mount(organizationId = "org-1") {
  await act(async () => {
    const host = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      <PrDirectorPanel brandId="brand-1" brandName="Brand" organizationId={organizationId} />,
    );
  });
}

test("a reload that carries ?director= reopens that conversation instead of starting a new one", async () => {
  window.history.replaceState(
    null,
    "",
    "/marketing/brand-1/pr?director=live-conv",
  );
  await mount();
  expect(launchMandate).not.toHaveBeenCalled();
  expect(resumeCalls).toEqual([
    expect.objectContaining({
      conversationId: "live-conv",
      surfaceKey: "pr-director:brand-1",
    }),
  ]);
  expect(document.querySelector('[data-testid="column"]')?.textContent).toBe(
    "live-conv",
  );
});

test("once a turn is sent, the conversation id is written to the URL so a reload can find it", async () => {
  messageCount = 1;
  executing = true;
  await mount();
  expect(launchMandate).toHaveBeenCalledTimes(1);
  expect(new URL(window.location.href).searchParams.get("director")).toBe(
    "fresh-conv",
  );
});

test("an untouched Director does not pin an empty conversation into the URL", async () => {
  await mount();
  expect(new URL(window.location.href).searchParams.get("director")).toBeNull();
});

test("a question handed over as ?ask= is sent once in a fresh conversation and leaves the URL", async () => {
  window.history.replaceState(null, "", "/marketing/brand-1/pr?ask=Draft%20angles%20for%20X");
  dispatch.mockClear();
  await mount();
  expect(launchMandate).toHaveBeenCalledTimes(1);
  expect(resumeCalls).toEqual([]);
  const types = dispatch.mock.calls.map((c) => (c[0] as { type?: string }).type);
  expect(types).toContain("input");
  expect(types.filter((t) => t === "exec")).toHaveLength(1);
  const input = dispatch.mock.calls.find((c) => (c[0] as { type?: string }).type === "input")?.[0] as {
    p: { text: string };
  };
  expect(input.p.text).toBe("Draft angles for X");
  expect(new URL(window.location.href).searchParams.get("ask")).toBeNull();
});

test("a reload whose URL still carries an already-sent ?ask= beside ?director= reopens, never re-sends", async () => {
  window.history.replaceState(null, "", "/marketing/brand-1/pr?ask=Draft%20angles&director=live-conv");
  dispatch.mockClear();
  await mount();
  expect(launchMandate).not.toHaveBeenCalled();
  expect(resumeCalls).toEqual([expect.objectContaining({ conversationId: "live-conv" })]);
  const types = dispatch.mock.calls.map((c) => (c[0] as { type?: string }).type);
  expect(types).not.toContain("exec");
  expect(new URL(window.location.href).searchParams.get("ask")).toBeNull();
});


/*
 * Walk 2026-10-05 (independent, commit c5c632fbad): a reload mid-answer stuck on "Opening your
 * PR director…" or "Couldn't load this conversation", and Try again did nothing. Three causes:
 *  1. the open was cancelled by ANY re-render that changed the effect's inputs (the launcher's
 *     identity, the organization arriving), and a ref guard then refused to open again;
 *  2. the id was pinned to the URL the moment a run STARTED, before the server had written the
 *     conversation row — a reload in that window asked for a row that did not exist yet;
 *  3. one failed read was final.
 */

test("a re-render while the conversation is opening does not strand the panel", async () => {
  window.history.replaceState(null, "", "/marketing/brand-1/pr?director=live-conv");
  resumePlan = ["hold"];
  await act(async () => {
    const host = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<PrDirectorPanel brandId="brand-1" brandName="Brand" organizationId="org-1" />);
  });
  // The organization context lands a moment later, as it does on a cold reload.
  await act(async () => {
    root.render(<PrDirectorPanel brandId="brand-1" brandName="Brand" organizationId="org-2" />);
  });
  await act(async () => {
    releaseHeld?.();
  });
  expect(document.querySelector('[data-testid="column"]')?.textContent).toBe("live-conv");
  expect(launchMandate).not.toHaveBeenCalled();
});

/*
 * Final walk 2026-10-05 (1280px, headless): a reload in the first second after sending showed an
 * empty welcome screen and the question was gone — the id waited for the server's row before it
 * rode the URL, so a reload in that window found nothing to reopen. A sent question must survive a
 * reload at ANY moment: the id (minted on this client, adopted by the server) is pinned the moment
 * a turn is sent, the question is kept on this tab until the server confirms the row, and a
 * reopen that never finds the row re-sends that question under the same id — once.
 */

test("the moment a turn is sent, its id rides the URL and the question is kept until confirmed", async () => {
  executing = true;
  messageCount = 1;
  cacheOnly = true; // the server has not written the row yet
  userMessages = [{ role: "user", content: [{ type: "text", text: "What should we do first?" }] }];
  await mount();
  expect(new URL(window.location.href).searchParams.get("director")).toBe("fresh-conv");
  expect(sessionStorage.getItem("matrx.pr.director.pending.fresh-conv")).toBe("What should we do first?");
});

test("once the server confirms the row, the kept question is let go", async () => {
  executing = true;
  messageCount = 1;
  cacheOnly = false;
  sessionStorage.setItem("matrx.pr.director.pending.fresh-conv", "What should we do first?");
  await mount();
  expect(sessionStorage.getItem("matrx.pr.director.pending.fresh-conv")).toBeNull();
});

test("a reload before the row existed re-sends the kept question under the same id, once", async () => {
  jest.useFakeTimers();
  try {
    window.history.replaceState(null, "", "/marketing/brand-1/pr?director=early-conv");
    sessionStorage.setItem("matrx.pr.director.pending.early-conv", "What should we do first?");
    resumePlan = ["fail", "fail", "fail", "fail", "fail", "fail", "fail"];
    dispatch.mockClear();
    await mount();
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
    }
    expect(launchMandate).toHaveBeenCalledWith(
      "seo.press_strategist",
      expect.objectContaining({ conversationId: "early-conv" }),
    );
    const sent = dispatch.mock.calls
      .map((c) => c[0] as { type?: string; p?: { text?: string } })
      .filter((a) => a.type === "input");
    expect(sent.map((a) => a.p?.text)).toEqual(["What should we do first?"]);
    expect(dispatch.mock.calls.filter((c) => (c[0] as { type?: string }).type === "exec")).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});

test("a row that is not there yet is retried until it is", async () => {
  jest.useFakeTimers();
  try {
    window.history.replaceState(null, "", "/marketing/brand-1/pr?director=live-conv");
    resumePlan = ["fail", "fail", "ok"];
    await mount();
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
    }
    expect(resumeCalls).toHaveLength(3);
    expect(document.querySelector('[data-testid="column"]')?.textContent).toBe("live-conv");
  } finally {
    jest.useRealTimers();
  }
});


/*
 * Final headless walk (0.5 s): the reload found an EMPTY conversation row (the id is reserved at
 * launch) and showed the welcome screen with no error and no question. An empty row with no server
 * operation means the turn never reached the server: the kept question is sent again, once. An
 * empty row the server IS working on is left to reconnect — never sent twice.
 */
test("an empty row the server never worked on gets the kept question again, once", async () => {
  window.history.replaceState(null, "", "/marketing/brand-1/pr?director=reserved-conv");
  sessionStorage.setItem("matrx.pr.director.pending.reserved-conv", "What should we do first?");
  dispatch.mockClear();
  await mount();
  await act(async () => {});
  const inputs = dispatch.mock.calls
    .map((c) => c[0] as { type?: string; p?: { text?: string } })
    .filter((a) => a.type === "input");
  expect(inputs.map((a) => a.p?.text)).toEqual(["What should we do first?"]);
  expect(dispatch.mock.calls.filter((c) => (c[0] as { type?: string }).type === "exec")).toHaveLength(1);
});

test("an empty row the server is still working on is never sent twice", async () => {
  window.history.replaceState(null, "", "/marketing/brand-1/pr?director=busy-conv");
  sessionStorage.setItem("matrx.pr.director.pending.busy-conv", "What should we do first?");
  serverOperations = 1;
  dispatch.mockClear();
  await mount();
  await act(async () => {});
  expect(dispatch.mock.calls.filter((c) => (c[0] as { type?: string }).type === "exec")).toHaveLength(0);
});
