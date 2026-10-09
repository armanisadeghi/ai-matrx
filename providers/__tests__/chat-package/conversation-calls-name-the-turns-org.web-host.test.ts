/**
 * THE ORG RULE + THE CONVERSATION DOOR in THIS app's host (the web twin of the package's
 * `conversation-calls-name-the-turns-org.test.ts`, which proves it on a bare host).
 *
 * The chat package runs this app's own server client (`lib/api/chat-server-api.ts`: the server
 * selection, endpoint overrides, the admin lane, the transport) and this app's header port
 * (`providers/ChatHostAdapter.tsx` → the package's one header builder). A persisted conversation
 * in one organization, the person's active workspace switched to ANOTHER: the turn's target and
 * every call beside it on the same conversation — inbox enqueue, pending calls (a load's read),
 * memory cost, cancel — must reach the same server with the same bearer and name the
 * conversation's organization. Before 2026-10-08 the inbox / pending calls / cancel rode the
 * app's general `callApi` / session transport and named the tab's organization.
 */

import { configureStore } from "@reduxjs/toolkit";
import { chatReducers } from "@ai-matrx/chat/store/slices";
import { configureChat, _resetChatHostForTests } from "@ai-matrx/chat/host/configure";
import { syncChatHostIfUnsynced } from "@ai-matrx/chat/store/chat-host-sync";
import { createFakeDb } from "@ai-matrx/chat/testing/fake-db";
import { chatRequestHeaders } from "@ai-matrx/chat/host/request-headers";
import { getChatHost } from "@ai-matrx/chat/host/configure";
import { resolveBackendForConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/resolve-base-url";
import {
  callConversationApi,
  cancelConversationRun,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/call-conversation-api";
import { enqueueInboxMessage } from "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox.thunks";
import { fetchConversationPendingCalls } from "@ai-matrx/chat/agents/api/fetch-pending-calls";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import type { ChatIdentity } from "@ai-matrx/chat/host/contract";
import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import { appChatServerApi } from "@/lib/api/chat-server-api";

const CONV = "0b6f3c2e-7d41-4a8e-9c15-2e8f4a6d1b73";
const CONVERSATION_ORG = "6d2a8f14-3c9b-4e7a-b051-7e4c2d9a8f36";
const ACTIVE_ORG = "9e1c4b72-58a3-4f06-8d2e-1b7a6c3f5e90";
const TOKEN = "jwt-for-priya";

const identity: ChatIdentity = {
  userId: "5f0c1e7a-3b52-4b8e-9a41-2d6f8c0e9b13",
  isAuthenticated: true,
  adminLevel: null,
  email: "priya.raman@harborlightdental.com",
  displayName: "Priya Raman",
  avatarUrl: null,
  accessToken: TOKEN,
  authReady: true,
  fingerprintId: null,
  name: "Priya Raman",
  preferredUsername: null,
  picture: null,
};

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
}

describe("in this app's host, every call on a conversation names the turn's organization", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    _resetChatHostForTests();
  });

  it("turn target, inbox, pending calls, memory cost and cancel carry the same server, bearer and org", async () => {
    const activeOrg = { id: ACTIVE_ORG, name: "Northside Orthodontics" };
    configureChat({
      db: createFakeDb().db,
      identity: {
        current: () => identity,
        subscribe: () => () => undefined,
        getAccessToken: async () => TOKEN,
      },
      org: {
        active: () => activeOrg,
        subscribe: () => () => undefined,
        require: async () => ACTIVE_ORG,
      },
      server: {
        baseUrl: () => "https://server.app.matrxserver.com",
        // What ChatHostAdapter passes: the package's one header builder.
        headers: async () => chatRequestHeaders({ accessToken: TOKEN, fingerprintId: null }, ACTIVE_ORG),
        api: appChatServerApi as never,
      },
    });

    const store = configureStore({
      reducer: { ...chatReducers, apiConfig: apiConfigReducer },
      middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
    });
    syncChatHostIfUnsynced(store as never, getChatHost());
    // A persisted conversation in its own organization.
    const base = store.getState() as unknown as ChatRootState;
    const seeded = {
      ...base,
      conversations: {
        ...base.conversations,
        byConversationId: {
          [CONV]: { conversationId: CONV, organizationId: CONVERSATION_ORG, cacheOnly: false, status: "ready" },
        },
      },
    } as unknown as ChatRootState;
    const getState = () => seeded;
    const dispatch = ((action: unknown) =>
      typeof action === "function"
        ? (action as (d: unknown, g: unknown, e: unknown) => unknown)(dispatch, getState, undefined)
        : store.dispatch(action as never)) as unknown as ChatDispatch;

    const captured: Captured[] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      captured.push({ url: u, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      const body = /\/inbox$/.test(u)
        ? { injection_id: "inj-1", run_active: true }
        : /\/ai\/cancel\//.test(u)
          ? { request_id: "req-live", status: "cancelled" }
          : /pending_calls/.test(u)
            ? []
            : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    // The turn: runAiStream POSTs to this target with exactly these headers.
    const turn = resolveBackendForConversation(seeded, CONV);
    expect(turn?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "X-Organization-Id": CONVERSATION_ORG });

    await dispatch(enqueueInboxMessage({ conversationId: CONV, text: "Also check the Bellevue office." }) as never);
    const r1 = await dispatch(fetchConversationPendingCalls(CONV) as never);
    const r2 = await dispatch(callConversationApi(CONV, { path: "/ai/conversations/{conversation_id}/memory_cost", method: "GET" }) as never);
    const r3 = await dispatch(cancelConversationRun(CONV, "req-live", "cancel", 7) as never);
    expect({ r1, r2, r3 }).toEqual({ r1: [], r2: expect.objectContaining({ data: {} }), r3: expect.objectContaining({ data: expect.objectContaining({ request_id: "req-live" }) }) });

    expect(captured.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `POST /ai/conversations/${CONV}/inbox`,
      `GET /ai/conversation/${CONV}/pending_calls`,
      `GET /ai/conversations/${CONV}/memory_cost`,
      `POST /ai/cancel/req-live`,
    ]);
    for (const call of captured) {
      expect({ url: call.url, origin: new URL(call.url).origin }).toEqual({ url: call.url, origin: turn!.baseUrl });
      expect({ url: call.url, auth: call.headers["authorization"] }).toEqual({ url: call.url, auth: `Bearer ${TOKEN}` });
      expect({ url: call.url, org: call.headers["x-organization-id"] }).toEqual({ url: call.url, org: CONVERSATION_ORG });
    }
  });
});
