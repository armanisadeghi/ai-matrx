/**
 * @jest-environment jsdom
 *
 * Defect (2026-10-01, Chat History window): searching "Okafor" showed only the
 * matches inside the ~30 conversations already loaded, so "Okafor Retainer
 * Confirmation Draft" (79 conversations further back, in another organization)
 * never appeared — while the /chat sidebar, which asks the server, found it.
 * The dense variant (Chat History window, board chat picker, every workspace
 * rail) filtered the cached page only.
 *
 * Law: a search box answers from everything the person can see — every
 * organization, the whole library — never from what happens to be cached.
 * This renders the dense sidebar with a cache that does NOT contain the
 * conversation and requires the server's answer to be shown.
 */
import React, { act } from "react";
import { gitGrepFiles } from "./chat-source";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RETAINER = {
  id: "7d2a8437-1995-4b03-829d-5ed4aa7be307",
  title: "Okafor Retainer Confirmation Draft",
  description: null,
  status: "active",
  message_count: 6,
  is_favorite: false,
  exclude_from_kg: false,
  initial_agent_id: null,
  last_model_id: null,
  source_app: "matrx-frontend",
  source_feature: "chat",
  origin_class: "human",
  created_at: "2026-10-01T12:10:54Z",
  updated_at: "2026-10-01T12:11:50Z",
  last_activity_at: "2026-10-01T12:11:50Z",
  total_count: 1,
};

const CACHED_PAGE = [
  {
    id: "e736c798-6e12-4b4f-841a-50a6827b9ce6",
    title: "Persian: 7:30 side gate meeting",
    description: null,
    status: "active",
    message_count: 6,
    initial_agent_id: null,
    last_model_id: null,
    source_app: "matrx-frontend",
    source_feature: "notes",
    origin_class: "human",
    created_at: "2026-10-01T16:08:27Z",
    updated_at: "2026-10-01T16:10:04Z",
    exclude_from_kg: false,
  },
];

const mockRpcCalls: Array<{ name: string; args: unknown }> = [];

jest.mock("@ai-matrx/chat/host/db", () => {
  const page = { data: CACHED_PAGE, error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    "select", "is", "eq", "neq", "in", "not", "or", "order", "range",
    "limit", "gte", "lte", "filter", "match", "abortSignal",
  ]) {
    chain[m] = jest.fn(self);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(page).then(resolve, reject);
  const rpc = jest.fn((name: string, args: unknown) => {
    mockRpcCalls.push({ name, args });
    const result =
      name === "cx_search_conversations"
        ? { data: [RETAINER], error: null }
        : { data: [], error: null };
    const builder: Record<string, unknown> = {
      abortSignal: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  });
  const client = {
    schema: () => ({ from: () => chain }),
    from: () => chain,
    rpc,
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => undefined,
  };
  return { supabase: client, createClient: () => client };
});

// The identity seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("@ai-matrx/chat/host/identity", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  getUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
  requireUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
}))(),
  };
  const moved = ["selectUserId","selectIsAuthenticated","selectIsAdmin","selectIsSuperAdmin","getUserId","requireUserId","NotAuthenticatedError","isNotAuthenticatedError","hasBrowserSession"];
  return {
    ...jest.requireActual("@ai-matrx/chat/host/identity"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@ai-matrx/design-system";
import { ConversationHistorySidebar } from "@ai-matrx/chat/agents/components/conversation-history/ConversationHistorySidebar";

async function flush(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

// The suite's db mock reads consts declared above, so the host registers once they exist (not hoisted
// ahead of them like an import): the same shared helper, loaded in beforeAll.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/__tests__/helpers/register-chat-host");
});

describe("dense conversation history search", () => {
  it("shows a conversation outside the loaded page (other org, older) from the server search", async () => {
    const store = makeStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Provider store={store}>
          <TooltipProvider>
          <ConversationHistorySidebar
            variant="dense"
            scopeId="test-history-window"
            agentIds={[]}
            onOpenConversation={() => undefined}
            openInPlace
          />
          </TooltipProvider>
        </Provider>,
      );
    });
    await flush(20);
    expect(host.textContent).toContain("Persian: 7:30 side gate meeting");

    const input = host.querySelector(
      'input[aria-label="Search conversations"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "Okafor");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush(600);

    expect(host.textContent).toContain("Okafor Retainer Confirmation Draft");
    const search = mockRpcCalls.find((c) => c.name === "cx_search_conversations");
    expect(search).toBeDefined();
    // Never narrowed by organization: the RPC carries no org argument at all.
    expect(Object.keys(search!.args as object).some((k) => /org/i.test(k))).toBe(false);
    await act(async () => root.unmount());
  });
});

/**
 * Class guard: any surface that types into a conversation-history search term
 * must also mount the server search — otherwise its box filters only the
 * cached page (the defect above). Fails naming the file.
 */
describe("every conversation-history search box asks the server", () => {
  it("pairs setScopeSearch with useConversationServerSearch in every caller", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const root = path.resolve(__dirname, "../../..");
    // The app's files and @ai-matrx/chat's source (the aidream checkout beside this repo), one list.
    const files = gitGrepFiles(
      ["-e", "setScopeSearch("],
      ["*.ts", "*.tsx", ":!**/__tests__/**"],
      ["*.ts", "*.tsx", ":!**/__tests__/**", ":!agents/redux/conversation-history/slice.ts"],
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      return !src.includes("useConversationServerSearch(");
    });
    expect(offenders).toEqual([]);
  });
});
