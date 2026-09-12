/**
 * @jest-environment node
 */
/**
 * features/scopes/service/scopesService.ts — the sanctioned SECURITY DEFINER
 * mutation family (scope types, scopes, context items, templates).
 *
 * What the wrappers OWN, and what this suite forces: the exact RPC each one
 * calls and its argument contract (org-explicit creates, the documented
 * defaults, a slug derived from the name, update patches carrying ONLY the
 * fields being changed), the runtime decode of the `to_jsonb(row)` result onto
 * the tree node (a malformed row is `internal`, never a cached lie), the
 * refusal of an unusable slug or a signed-out caller BEFORE any database call,
 * and the mapping of a database refusal into the error envelope.
 *
 * The Supabase client is REAL (supabase-js); only the network is replaced by a
 * recorder, so argument assertions are on the JSON body PostgREST receives.
 * Reply rows are complete generated `context.*` rows (`satisfies`), the shape
 * `to_jsonb(row)` returns.
 */
import type { Json } from "@/types/database.types";
import type {
  ApplyTemplateResult,
  ContextItemRow,
  ScopeNode,
  ScopeRow,
  ScopeTypeNode,
  ScopeTypeRow,
} from "@/features/scopes/types";

interface RecordedRpc {
  path: string;
  profile: string | null;
  args: unknown;
}
interface Reply {
  status: number;
  json: Json;
}

