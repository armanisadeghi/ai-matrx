/** @jest-environment node */

/**
 * POST /api/extension/append-message — the extension's write into a user's
 * conversation.
 *
 * SUT: the route handler. It OWNS: who the caller is (cookie session first,
 * Supabase bearer token second, nobody otherwise), that every read and the
 * write run as THAT caller (so RLS gates them), refusing malformed input and
 * unseen conversations before writing, the next position (max live position
 * + 1), and the exact chat.message row it inserts.
 *
 * Real here: the route, `@/features/public-chat/services/cx-chat`, and
 * supabase-js itself. The only double is the network: `fetch` is answered by
 * a small fake Supabase (Auth `/auth/v1/user` + PostgREST), which records
 * every request so the tests assert on the query emitted and the row body
 * actually sent. `@/utils/supabase/server` is replaced because Next's cookie
 * store only exists inside a real request scope; its stand-in is a real
 * supabase-js client holding the stored browser session.
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type {
  CxConversation,
  CxMessage,
} from "@/features/public-chat/types/cx-tables";
import type { Database } from "@/types/database.types";
import { createClient as createServerClient } from "@/utils/supabase/server";

import { POST } from "./route";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ORG = "22222222-2222-4222-8222-222222222222";
const BEARER_USER = "44444444-4444-4444-8444-444444444444";
const COOKIE_USER = "55555555-5555-4555-8555-555555555555";
const EXTENSION_TOKEN = "extension-supabase-access-token";
const COOKIE_TOKEN = "browser-cookie-session-access-token";
const AGENT_ID = "66666666-6666-4666-8666-666666666666";

const conversationRow = {
  app_instance_id: null,
  cache_state: {},
  config: {},
  conversation_type: "chat",
  created_at: "2026-08-08T17:00:00.000Z",
  created_by: BEARER_USER,
  deleted_at: null,
  description: null,
  exclude_from_kg: false,
  forked_at_position: null,
  forked_from_id: null,
  id: CONVERSATION_ID,
  initial_agent_id: null,
  initial_agent_version_id: null,
  is_ephemeral: false,
  is_favorite: false,
  keywords: null,
  last_context_breakdown: null,
  last_model_id: null,
  last_request_id: null,
  last_request_status: null,
  message_count: 5,
  metadata: {},
  organization_id: CONVERSATION_ORG,
  origin_class: "user",
  overrides: {},
  parent_conversation_id: null,
  sandbox_instance_id: null,
  source_app: "matrx-extend",
  source_feature: "extension",
  status: "active",
  system_instruction: null,
  task_id: null,
  title: "Bridge contract",
  updated_at: "2026-08-08T17:30:00.000Z",
  updated_by: null,
  variables: {},
  version: 1,
  visibility: "private",
} satisfies CxConversation;

const storedMessageRow = {
  agent_id: null,
  content: [{ type: "text", text: "bridge contract test" }],
  content_chars: 20,
  content_history: null,
  conversation_id: CONVERSATION_ID,
  created_at: "2026-08-08T18:00:00.000Z",
  created_by: BEARER_USER,
  deleted_at: null,
  error: null,
  id: "33333333-3333-4333-8333-333333333333",
  is_visible_to_model: true,
  is_visible_to_user: true,
  metadata: {},
  model_context: null,
  organization_id: CONVERSATION_ORG,
  position: 5,
  role: "user",
  source: "extension",
  status: "active",
  tool_results_chars: 0,
  tools_on_call: null,
  updated_at: "2026-08-08T18:00:00.000Z",
  updated_by: null,
  user_content: null,
  version: 1,
  voice: null,
} satisfies CxMessage;

// ---------------------------------------------------------------------------
// Fake Supabase — answers what the real services ask, records every request.
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string;
  url: URL;
  authorization: string | null;
  contentProfile: string | null;
  body: string | null;
}

interface FakeSupabase {
  requests: RecordedRequest[];
  /** Access tokens Auth accepts, and the user each one belongs to. */
  users: Map<string, string>;
  /** The conversation RLS lets the caller see, or null. */
  conversation: CxConversation | null;
  /** Highest live position in the conversation, or null when empty. */
  lastPosition: number | null;
  /** Row PostgREST returns for an accepted insert, or null to refuse it (RLS). */
  insertReturns: CxMessage | null;
}

