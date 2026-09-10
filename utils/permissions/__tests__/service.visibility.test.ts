/**
 * @jest-environment node
 */
/**
 * utils/permissions/service.ts — resource visibility (getResourceVisibility,
 * makePublic, makePrivate, setResourceVisibility).
 *
 * Security-relevant: a write that widens visibility, or lands on a row other
 * than the one the person chose, must turn this suite red.
 *
 * The Supabase client is REAL (supabase-js + postgrest-js), and so are the
 * capability decoder (`getShareCapabilities`) and the resource registry. Only
 * the network is replaced — by a recorder — so every assertion is on the
 * PostgREST request the service actually emits: which RPC, which schema
 * profile + table, the id filter, and the exact column/value written.
 *
 * Capability payloads marked CAPTURED are verbatim live results of
 * `select public.get_share_capabilities('<type>')` (2026-09-10). No registered
 * type is boolean-backed live today; the boolean payload below is the RPC's
 * boolean contract shape, kept because the service still owns that branch.
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
  setResourceVisibility,
} from "../service";

// CAPTURED — agent.card stores its public state in `card_visibility`.
const AGENT_CARD_CAPS = {
  supports_public: true,
  is_link_shareable: true,
  public_state_kind: "enum",
  public_state_column: "card_visibility",
} satisfies Json;
// CAPTURED — workbench.udt_documents uses the canonical `visibility` enum.
const UDT_DOCUMENT_CAPS = {
  supports_public: true,
  is_link_shareable: true,
  public_state_kind: "enum",
  public_state_column: "visibility",
} satisfies Json;
// CAPTURED — web pages are link-shareable but have no public state at all.
const WEB_PAGE_CAPS = {
  supports_public: false,
  is_link_shareable: true,
  public_state_kind: null,
  public_state_column: null,
} satisfies Json;
// The RPC's boolean contract shape (no live type carries it — see header).
const BOOLEAN_CAPS = {
  supports_public: true,
  is_link_shareable: false,
  public_state_kind: "boolean",
  public_state_column: "is_public",
} satisfies Json;

const AGENT_CARD_ID = "4fb96afb-0ff0-4a01-92e1-531a14872144";
const DOC_ID = "d92ff8a4-88f2-4afe-a185-84298397f20e";
const PAGE_ID = "c3f6270e-b750-49d0-bcc2-4ea02b39f7b7";
const NOTE_ID = "6a1d0c2b-3e4f-4a5b-9c6d-7e8f9a0b1c2d";

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
  it("reads only the capability-reported column of this one row, in its own schema", async () => {
    mockReplies.push(ok(AGENT_CARD_CAPS), ok([{ card_visibility: "public" }]));

    await expect(
      getResourceVisibility("agent_card", AGENT_CARD_ID),
    ).resolves.toEqual({ isPublic: true, visibility: "public" });

    expect(mockRequests).toEqual([
      capabilitiesRequest("agent_card"),
      {
        method: "GET",
        path: `/rest/v1/card?select=card_visibility&id=eq.${AGENT_CARD_ID}`,
        profile: "agent",
        body: null,
      },
    ]);
  });

  it.each(["personal", "internal", "link"])(
    "never reports a %s row as public",
    async (level) => {
      mockReplies.push(ok(UDT_DOCUMENT_CAPS), ok([{ visibility: level }]));

      await expect(
        getResourceVisibility("udt_document", DOC_ID),
      ).resolves.toEqual({ isPublic: false, visibility: level });
    },
  );

  it("throws instead of guessing when the row is not visible", async () => {
    mockReplies.push(ok(UDT_DOCUMENT_CAPS), ok([]));

    await expect(getResourceVisibility("udt_document", DOC_ID)).rejects.toThrow(
      "We couldn't check this item's public visibility.",
    );
  });

  it("answers not-public without reading any table for a type with no public state", async () => {
    mockReplies.push(ok(WEB_PAGE_CAPS));

    await expect(getResourceVisibility("web_page", PAGE_ID)).resolves.toEqual({
      isPublic: false,
      visibility: null,
    });
    expect(mockRequests).toEqual([capabilitiesRequest("web_page")]);
  });
});

describe("makePublic", () => {
  it("publishes exactly this row through the capability-reported enum column", async () => {
    mockReplies.push(ok(AGENT_CARD_CAPS), ok([{ id: AGENT_CARD_ID }]));

    await expect(
      makePublic({ resourceType: "agent_card", resourceId: AGENT_CARD_ID }),
    ).resolves.toEqual({ success: true, message: "Resource is now public" });

    expect(mockRequests).toEqual([
      capabilitiesRequest("agent_card"),
      {
        method: "PATCH",
        path: `/rest/v1/card?id=eq.${AGENT_CARD_ID}&select=id`,
        profile: "agent",
        body: JSON.stringify({ card_visibility: "public" }),
      },
    ]);
  });

  it("refuses a type with no public state without writing anything", async () => {
    mockReplies.push(ok(WEB_PAGE_CAPS));

    await expect(
      makePublic({ resourceType: "web_page", resourceId: PAGE_ID }),
    ).resolves.toEqual({
      success: false,
      error: "Public visibility is not available for this item type.",
    });
    expect(mockRequests).toEqual([capabilitiesRequest("web_page")]);
  });

  it("does not claim success when the write matched no row", async () => {
    mockReplies.push(ok(AGENT_CARD_CAPS), ok([]));

    await expect(
      makePublic({ resourceType: "agent_card", resourceId: AGENT_CARD_ID }),
    ).resolves.toEqual({
      success: false,
      error: "Couldn't update this item — it may have been deleted or moved.",
    });
  });

  it("routes a boolean-backed type through make_resource_public, never a direct table write", async () => {
    mockReplies.push(ok(BOOLEAN_CAPS), ok({ success: true }));

    await expect(
      makePublic({ resourceType: "note", resourceId: NOTE_ID }),
    ).resolves.toEqual({ success: true, message: "Resource is now public" });

    expect(mockRequests).toEqual([
      capabilitiesRequest("note"),
      {
        method: "POST",
        path: "/rest/v1/rpc/make_resource_public",
        profile: "public",
        body: JSON.stringify({ p_resource_type: "note", p_resource_id: NOTE_ID }),
      },
    ]);
  });
});

describe("makePrivate", () => {
  it("narrows exactly this row to personal — never internal or public", async () => {
    mockReplies.push(ok(UDT_DOCUMENT_CAPS), ok([{ id: DOC_ID }]));

    await expect(makePrivate("udt_document", DOC_ID)).resolves.toEqual({
      success: true,
      message: "Resource is now personal",
    });

    expect(mockRequests).toEqual([
      capabilitiesRequest("udt_document"),
      {
        method: "PATCH",
        path: `/rest/v1/udt_documents?id=eq.${DOC_ID}&select=id`,
        profile: "workbench",
        body: JSON.stringify({ visibility: "personal" }),
      },
    ]);
  });
});

describe("setResourceVisibility", () => {
  it.each(["personal", "internal", "public"] as const)(
    "writes exactly %s to exactly this row",
    async (level) => {
      mockReplies.push(ok(UDT_DOCUMENT_CAPS), ok([{ id: DOC_ID }]));

      await expect(
        setResourceVisibility("udt_document", DOC_ID, level),
      ).resolves.toEqual({ success: true });

      expect(mockRequests).toEqual([
        capabilitiesRequest("udt_document"),
        {
          method: "PATCH",
          path: `/rest/v1/udt_documents?id=eq.${DOC_ID}&select=id`,
          profile: "workbench",
          body: JSON.stringify({ visibility: level }),
        },
      ]);
    },
  );

  it("passes a database refusal's own message through instead of a guess", async () => {
    mockReplies.push(ok(UDT_DOCUMENT_CAPS), {
      status: 403,
      json: {
        code: "42501",
        details: null,
        hint: null,
        message: "visibility is governed on this item type",
      },
    });

    await expect(
      setResourceVisibility("udt_document", DOC_ID, "public"),
    ).resolves.toEqual({
      success: false,
      error: "visibility is governed on this item type",
    });
  });

  it("refuses 'internal' on a boolean-backed type rather than silently dropping it", async () => {
    // A boolean type has no organization state. Mapping `internal` onto "not
    // public" would tell the person their team can see something nobody can.
    mockReplies.push(ok(BOOLEAN_CAPS));

    await expect(
      setResourceVisibility("note", NOTE_ID, "internal"),
    ).resolves.toEqual({
      success: false,
      error:
        "This item type only supports public or private — it has no organization-level visibility.",
    });
    expect(mockRequests).toEqual([capabilitiesRequest("note")]);
  });
});
