/**
 * features/scopes/service/scopesServiceMutations.test.ts
 *
 * The sanctioned SECURITY DEFINER mutation family (Lane F W6–W8): each
 * wrapper calls its RPC with the family's argument contract, decodes the
 * `to_jsonb(row)` result onto the canonical node shape with runtime checks,
 * and returns the ScopesRpcResult envelope — never throws, never folds a
 * malformed row into the cache.
 */

jest.mock("@/utils/supabase/client", () => {
  const rpc = jest.fn();
  const schema = jest.fn();
  return { supabase: { rpc, schema } };
});

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: jest.fn(() => "user-1"),
  requireUserId: jest.fn(() => "user-1"),
}));

import { supabase } from "@/utils/supabase/client";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";

const rpcMock = supabase.rpc as unknown as jest.Mock;

const scopeTypeRow = {
  id: "type-1",
  organization_id: "org-1",
  label_singular: "Client",
  label_plural: "Clients",
  icon: "Building2",
  color: "blue",
  max_assignments_per_entity: null,
  sort_order: 3,
  parent_type_id: null,
  default_variable_keys: [],
};

const scopeRow = {
  id: "scope-1",
  organization_id: "org-1",
  scope_type_id: "type-1",
  name: "Acme Co.",
  description: "",
  parent_scope_id: null,
  settings: {},
  slug: "acme-co",
  sort_order: 1,
};

const contextItemRow = {
  id: "item-1",
  scope_type_id: "type-1",
  key: "industry",
  display_name: "Industry",
  value_type: "string",
  sort_order: 1,
  is_active: true,
};

beforeEach(() => {
  rpcMock.mockReset();
});

describe("scope type mutations", () => {
  it("createScopeType computes a slug from the plural label and decodes the row", async () => {
    rpcMock.mockResolvedValue({ data: scopeTypeRow, error: null });

    const res = await scopesService.createScopeType({
      org_id: "org-1",
      label_singular: "Client",
      label_plural: "Clients",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_scope_type",
      expect.objectContaining({
        p_org_id: "org-1",
        p_label_singular: "Client",
        p_label_plural: "Clients",
        p_slug: "clients",
      }),
    );
    expect(isScopesRpcErr(res)).toBe(false);
    if (!isScopesRpcErr(res)) {
      expect(res.data).toMatchObject({
        id: "type-1",
        organization_id: "org-1",
        scopes: [],
      });
    }
  });

  it("createScopeType refuses an un-sluggable name without calling the RPC", async () => {
    const res = await scopesService.createScopeType({
      org_id: "org-1",
      label_singular: "###",
      label_plural: "###",
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(isScopesRpcErr(res)).toBe(true);
    if (isScopesRpcErr(res)) {
      expect(res.error.code).toBe("invalid_argument");
    }
  });

  it("updateScopeType returns internal on a malformed RPC result", async () => {
    rpcMock.mockResolvedValue({ data: { nope: true }, error: null });
    const res = await scopesService.updateScopeType({
      type_id: "type-1",
      label_singular: "Customer",
    });
    expect(isScopesRpcErr(res)).toBe(true);
    if (isScopesRpcErr(res)) {
      expect(res.error.code).toBe("internal");
    }
  });

  it("deleteScopeType echoes the id back on success", async () => {
    rpcMock.mockResolvedValue({ data: { deleted: true }, error: null });
    const res = await scopesService.deleteScopeType("type-1");
    expect(rpcMock).toHaveBeenCalledWith("delete_scope_type", {
      p_type_id: "type-1",
    });
    expect(res).toEqual({ ok: true, data: { id: "type-1" } });
  });
});

describe("scope mutations", () => {
  it("createScope decodes the row onto a ScopeNode", async () => {
    rpcMock.mockResolvedValue({
      data: { ...scopeRow, type_label: "Client" },
      error: null,
    });

    const res = await scopesService.createScope({
      org_id: "org-1",
      type_id: "type-1",
      name: "Acme Co.",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_scope",
      expect.objectContaining({
        p_org_id: "org-1",
        p_type_id: "type-1",
        p_name: "Acme Co.",
        p_slug: "acme-co",
      }),
    );
    expect(isScopesRpcErr(res)).toBe(false);
    if (!isScopesRpcErr(res)) {
      expect(res.data).toEqual({
        id: "scope-1",
        scope_type_id: "type-1",
        organization_id: "org-1",
        name: "Acme Co.",
        description: "",
        parent_scope_id: null,
        settings: {},
      });
    }
  });

  it("updateScope maps a database refusal into the error envelope", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "not authorized to update scope",
        details: null,
        hint: null,
      },
    });
    const res = await scopesService.updateScope({
      scope_id: "scope-1",
      name: "New name",
    });
    expect(isScopesRpcErr(res)).toBe(true);
  });

  it("deleteScope echoes the id back on success", async () => {
    rpcMock.mockResolvedValue({ data: { deleted: true }, error: null });
    const res = await scopesService.deleteScope("scope-1");
    expect(rpcMock).toHaveBeenCalledWith("delete_scope", {
      p_scope_id: "scope-1",
    });
    expect(res).toEqual({ ok: true, data: { id: "scope-1" } });
  });
});

