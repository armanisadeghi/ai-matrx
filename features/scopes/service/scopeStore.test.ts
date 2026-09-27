/**
 * @jest-environment node
 *
 * THE ONE WRITER OF SCOPES (lane SCOPES-WRITE-THROUGH).
 *
 * 1. Every scope write goes through the record store's scope doors (`custom.context_*`) — never a
 *    public RPC of the old scope system — and the screens get back the same decoded row as before.
 *    Run with SCOPE_WRITER_UNDER_TEST=legacy to point the same clauses at the old service: they fail
 *    (the old writer calls public.create_scope_type & co. directly), which is the proof the clauses
 *    can tell the two apart.
 * 2. Nothing in the app calls a scope WRITE on the legacy service any more: a census of every
 *    `scopesService.<write>(` outside the legacy file and its own tests. A new caller of the old
 *    writer turns this red.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const customRpc = jest.fn();
const publicRpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => publicRpc(...args),
    schema: (name: string) => ({
      rpc: (...args: unknown[]) => (name === "custom" ? customRpc(...args) : publicRpc(...args)),
    }),
  },
}));
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
  requireUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the implementation under test is chosen per run
const writer = (process.env.SCOPE_WRITER_UNDER_TEST === "legacy"
  ? require("@/features/scopes/service/scopesService").scopesService
  : require("@/features/scopes/service/scopeStore").scopeStore) as typeof import("@/features/scopes/service/scopeStore").scopeStore;

const ORG = "3e1b7c52-7a41-4b43-9a55-2c1f0f7d9a10"; // Bayfront Family Dentistry (fixture id)
const TYPE = "44d44d0c-6676-4869-9194-f0a51a8daee4";
const SCOPE = "c2339fc9-a70d-473a-8b28-6b4b6524e441";
const ITEM = "61cbe971-3957-4af8-a223-ec1c5f230d67";

const typeRow = {
  id: TYPE, organization_id: ORG, label_singular: "Patient", label_plural: "Patients", icon: "user",
  color: "blue", max_assignments_per_entity: null, sort_order: 0, parent_type_id: null,
  default_variable_keys: [], slug: "patients", description: "People the practice treats",
  created_at: "2026-09-27T05:00:00Z", updated_at: "2026-09-27T05:00:00Z",
};
const scopeRow = {
  id: SCOPE, scope_type_id: TYPE, organization_id: ORG, name: "Marisol Ortega",
  description: "Hygiene patient since 2019", parent_scope_id: null, settings: {}, slug: "marisol-ortega",
  sort_order: 1, created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
  created_at: "2026-09-27T05:00:00Z", updated_at: "2026-09-27T05:00:00Z",
};
const itemRow = { id: ITEM, scope_type_id: TYPE, key: "preferred_dentist", display_name: "Preferred dentist", value_type: "string" };
const answer = (row: unknown) => ({ data: { ok: true, writer: "store", row, store: { id: (row as { id: string }).id, version: 1 } }, error: null });

beforeEach(() => {
  customRpc.mockReset();
  publicRpc.mockReset();
  publicRpc.mockResolvedValue({ data: null, error: { code: "42883", message: "the old scope RPC was called" } });
});

describe("every scope write goes through the record store's scope doors", () => {
  it("a scope type is made through custom.context_type_write and comes back as the tree node", async () => {
    customRpc.mockResolvedValue(answer(typeRow));
    const res = await writer.createScopeType({ org_id: ORG, label_singular: "Patient", label_plural: "Patients", icon: "user", color: "blue" });
    expect(customRpc).toHaveBeenCalledWith("context_type_write", expect.objectContaining({
      p_organization_id: ORG, p_type_id: null,
      p_spec: expect.objectContaining({ label_singular: "Patient", label_plural: "Patients", slug: "patients" }),
    }));
    expect(publicRpc).not.toHaveBeenCalled();
    expect(res.ok && res.data.id).toBe(TYPE);
  });

  it("a scope is made and renamed through custom.context_scope_write", async () => {
    customRpc.mockResolvedValue(answer(scopeRow));
    const made = await writer.createScope({ org_id: ORG, type_id: TYPE, name: "Marisol Ortega" });
    const renamed = await writer.updateScope({ scope_id: SCOPE, name: "Marisol Ortega-Reyes" });
    expect(customRpc).toHaveBeenNthCalledWith(1, "context_scope_write", expect.objectContaining({ p_type_id: TYPE, p_scope_id: null }));
    expect(customRpc).toHaveBeenNthCalledWith(2, "context_scope_write", expect.objectContaining({
      p_scope_id: SCOPE, p_spec: { name: "Marisol Ortega-Reyes" },
    }));
    expect(made.ok && made.data.scope_type_id).toBe(TYPE);
    expect(renamed.ok).toBe(true);
    expect(publicRpc).not.toHaveBeenCalled();
  });

  it("a context field clears a column through the door's row-update arm (null kept, undefined dropped)", async () => {
    customRpc.mockResolvedValue(answer(itemRow));
    await writer.updateContextItem({ item_id: ITEM, category: null, display_name: undefined });
    expect(customRpc).toHaveBeenCalledWith("context_item_write", {
      p_item_id: ITEM, p_scope_type_id: null, p_spec: { category: null },
    });
    expect(publicRpc).not.toHaveBeenCalled();
  });

  it("archive and restore go through their doors", async () => {
    customRpc.mockResolvedValue(answer({ id: TYPE }));
    await writer.deleteScopeType(TYPE);
    await writer.restoreScopeType(TYPE);
    await writer.deleteScope(SCOPE);
    await writer.deleteContextItem(ITEM);
    expect(customRpc.mock.calls.map((c) => c[0])).toEqual([
      "context_type_archive", "context_type_restore", "context_scope_archive", "context_item_archive",
    ]);
    expect(publicRpc).not.toHaveBeenCalled();
  });

  it("a value goes through custom.context_value_write and a refusal keeps its sentence", async () => {
    customRpc.mockResolvedValueOnce({ data: { ok: true, writer: "store", data: { id: "v1", context_item_id: ITEM, scope_id: SCOPE, version: 2, value_text: "Dr. Lena Brooks", source_type: "manual" } }, error: null });
    const written = await writer.setContextValue({ context_item_id: ITEM, scope_id: SCOPE, value_text: "Dr. Lena Brooks", source_type: "manual" });
    expect(customRpc).toHaveBeenCalledWith("context_value_write", {
      p_payload: { source_type: "manual", context_item_id: ITEM, scope_id: SCOPE, value_text: "Dr. Lena Brooks" },
    });
    expect(written.ok && written.data.version).toBe(2);

    customRpc.mockResolvedValueOnce({ data: { ok: false, error: { code: "forbidden", message: "You can read Marisol Ortega, but only an editor can change her." } }, error: null });
    const refused = await writer.setContextValue({ context_item_id: ITEM, scope_id: SCOPE, value_text: "x" });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.message).toBe("You can read Marisol Ortega, but only an editor can change her.");
    expect(publicRpc).not.toHaveBeenCalled();
  });

  it("a template is applied through custom.context_template_apply", async () => {
    customRpc.mockResolvedValue({ data: { template_id: "t1", organization_id: ORG, scope_types_created: [], context_items_count: 12, writer: "store" }, error: null });
    const res = await writer.applyTemplate({ template_id: "t1", org_id: ORG });
    expect(customRpc).toHaveBeenCalledWith("context_template_apply", { p_organization_id: ORG, p_template_id: "t1" });
    expect(res.ok && res.data.context_items_count).toBe(12);
    expect(publicRpc).not.toHaveBeenCalled();
  });
});

describe("nothing in the app writes scopes through the legacy service", () => {
  const WRITES = [
    "createScopeType", "updateScopeType", "deleteScopeType", "restoreScopeType",
    "createScope", "updateScope", "deleteScope", "restoreScope",
    "createContextItem", "updateContextItem", "deleteContextItem", "restoreContextItem",
    "setContextValue", "applyTemplate", "setEntityScopes",
  ];
  const pattern = new RegExp(`\\bscopesService\\.(${WRITES.join("|")})\\(`);
  const root = join(__dirname, "..", "..", "..");
  const ALLOWED = new Set([
    "features/scopes/service/scopesService.ts",           // the legacy adapter's own definitions
    "features/scopes/service/scopesServiceMutations.test.ts", // its own tests, retired with it
  ]);
  const SKIP = new Set(["node_modules", ".next", ".git", ".wt", "types", "tmp", "dist", "coverage"]);

  function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  }

  it("every scope write in features/, app/, components/, lib/ and hooks/ calls scopeStore", () => {
    const files: string[] = [];
    for (const top of ["features", "app", "components", "lib", "hooks", "utils", "providers"]) {
      try {
        walk(join(root, top), files);
      } catch {
        /* a top-level folder this checkout does not have */
      }
    }
    const offenders = files
      .map((f) => relative(root, f))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => pattern.test(readFileSync(join(root, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