const mockRequests: RecordedRpc[] = [];
const mockReplies: Reply[] = [];
const mockRequireUserId = jest.fn((): string => SIGNED_IN_USER);

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => mockRequireUserId(),
  requireUserId: () => mockRequireUserId(),
}));

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
            path: decodeURIComponent(url.pathname + url.search),
            profile:
              headers.get("content-profile") ?? headers.get("accept-profile"),
            args:
              typeof init?.body === "string" ? JSON.parse(init.body) : null,
          });
          const reply = mockReplies.shift();
          if (!reply) {
            throw new Error(`No reply queued for ${url.pathname}`);
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

import { scopesService } from "@/features/scopes/service/scopesService";

const SIGNED_IN_USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const TYPE_ID = "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85";
const SCOPE_ID = "2b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d90";
const ITEM_ID = "9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0";
const TEMPLATE_ID = "4d5e6f70-8192-4a3b-8c4d-5e6f708192a3";
const STAMP = "2026-09-01T10:00:00.000Z";

const scopeTypeRow = {
  color: "blue",
  created_at: STAMP,
  created_by: SIGNED_IN_USER,
  default_variable_keys: ["client_name"],
  deleted_at: null,
  description: "Companies we serve",
  icon: "Building2",
  id: TYPE_ID,
  label_plural: "Clients",
  label_singular: "Client",
  max_assignments_per_entity: 3,
  metadata: {},
  organization_id: ORG,
  parent_type_id: null,
  slug: "clients",
  sort_order: 7,
  updated_at: STAMP,
  updated_by: null,
  version: 1,
} satisfies ScopeTypeRow;

const scopeRow = {
  created_at: STAMP,
  created_by: SIGNED_IN_USER,
  deleted_at: null,
  description: "Enterprise account",
  id: SCOPE_ID,
  metadata: {},
  name: "Acme Co.",
  organization_id: ORG,
  parent_scope_id: null,
  scope_type_id: TYPE_ID,
  settings: { tier: "gold" },
  slug: "acme-co",
  sort_order: 1,
  updated_at: STAMP,
  updated_by: null,
  version: 1,
  visibility: "internal",
} satisfies ScopeRow;

const contextItemRow = {
  allowed_reference_types: null,
  allowed_scope_type_ids: null,
  category: null,
  created_at: STAMP,
  created_by: SIGNED_IN_USER,
  custom_component: null,
  deleted_at: null,
  depends_on: [],
  description: "",
  display_name: "Industry",
  feed_config: {},
  feed_error: null,
  feed_status: null,
  feed_type: "manual",
  fetch_hint: "on_demand",
  id: ITEM_ID,
  is_active: true,
  key: "industry",
  last_fed_at: null,
  last_verified_at: null,
  max_items: 1,
  metadata: {},
  next_review_at: null,
  reference_source: null,
  refresh_task_id: null,
  review_interval_days: null,
  scope_type_id: TYPE_ID,
  sensitivity: "internal",
  slug: "industry",
  sort_order: 1,
  source_type: "manual",
  status: "active",
  status_note: null,
  status_updated_at: STAMP,
  status_updated_by: null,
  tags: [],
  template_item_key: null,
  updated_at: STAMP,
  updated_by: null,
  value_type: "string",
  version: 1,
} satisfies ContextItemRow;

const PERMISSION_DENIED: Reply = {
  status: 403,
  json: {
    code: "42501",
    details: null,
    hint: null,
    message: "permission denied for function update_scope",
  },
};

const ok = (json: Json): Reply => ({ status: 200, json });

function rpc(name: string, args: Record<string, Json>): RecordedRpc {
  return { path: `/rest/v1/rpc/${name}`, profile: "public", args };
}

beforeEach(() => {
  mockRequests.length = 0;
  mockReplies.length = 0;
  mockRequireUserId.mockImplementation(() => SIGNED_IN_USER);
});

describe("scope type mutations", () => {
  it("createScopeType sends the org-explicit contract with its defaults and a slug from the plural label", async () => {
    mockReplies.push(ok(scopeTypeRow));

    await scopesService.createScopeType({
      org_id: ORG,
      label_singular: "Client",
      label_plural: "Clients",
    });

    expect(mockRequests).toEqual([
      rpc("create_scope_type", {
        p_org_id: ORG,
        p_label_singular: "Client",
        p_label_plural: "Clients",
        p_icon: "folder",
        p_description: "",
        p_sort_order: 0,
        p_default_variable_keys: [],
        p_slug: "clients",
      }),
    ]);
  });

  it("createScopeType decodes every column of the returned row onto the tree node", async () => {
    mockReplies.push(ok(scopeTypeRow));

    const res = await scopesService.createScopeType({
      org_id: ORG,
      label_singular: "Client",
      label_plural: "Clients",
    });

    const node: ScopeTypeNode = {
      id: TYPE_ID,
      organization_id: ORG,
      label_singular: "Client",
      label_plural: "Clients",
      icon: "Building2",
      color: "blue",
      max_assignments_per_entity: 3,
      sort_order: 7,
      parent_type_id: null,
      default_variable_keys: ["client_name"],
      scopes: [],
    };
    expect(res).toEqual({ ok: true, data: node });
  });

  it.each([
    ["an un-sluggable name", "###", "A URL slug is required — use letters or numbers in the name"],
    ["a reserved slug", "Scopes", '"scopes" is a reserved word — choose another slug'],
  ])(
    "createScopeType refuses %s without calling the database",
    async (_label, plural, message) => {
      const res = await scopesService.createScopeType({
        org_id: ORG,
        label_singular: plural,
        label_plural: plural,
      });

      expect(res).toEqual({
        ok: false,
        error: { code: "invalid_argument", message },
      });
      expect(mockRequests).toEqual([]);
    },
  );

  it("updateScopeType sends only the fields being changed", async () => {
    mockReplies.push(ok({ ...scopeTypeRow, label_singular: "Customer" }));

    await scopesService.updateScopeType({
      type_id: TYPE_ID,
      label_singular: "Customer",
    });

    expect(mockRequests).toEqual([
      rpc("update_scope_type", {
        p_type_id: TYPE_ID,
        p_label_singular: "Customer",
      }),
    ]);
  });

  it("updateScopeType returns internal instead of caching a malformed row", async () => {
    mockReplies.push(ok({ nope: true }));

    const res = await scopesService.updateScopeType({
      type_id: TYPE_ID,
      label_singular: "Customer",
    });

    expect(res).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "update_scope_type returned no scope type row",
      },
    });
  });

  it("updateScopeType refuses a row that carries no organization_id", async () => {
    mockReplies.push(ok({ ...scopeTypeRow, organization_id: null }));

    const res = await scopesService.updateScopeType({
      type_id: TYPE_ID,
      label_singular: "Customer",
    });

    expect(res).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "update_scope_type returned a row without organization_id",
      },
    });
  });

  it("deleteScopeType archives exactly that type and reports its id", async () => {
    mockReplies.push(ok(null));

    const res = await scopesService.deleteScopeType(TYPE_ID);

    expect(mockRequests).toEqual([
      rpc("delete_scope_type", { p_type_id: TYPE_ID }),
    ]);
    expect(res).toEqual({ ok: true, data: { id: TYPE_ID } });
  });

  it("deleteScopeType reports a database refusal instead of success", async () => {
    mockReplies.push(PERMISSION_DENIED);

    const res = await scopesService.deleteScopeType(TYPE_ID);

    expect(res).toMatchObject({
      ok: false,
      error: { code: "forbidden_org", message: "Permission denied" },
    });
  });
});

