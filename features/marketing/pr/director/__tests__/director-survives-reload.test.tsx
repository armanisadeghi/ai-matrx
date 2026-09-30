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

const launchMandate = jest.fn(async () => ({ conversationId: "fresh-conv" }));
jest.mock("@/features/agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchMandate }),
}));

const resumeCalls: unknown[] = [];
jest.mock(
  "@/features/agents/redux/execution-system/thunks/resume-conversation.thunk",
  () => ({
    resumeConversation: (args: unknown) => {
      resumeCalls.push(args);
      return { type: "resume", args };
    },
  }),
);

let messageCount = 0;
let executing = false;
const dispatch = jest.fn((action: unknown) => {
  const a = action as { type?: string };
  if (a?.type === "resume") {
    return {
      unwrap: async () => ({
        conversationId: (a as { args: { conversationId: string } }).args
          .conversationId,
      }),
    };
  }
  return action;
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel({}),
}));
jest.mock(
  "@/features/agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({
    selectIsExecuting: () => () => executing,
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectMessageCount: () => () => messageCount,
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/instance-context/instance-context.slice",
  () => ({
    setContextEntries: (p: unknown) => ({ type: "ctx", p }),
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice",
  () => ({
    setUserInputText: (p: unknown) => ({ type: "input", p }),
  }),
);
jest.mock(
  "@/features/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    smartExecute: (p: unknown) => ({ type: "exec", p }),
  }),
);
jest.mock(
  "@/features/agents/components/shared/AgentConversationColumn",
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

beforeEach(() => {
  launchMandate.mockClear();
  resumeCalls.length = 0;
  messageCount = 0;
  executing = false;
  window.history.replaceState(null, "", "/marketing/brand-1/pr");
});

async function mount() {
  await act(async () => {
    const host = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(host);
    createRoot(host).render(
      <PrDirectorPanel
        brandId="brand-1"
        brandName="Brand"
        organizationId="org-1"
      />,
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