describe("context item mutations", () => {
  it("createContextItem defaults value_type to string and returns the row", async () => {
    rpcMock.mockResolvedValue({ data: contextItemRow, error: null });
    const res = await scopesService.createContextItem({
      scope_type_id: "type-1",
      key: "industry",
      display_name: "Industry",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_context_item",
      expect.objectContaining({
        p_scope_type_id: "type-1",
        p_key: "industry",
        p_display_name: "Industry",
        p_value_type: "string",
      }),
    );
    expect(isScopesRpcErr(res)).toBe(false);
    if (!isScopesRpcErr(res)) {
      expect(res.data).toMatchObject({ id: "item-1", scope_type_id: "type-1" });
    }
  });

  it("updateContextItem passes only the given patch fields", async () => {
    rpcMock.mockResolvedValue({
      data: { ...contextItemRow, display_name: "Sector" },
      error: null,
    });
    const res = await scopesService.updateContextItem({
      item_id: "item-1",
      display_name: "Sector",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "update_context_item",
      expect.objectContaining({
        p_item_id: "item-1",
        p_display_name: "Sector",
      }),
    );
    expect(isScopesRpcErr(res)).toBe(false);
  });

  it("deleteContextItem echoes the id back on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "item-1", is_active: false },
      error: null,
    });
    const res = await scopesService.deleteContextItem("item-1");
    expect(rpcMock).toHaveBeenCalledWith("delete_context_item", {
      p_item_id: "item-1",
    });
    expect(res).toEqual({ ok: true, data: { id: "item-1" } });
  });
});

describe("applyTemplate", () => {
  it("decodes the jsonb envelope", async () => {
    rpcMock.mockResolvedValue({
      data: {
        template_id: "tmpl-1",
        organization_id: "org-1",
        scope_types_created: [],
        context_items_count: 7,
      },
      error: null,
    });
    const res = await scopesService.applyTemplate({
      template_id: "tmpl-1",
      org_id: "org-1",
    });
    expect(rpcMock).toHaveBeenCalledWith("apply_template", {
      p_template_id: "tmpl-1",
      p_org_id: "org-1",
    });
    expect(isScopesRpcErr(res)).toBe(false);
    if (!isScopesRpcErr(res)) {
      expect(res.data.context_items_count).toBe(7);
    }
  });

  it("returns internal when the RPC yields no object", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await scopesService.applyTemplate({
      template_id: "tmpl-1",
      org_id: "org-1",
    });
    expect(isScopesRpcErr(res)).toBe(true);
    if (isScopesRpcErr(res)) {
      expect(res.error.code).toBe("internal");
    }
  });
});