let backend: FakeSupabase;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function answer(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization");
  backend.requests.push({
    method: request.method,
    url,
    authorization,
    contentProfile: request.headers.get("content-profile"),
    body: request.method === "GET" ? null : await request.text(),
  });
  const token = authorization?.replace(/^Bearer /, "") ?? "";
  const userId = backend.users.get(token);

  if (url.pathname === "/auth/v1/user") {
    return userId
      ? json(200, {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-08-01T00:00:00.000Z",
        })
      : json(403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (!userId) {
    return json(401, { code: "PGRST301", message: "JWT invalid", details: null, hint: null });
  }
  if (url.pathname === "/rest/v1/conversation" && request.method === "GET") {
    return backend.conversation
      ? json(200, backend.conversation)
      : json(406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: "The result contains 0 rows",
          hint: null,
        });
  }
  if (url.pathname === "/rest/v1/message" && request.method === "GET") {
    return json(
      200,
      backend.lastPosition === null ? [] : [{ position: backend.lastPosition }],
    );
  }
  if (url.pathname === "/rest/v1/message" && request.method === "POST") {
    return backend.insertReturns
      ? json(201, backend.insertReturns)
      : json(403, {
          code: "42501",
          message: 'new row violates row-level security policy for table "message"',
          details: null,
          hint: null,
        });
  }
  return json(404, { message: `unrouted ${request.method} ${url.pathname}` });
}

function restRequests(): RecordedRequest[] {
  return backend.requests.filter((r) => r.url.pathname.startsWith("/rest/v1/"));
}

function messageInserts(): RecordedRequest[] {
  return backend.requests.filter(
    (r) => r.method === "POST" && r.url.pathname === "/rest/v1/message",
  );
}

function insertedRow(): unknown {
  const inserts = messageInserts();
  expect(inserts).toHaveLength(1);
  return JSON.parse(inserts[0]?.body ?? "null");
}

/** The client the cookie door yields: a real client, with or without a stored browser session. */
function cookieClient(sessionAccessToken: string | null) {
  const storageKey = "sb-append-message-test-auth-token";
  const session =
    sessionAccessToken === null
      ? null
      : JSON.stringify({
          access_token: sessionAccessToken,
          refresh_token: "browser-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: COOKIE_USER,
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-08-01T00:00:00.000Z",
          },
        });
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key: string) => (key === storageKey ? session : null),
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  });
}

function appendRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    "https://demos.aimatrx.com/api/extension/append-message",
    { method: "POST", headers, body: JSON.stringify(body) },
  );
}

const basicAppend = {
  conversationId: CONVERSATION_ID,
  role: "user",
  content: "bridge contract test",
};

/** The route must answer every request — a thrown handler is a 500 page, not an API reply. */
async function respond(request: NextRequest): Promise<Response> {
  let thrown: unknown = null;
  const response = await POST(request).catch((error: unknown) => {
    thrown = error;
    return null;
  });
  expect(thrown).toBeNull();
  if (response === null) throw new Error("route threw");
  return response;
}

