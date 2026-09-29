/**
 * @jest-environment node
 */
/**
 * utils/permissions/service.ts — the record's row controls (getResourceVisibility,
 * makePublic, makePrivate, setResourceShownTo): "Published to the web" and "Shown to"
 * (access ladder Words table, T-13 phase 5). The retiring row column is never read or written.
 *
 * Security-relevant: a write that publishes, or lands on a row other than the one the
 * person chose, must turn this suite red.
 *
 * The Supabase client is REAL (supabase-js + postgrest-js), and so are the
 * capability decoder (`getShareCapabilities`) and the resource registry. Only
 * the network is replaced — by a recorder — so every assertion is on the
 * PostgREST request the service actually emits: which RPC, which schema
 * profile + table, the id filter, and the exact column/value written.
 *
 * Capability payloads marked CAPTURED are live results of
 * `select public.get_share_capabilities('<type>')` (2026-09-28, the row-control keys only).
 * The boolean payload is the RPC's boolean contract shape, kept because the service owns that branch.
 */
import type { Json } from "@/types/database.types";

interface RecordedRequest {
  method: string;
  path: string;
  profile: string | null;
  body: string | null;
}
interface Reply {
  status: number;
  json: Json;
}

const mockRequests: RecordedRequest[] = [];
const mockReplies: Reply[] = [];

jest.mock("@/utils/supabase/client", () => {
  const { createClient } = jest.requireActual<
    typeof import("@supabase/supabase-js")
  >("@supabase/supabase-js");
  return {
    supabase: createClient("http://localhost:54321", "sb_publishable_test", {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const url = new URL(
            input instanceof URL
              ? input.href
              : typeof input === "string"
                ? input
                : input.url,
          );
          const headers = new Headers(init?.headers);
          mockRequests.push({
            method: init?.method ?? "GET",
            path: decodeURIComponent(url.pathname + url.search),
            profile:
              headers.get("accept-profile") ?? headers.get("content-profile"),
            body: typeof init?.body === "string" ? init.body : null,
          });
          const reply = mockReplies.shift();
          if (!reply) {
            throw new Error(
              `No reply queued for ${init?.method ?? "GET"} ${url.pathname}${url.search}`,
            );
          }
          return new Response(JSON.stringify(reply.json), {
            status: reply.status,
            headers: { "content-type": "application/json" },
          });
        },
      },
    }),
  };
});

import {
  getResourceVisibility,
  makePrivate,
  makePublic,
  setResourceShownTo,
} from "../service";

// CAPTURED — an agent: an Organization table whose body is never published; its CARD is.
const AGENT_CAPS = {
  supports_public: true,
  is_link_shareable: true,
  public_state_kind: "enum",
  public_state_column: "card_visibility",
  organization_column: "organization_id",
  table_level: "organization",
  row_controls: true,
  shown_to_offered: true,
  publish_lane: "card",
} satisfies Json;
// CAPTURED — a note: an Organization table with both row controls.
const NOTE_CAPS = {
  supports_public: true,
  is_link_shareable: true,
  public_state_kind: "enum",
  public_state_column: "visibility",
  organization_column: "organization_id",
  table_level: "organization",
  row_controls: true,
  shown_to_offered: true,
  publish_lane: "published_to_web",
} satisfies Json;
// CAPTURED — an AI chat: a Private table. No row control, never published.
const CONVERSATION_CAPS = {
  supports_public: true,
  is_link_shareable: true,
  public_state_kind: "enum",
  public_state_column: "visibility",
  organization_column: "organization_id",
  table_level: "private",
  row_controls: false,
  shown_to_offered: false,
  publish_lane: null,
} satisfies Json;
// The RPC's boolean contract shape.
const BOOLEAN_CAPS = {
  supports_public: true,
  is_link_shareable: false,
  public_state_kind: "boolean",
  public_state_column: "is_public",
  table_level: "organization",
  row_controls: false,
  shown_to_offered: false,
  publish_lane: "boolean",
} satisfies Json;

const AGENT_ID = "4fb96afb-0ff0-4a01-92e1-531a14872144";
const NOTE_ID = "6a1d0c2b-3e4f-4a5b-9c6d-7e8f9a0b1c2d";
const CHAT_ID = "c3f6270e-b750-49d0-bcc2-4ea02b39f7b7";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

function capabilitiesRequest(resourceType: string): RecordedRequest {
  return {
    method: "POST",
    path: "/rest/v1/rpc/get_share_capabilities",
    profile: "public",
    body: JSON.stringify({ p_resource_type: resourceType }),
  };
}

const ok = (json: Json): Reply => ({ status: 200, json });

beforeEach(() => {
  mockRequests.length = 0;
  mockReplies.length = 0;
});