describe("scope mutations", () => {
  it("createScope sends the org-explicit contract with a slug derived from the name", async () => {
    mockReplies.push(ok({ ...scopeRow, type_label: "Client" }));

    await scopesService.createScope({
      org_id: ORG,
      type_id: TYPE_ID,
      name: "Acme Co.",
    });

    expect(mockRequests).toEqual([
      rpc("create_scope", {
        p_org_id: ORG,
        p_type_id: TYPE_ID,
        p_name: "Acme Co.",
        p_description: "",
        p_settings: {},
        p_slug: "acme-co",
      }),
    ]);
  });

  it("createScope decodes the returned row onto a ScopeNode", async () => {
    mockReplies.push(ok({ ...scopeRow, type_label: "Client" }));

    const res = await scopesService.createScope({
      org_id: ORG,
      type_id: TYPE_ID,
      name: "Acme Co.",
    });

    const node: ScopeNode = {
      id: SCOPE_ID,
      scope_type_id: TYPE_ID,
      organization_id: ORG,
      name: "Acme Co.",
      description: "Enterprise account",
      parent_scope_id: null,
      settings: { tier: "gold" },
    };
    expect(res).toEqual({ ok: true, data: node });
  });

  it("updateScope maps a database refusal to forbidden_org, never success or internal", async () => {
    mockReplies.push(PERMISSION_DENIED);

    const res = await scopesService.updateScope({
      scope_id: SCOPE_ID,
      name: "New name",
    });

    expect(mockRequests).toEqual([
      rpc("update_scope", { p_scope_id: SCOPE_ID, p_name: "New name" }),
    ]);
    expect(res).toMatchObject({
      ok: false,
      error: { code: "forbidden_org", message: "Permission denied" },
    });
  });

  it("updateScope refuses a row that carries no scope type id", async () => {
    mockReplies.push(ok({ ...scopeRow, scope_type_id: null }));

    const res = await scopesService.updateScope({
      scope_id: SCOPE_ID,
      name: "New name",
    });

    expect(res).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "update_scope returned a row without org/type ids",
      },
    });
  });

  it("deleteScope archives exactly that scope and reports its id", async () => {
    mockReplies.push(ok(null));

    const res = await scopesService.deleteScope(SCOPE_ID);

    expect(mockRequests).toEqual([
      rpc("delete_scope", { p_scope_id: SCOPE_ID }),
    ]);
    expect(res).toEqual({ ok: true, data: { id: SCOPE_ID } });
  });
});