describe("POST /api/extension/append-message", () => {
  beforeEach(() => {
    backend = {
      requests: [],
      users: new Map([
        [EXTENSION_TOKEN, BEARER_USER],
        [COOKIE_TOKEN, COOKIE_USER],
      ]),
      conversation: conversationRow,
      lastPosition: 4,
      insertReturns: storedMessageRow,
    };
    jest.spyOn(globalThis, "fetch").mockImplementation(answer);
    jest.mocked(createServerClient).mockResolvedValue(cookieClient(null));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("inserts the next-position message under the conversation's organization, as the bearer caller", async () => {
    const response = await respond(
      appendRequest(basicAppend, { Authorization: `Bearer ${EXTENSION_TOKEN}` }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: {
        id: "33333333-3333-4333-8333-333333333333",
        conversationId: CONVERSATION_ID,
        role: "user",
        content: [{ type: "text", text: "bridge contract test" }],
        metadata: {},
        position: 5,
        source: "extension",
        agentId: null,
        createdAt: "2026-08-08T18:00:00.000Z",
      },
    });
    expect(insertedRow()).toEqual({
      conversation_id: CONVERSATION_ID,
      organization_id: CONVERSATION_ORG,
      role: "user",
      position: 5,
      content: [{ type: "text", text: "bridge contract test" }],
      metadata: {},
      source: "extension",
      agent_id: null,
    });
    const [insert] = messageInserts();
    expect(insert?.authorization).toBe(`Bearer ${EXTENSION_TOKEN}`);
    expect(insert?.contentProfile).toBe("chat");
    expect(
      restRequests().every((r) => r.authorization === `Bearer ${EXTENSION_TOKEN}`),
    ).toBe(true);
  });

  it("numbers the next message from live messages only, starting an empty conversation at 0", async () => {
    backend.lastPosition = null;

    await respond(
      appendRequest(basicAppend, { Authorization: `Bearer ${EXTENSION_TOKEN}` }),
    );

    const positionLookup = backend.requests.find(
      (r) => r.method === "GET" && r.url.pathname === "/rest/v1/message",
    );
    expect(positionLookup?.url.searchParams.get("conversation_id")).toBe(
      `eq.${CONVERSATION_ID}`,
    );
    expect(positionLookup?.url.searchParams.get("deleted_at")).toBe("is.null");
    expect(positionLookup?.url.searchParams.get("order")).toBe("position.desc");
    expect(positionLookup?.url.searchParams.get("limit")).toBe("1");
    expect(insertedRow()).toMatchObject({ position: 0 });
  });

  it("stores the caller-declared source, agent, metadata, and content blocks unchanged", async () => {
    await respond(
      appendRequest(
        {
          conversationId: CONVERSATION_ID,
          role: "assistant",
          content: [{ type: "text", text: "agenda item done" }],
          metadata: { agendaRunId: "run-7" },
          source: "extension-agenda",
          agentId: AGENT_ID,
        },
        { Authorization: `Bearer ${EXTENSION_TOKEN}` },
      ),
    );

    expect(insertedRow()).toEqual({
      conversation_id: CONVERSATION_ID,
      organization_id: CONVERSATION_ORG,
      role: "assistant",
      position: 5,
      content: [{ type: "text", text: "agenda item done" }],
      metadata: { agendaRunId: "run-7" },
      source: "extension-agenda",
      agent_id: AGENT_ID,
    });
  });

  it("writes as the browser cookie session even when a bearer token is also present", async () => {
    jest.mocked(createServerClient).mockResolvedValue(cookieClient(COOKIE_TOKEN));

    const response = await respond(
      appendRequest(basicAppend, { Authorization: `Bearer ${EXTENSION_TOKEN}` }),
    );

    expect(response.status).toBe(200);
    expect(messageInserts()[0]?.authorization).toBe(`Bearer ${COOKIE_TOKEN}`);
    expect(
      backend.requests.some((r) => r.authorization === `Bearer ${EXTENSION_TOKEN}`),
    ).toBe(false);
  });

  it("refuses an invalid bearer token without reading or writing conversation data", async () => {
    const response = await respond(
      appendRequest(basicAppend, { Authorization: "Bearer revoked-token" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(restRequests()).toEqual([]);
  });

  it("refuses a caller with neither a session nor a bearer token", async () => {
    const response = await respond(appendRequest(basicAppend));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(restRequests()).toEqual([]);
  });

  it("rejects a malformed append before touching the conversation", async () => {
    const response = await respond(
      appendRequest(
        { ...basicAppend, conversationId: "not-a-conversation-id" },
        { Authorization: `Bearer ${EXTENSION_TOKEN}` },
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "invalid_request",
    });
    expect(restRequests()).toEqual([]);
  });

  it("answers conversation_not_found without writing when RLS hides the conversation", async () => {
    backend.conversation = null;

    const response = await respond(
      appendRequest(basicAppend, { Authorization: `Bearer ${EXTENSION_TOKEN}` }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "conversation_not_found",
    });
    expect(messageInserts()).toEqual([]);
  });

  it("answers insert_failed when the database refuses the write", async () => {
    backend.insertReturns = null;

    const response = await respond(
      appendRequest(basicAppend, { Authorization: `Bearer ${EXTENSION_TOKEN}` }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "insert_failed" });
  });
});