describe("getResourceVisibility", () => {
  it("reads published_to_web, shown_to and the home organization of this one row", async () => {
    mockReplies.push(
      ok(NOTE_CAPS),
      ok([{ published_to_web: true, shown_to: "my_team", organization_id: ORG }]),
    );
    await expect(getResourceVisibility("note", NOTE_ID)).resolves.toEqual({
      isPublic: true,
      shownTo: "my_team",
      homeOrganizationId: ORG,
    });
    expect(mockRequests).toEqual([
      capabilitiesRequest("note"),
      {
        method: "GET",
        path: `/rest/v1/notes?select=published_to_web,shown_to,organization_id&id=eq.${NOTE_ID}`,
        profile: "workbench",
        body: null,
      },
    ]);
  });

  it("an agent's publish is its card's", async () => {
    mockReplies.push(
      ok(AGENT_CAPS),
      ok([{ card_visibility: "internal", shown_to: null, organization_id: ORG }]),
    );
    await expect(getResourceVisibility("agent", AGENT_ID)).resolves.toEqual({
      isPublic: false,
      shownTo: null,
      homeOrganizationId: ORG,
    });
    expect(mockRequests[1]?.path).toBe(
      `/rest/v1/definition?select=card_visibility,shown_to,organization_id&id=eq.${AGENT_ID}`,
    );
  });

  it("throws instead of guessing when the row is not visible", async () => {
    mockReplies.push(ok(NOTE_CAPS), ok([]));
    await expect(getResourceVisibility("note", NOTE_ID)).rejects.toThrow(
      "We couldn't check who can open this item.",
    );
  });

  it("a Private chat carries no row control: nothing is read but its organization", async () => {
    mockReplies.push(ok(CONVERSATION_CAPS), ok([{ organization_id: ORG }]));
    await expect(getResourceVisibility("conversation", CHAT_ID)).resolves.toEqual({
      isPublic: false,
      homeOrganizationId: ORG,
    });
    expect(mockRequests[1]?.path).toBe(
      `/rest/v1/conversation?select=organization_id&id=eq.${CHAT_ID}`,
    );
  });
});

describe("makePublic / makePrivate", () => {
  it("publishes exactly this row through published_to_web", async () => {
    mockReplies.push(ok(NOTE_CAPS), ok([{ id: NOTE_ID }]));
    await expect(
      makePublic({ resourceType: "note", resourceId: NOTE_ID }),
    ).resolves.toEqual({ success: true, message: "Published to the web" });
    expect(mockRequests).toEqual([
      capabilitiesRequest("note"),
      {
        method: "PATCH",
        path: `/rest/v1/notes?id=eq.${NOTE_ID}&select=id`,
        profile: "workbench",
        body: JSON.stringify({ published_to_web: true }),
      },
    ]);
  });

  it("stops publishing without touching who in its organization can open it", async () => {
    mockReplies.push(ok(NOTE_CAPS), ok([{ id: NOTE_ID }]));
    await expect(makePrivate("note", NOTE_ID)).resolves.toEqual({
      success: true,
      message: "No longer published to the web",
    });
    expect(mockRequests[1]?.body).toBe(JSON.stringify({ published_to_web: false }));
  });

  it("an agent publishes its card, never its body", async () => {
    mockReplies.push(ok(AGENT_CAPS), ok([{ id: AGENT_ID }]));
    await makePublic({ resourceType: "agent", resourceId: AGENT_ID });
    expect(mockRequests[1]?.body).toBe(JSON.stringify({ card_visibility: "public" }));
  });

  it("refuses to publish a Private chat without writing anything", async () => {
    mockReplies.push(ok(CONVERSATION_CAPS));
    const r = await makePublic({ resourceType: "conversation", resourceId: CHAT_ID });
    expect(r.success).toBe(false);
    expect(r.error).toContain("never published to the web");
    expect(mockRequests).toEqual([capabilitiesRequest("conversation")]);
  });

  it("does not claim success when the write matched no row", async () => {
    mockReplies.push(ok(NOTE_CAPS), ok([]));
    await expect(
      makePublic({ resourceType: "note", resourceId: NOTE_ID }),
    ).resolves.toEqual({
      success: false,
      error: "Couldn't update this item — it may have been deleted or moved.",
    });
  });

  it("routes a boolean-backed type through make_resource_public, never a direct table write", async () => {
    mockReplies.push(ok(BOOLEAN_CAPS), ok({ success: true }));
    await expect(
      makePublic({ resourceType: "note", resourceId: NOTE_ID }),
    ).resolves.toEqual({ success: true, message: "Published to the web" });
    expect(mockRequests[1]).toEqual({
      method: "POST",
      path: "/rest/v1/rpc/make_resource_public",
      profile: "public",
      body: JSON.stringify({ p_resource_type: "note", p_resource_id: NOTE_ID }),
    });
  });
});

describe("setResourceShownTo", () => {
  it.each(["only_me", "my_team", "everyone"] as const)(
    "writes exactly %s to exactly this row",
    async (value) => {
      mockReplies.push(ok(NOTE_CAPS), ok([{ id: NOTE_ID }]));
      await expect(setResourceShownTo("note", NOTE_ID, value)).resolves.toEqual({ success: true });
      expect(mockRequests[1]).toEqual({
        method: "PATCH",
        path: `/rest/v1/notes?id=eq.${NOTE_ID}&select=id`,
        profile: "workbench",
        body: JSON.stringify({ shown_to: value }),
      });
    },
  );

  it("passes a database refusal's own message through instead of a guess", async () => {
    mockReplies.push(ok(NOTE_CAPS), {
      status: 400,
      json: {
        code: "23514",
        details: null,
        hint: null,
        message: "Everyone on AI Matrx is only for a record published to the web",
      },
    });
    await expect(
      setResourceShownTo("note", NOTE_ID, "everyone_on_ai_matrx"),
    ).resolves.toEqual({
      success: false,
      error: "Everyone on AI Matrx is only for a record published to the web",
    });
  });

  it("refuses a Private chat rather than writing a column it does not carry", async () => {
    mockReplies.push(ok(CONVERSATION_CAPS));
    const r = await setResourceShownTo("conversation", CHAT_ID, "everyone");
    expect(r.success).toBe(false);
    expect(mockRequests).toEqual([capabilitiesRequest("conversation")]);
  });
});