describe("context item mutations", () => {
  it("createContextItem sends the contract with its documented defaults and returns the row", async () => {
    mockReplies.push(ok(contextItemRow));

    const res = await scopesService.createContextItem({
      scope_type_id: TYPE_ID,
      key: "industry",
      display_name: "Industry",
    });

    expect(mockRequests).toEqual([
      rpc("create_context_item", {
        p_scope_type_id: TYPE_ID,
        p_key: "industry",
        p_display_name: "Industry",
        p_value_type: "string",
        p_description: "",
        p_fetch_hint: "on_demand",
        p_sensitivity: "internal",
        p_tags: [],
      }),
    ]);
    expect(res).toEqual({ ok: true, data: contextItemRow });
  });

  it("updateContextItem sends only the patch fields given", async () => {
    mockReplies.push(ok({ ...contextItemRow, display_name: "Sector" }));

    await scopesService.updateContextItem({
      item_id: ITEM_ID,
      display_name: "Sector",
    });

    expect(mockRequests).toEqual([
      rpc("update_context_item", {
        p_item_id: ITEM_ID,
        p_display_name: "Sector",
      }),
    ]);
  });

  it("updateContextItem refuses a row that carries no scope type id", async () => {
    mockReplies.push(ok({ ...contextItemRow, scope_type_id: null }));

    const res = await scopesService.updateContextItem({
      item_id: ITEM_ID,
      display_name: "Sector",
    });

    expect(res).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "update_context_item returned no context item row",
      },
    });
  });

  it("deleteContextItem archives exactly that item and reports its id", async () => {
    mockReplies.push(ok({ id: ITEM_ID, is_active: false }));

    const res = await scopesService.deleteContextItem(ITEM_ID);

    expect(mockRequests).toEqual([
      rpc("delete_context_item", { p_item_id: ITEM_ID }),
    ]);
    expect(res).toEqual({ ok: true, data: { id: ITEM_ID } });
  });
});

describe("applyTemplate", () => {
  it("applies exactly this template to exactly this org and returns the envelope", async () => {
    const envelope = {
      template_id: TEMPLATE_ID,
      organization_id: ORG,
      scope_types_created: [scopeTypeRow],
      context_items_count: 7,
    } satisfies ApplyTemplateResult;
    mockReplies.push(ok(envelope));

    const res = await scopesService.applyTemplate({
      template_id: TEMPLATE_ID,
      org_id: ORG,
    });

    expect(mockRequests).toEqual([
      rpc("apply_template", { p_template_id: TEMPLATE_ID, p_org_id: ORG }),
    ]);
    expect(res).toEqual({ ok: true, data: envelope });
  });

  it.each([
    ["no object", null],
    ["an array", [TEMPLATE_ID]],
  ])("returns internal when the RPC yields %s", async (_label, json) => {
    mockReplies.push(ok(json));

    const res = await scopesService.applyTemplate({
      template_id: TEMPLATE_ID,
      org_id: ORG,
    });

    expect(res).toEqual({
      ok: false,
      error: { code: "internal", message: "apply_template returned no result" },
    });
  });
});

describe("signed-out callers", () => {
  it("refuses every write before reaching the database", async () => {
    // A signed-out write must never become an anonymous RPC call.
    mockRequireUserId.mockImplementation(() => {
      throw new Error("Not signed in");
    });
    const screamed = jest.spyOn(console, "error").mockImplementation(() => {});

    const results = await Promise.all([
      scopesService.createScopeType({
        org_id: ORG,
        label_singular: "Client",
        label_plural: "Clients",
      }),
      scopesService.createScope({ org_id: ORG, type_id: TYPE_ID, name: "Acme" }),
      scopesService.updateScope({ scope_id: SCOPE_ID, name: "Acme" }),
      scopesService.deleteScope(SCOPE_ID),
      scopesService.createContextItem({
        scope_type_id: TYPE_ID,
        key: "industry",
        display_name: "Industry",
      }),
      scopesService.applyTemplate({ template_id: TEMPLATE_ID, org_id: ORG }),
    ]);

    expect(results.map((r) => r.ok)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(mockRequests).toEqual([]);
    screamed.mockRestore();
  });
});
