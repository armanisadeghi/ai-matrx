/**
 * @jest-environment jsdom
 */
/**
 * EVERY WEB READ OF THE SCOPE SYSTEM COMES FROM THE RECORD STORE (lane SCOPES-READS-WEB,
 * SCOPES-CUTOVER-PLAN step 2.4).
 *
 * A scope type is a custom Table, a scope a Record, a context item a Field, a value a key of the
 * Record's document. The old `context.scope_types` / `scopes` / `context_items` /
 * `context_item_values` tables leave for the deprecated schema at the contract (step 4.3); a web read still
 * aimed at them would then fail — or, while they still exist, read an image nobody writes first.
 *
 * Guard: the Supabase client below REFUSES the `context` schema outright and answers only the
 * store's `custom.context_*` doors, with the Castellano & Reyes shapes the store holds (a Matter
 * whose client and practice area are references to other scopes, a date, a file reference). Every
 * reader the scope screens, pickers, the chat lens and the context inspector use must answer from
 * the doors, in the old node shapes. RED on the HEAD copy of scopesService.ts (every read went
 * through `contextDb(supabase).from(…)`), GREEN after.
 */
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const ORG = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const MATTERS = "1aaba65d-68de-457e-8a0c-0f2731161d13";
const CLIENTS = "2a0fff28-25db-4adc-89f4-e402df1121f5";
const REYES = "2f658029-7960-4fd5-a451-1e47c40a4746";
const GOLDEN_STATE = "a71eeea7-739e-4f32-ba13-fbb91b279447";
const ITEM_CLIENT = "91399c45-a00d-43f0-a3ec-7e8334afc434";
const ITEM_INJURY = "23151f68-5fd2-4f0b-a646-97dfa25c6ec0";
const ITEM_QME = "46771d48-6ef6-4a89-bb5a-8c3ec004e50e";
const QME_FILE = "c0ffee00-1111-4222-8333-444455556666";

jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => USER, requireUserId: () => USER }));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({ ok: true, data: { memberships: [{ containerId: ORG, role: "member" }] } }),
  },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForSources: async () => ({ ok: true, data: { edges: [] } }),
    listForTargets: async () => ({ ok: true, data: { edges: [] } }),
  },
}));

const TREE = {
  types: [
    { id: MATTERS, organization_id: ORG, label_singular: "Matter", label_plural: "Matters", icon: "FolderOpen", color: "amber", slug: "matters", description: "Cases the firm handles", sort_order: 3, default_variable_keys: null, created_at: "2026-09-25T02:02:17Z", updated_at: "2026-09-28T19:50:34Z" },
    { id: CLIENTS, organization_id: ORG, label_singular: "Client", label_plural: "Clients", icon: "Building2", color: "blue", slug: "practice_clients", description: null, sort_order: 1, default_variable_keys: ["client_name"], created_at: "", updated_at: "" },
  ],
  scopes: [
    { id: GOLDEN_STATE, scope_type_id: CLIENTS, organization_id: ORG, name: "Golden State Indemnity Co.", description: "", slug: "golden-state-indemnity", sort_order: 1, parent_scope_id: null, settings: {}, created_by: USER, created_at: "", updated_at: "" },
    { id: REYES, scope_type_id: MATTERS, organization_id: ORG, name: "Reyes, Maria v. Pinnacle Logistics (ADJ22008811)", description: "", slug: "reyes-v-pinnacle", sort_order: 1, parent_scope_id: null, settings: { exam_dates: ['{"date": "2027-03-01", "id": "exam-1", "title": "Midterm"}'], access_mode: "paid" }, created_by: USER, created_at: "", updated_at: "" },
  ],
};
const ITEMS = [
  { id: ITEM_CLIENT, scope_type_id: MATTERS, organization_id: ORG, data: { key: "client", sort: 10, type: "relation", multi: false, label: "Client", config: {}, relation_target: CLIENTS, sensitivity: "internal", context_policy: "on_request", source: "manual" }, carried: null, version: 2 },
  { id: ITEM_INJURY, scope_type_id: MATTERS, organization_id: ORG, data: { key: "date_of_injury", sort: 12, type: "range", multi: false, label: "Date of Injury", config: { kind: "date" }, format: "date", sensitivity: "internal", context_policy: "include" }, carried: null, version: 1 },
  { id: ITEM_QME, scope_type_id: MATTERS, organization_id: ORG, data: { key: "qme_report", sort: 41, type: "relation", multi: true, label: "QME Report", max_items: 10, relation_target: "11111111-0000-4000-8000-000000000006", allowed_reference_types: ["file"], description: "The QME (or AME) medical-legal report PDF(s) for this matter." }, carried: null, version: 2 },
];
const VALUES = [
  { scope_id: REYES, context_item_id: ITEM_CLIENT, key: "client", value: GOLDEN_STATE, field: { type: "relation", multi: false, config: {}, relation_target: CLIENTS }, version: 2, set_at: "2026-09-25T02:02:17Z", source_type: "manual", value_id: "b7e92e83-8829-42a2-a988-0a16ccd00c30", labels: { [GOLDEN_STATE]: "Golden State Indemnity Co." } },
  { scope_id: REYES, context_item_id: ITEM_INJURY, key: "date_of_injury", value: "2023-09-02", field: { type: "range", multi: false, config: { kind: "date" }, format: "date" }, version: 1, set_at: "2026-09-25T02:02:17Z", source_type: "manual", value_id: "76696ad5-6cce-4fa7-846a-d1d130172c91" },
  { scope_id: REYES, context_item_id: ITEM_QME, key: "qme_report", value: [QME_FILE], field: { type: "relation", multi: true, relation_target: "11111111-0000-4000-8000-000000000006" }, version: 3, set_at: "2026-09-26T10:00:00Z", source_type: "ai_enriched", value_id: null },
];
const doorsCalled: string[] = [];

jest.mock("@/utils/supabase/client", () => {
  const org = { id: "7cd12da2-2213-4378-8fba-a9e2dc4ea657", name: "Castellano & Reyes, LLP", abbreviation: "C&R", slug: "castellano-reyes", settings: {}, created_by: null, archived_at: null };
  const table = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "is", "order", "eq", "range"]) q[m] = () => q;
    q.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
    return q;
  };
  return {
    supabase: {
      schema: (name: string) => {
        if (name === "context") throw new Error("the old context schema was read");
        if (name === "custom") {
          return {
            rpc: (door: string, args: Record<string, string[] | string>) => {
              doorsCalled.push(door);
              const ids = (args.p_scope_ids ?? args.p_scope_type_ids ?? []) as string[];
              switch (door) {
                case "context_tree":
                  return Promise.resolve({ data: TREE, error: null });
                // The paged doors (lane SCOPES-TREE-PAGED) answer the same tree in pieces.
                case "context_tree_types":
                  return Promise.resolve({
                    data: {
                      types: TREE.types.map((t) =>
                        args.p_with_counts
                          ? { ...t, scope_count: TREE.scopes.filter((s) => s.scope_type_id === t.id).length }
                          : t,
                      ),
                    },
                    error: null,
                  });
                case "context_tree_type_scopes": {
                  const of = TREE.scopes.filter((s) => s.scope_type_id === args.p_scope_type_id);
                  return Promise.resolve({ data: { scopes: of, total: of.length, offset: 0, next_offset: null }, error: null });
                }
                case "context_scopes":
                  return Promise.resolve({
                    data: TREE.scopes
                      .filter((s) => ids.includes(s.id))
                      .map((s) => ({ ...s, scope_type: TREE.types.find((t) => t.id === s.scope_type_id) })),
                    error: null,
                  });
                case "context_items":
                  return Promise.resolve({ data: ITEMS.filter((i) => ids.includes(i.scope_type_id)), error: null });
                case "context_values":
                  return Promise.resolve({ data: VALUES.filter((v) => ids.includes(v.scope_id)), error: null });
                case "context_archived_types":
                  return Promise.resolve({
                    data: [{ id: "d8082fba-860a-4c4f-8159-cceaba621265", organization_id: args.p_organization_id, label_singular: "Referral Source", label_plural: "Referral Sources", icon: "Share2", color: "green", deleted_at: "2026-09-20T12:00:00Z", archived_scope_count: 1 }],
                    error: null,
                  });
                case "context_system_items":
                  return Promise.resolve({ data: [{ id: "11b7b942-d604-4d7a-9566-571865f121ed", key: "company_name", display_name: "Company Name", description: null, item_class: "curated", value_type: "string", sensitivity: "public", sort_order: 0 }], error: null });
                default:
                  throw new Error(`unexpected door ${door}`);
              }
            },
          };
        }
        return { from: () => table([org]) };
      },
      from: () => table([]),
      auth: {
        getSession: async () => ({ data: { session: { access_token: "seat" } }, error: null }),
        refreshSession: async () => ({ data: { session: { access_token: "seat" } }, error: null }),
      },
    },
  };
});
jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "is", "order", "eq"]) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return { from: () => q };
  },
}));

// eslint-disable-next-line import/first
import { scopesService } from "@/features/scopes/service/scopesService";

// THE STORE READ PATH (read switch ON, lane SCOPES-WEB-REVERT): these assertions are the store
// doors' contract; the switch is OFF in the app until member-seat parity holds.

beforeEach(() => {
  doorsCalled.length = 0;
});

it("the boot tree is the store's tree, in the package's shapes (store slugs, settings objects back)", async () => {
  const res = await scopesService.getScopeTree();
  if (!res.ok) throw new Error(res.error.message);
  expect(doorsCalled).toEqual(["context_tree"]);
  const org = res.data.organizations[0]!;
  const matters = org.scope_types.find((t) => t.id === MATTERS)!;
  expect(matters).toMatchObject({ label_plural: "Matters", slug: "matters", description: "Cases the firm handles", sort_order: 3, default_variable_keys: [] });
  const clients = org.scope_types.find((t) => t.id === CLIENTS)!;
  expect(clients.slug).toBe("practice_clients");
  const reyes = matters.scopes.find((s) => s.id === REYES)!;
  expect(reyes).toMatchObject({ slug: "reyes-v-pinnacle", sort_order: 1 });
  expect(reyes.settings).toEqual({ exam_dates: [{ date: "2027-03-01", id: "exam-1", title: "Midterm" }], access_mode: "paid" });
});

it("a type's context fields are its Fields, in the store's words", async () => {
  const res = await scopesService.listContextItems(MATTERS);
  if (!res.ok) throw new Error(res.error.message);
  const byId = new Map(res.data.items.map((i) => [i.id, i]));
  expect(byId.get(ITEM_CLIENT)).toMatchObject({ key: "client", label: "Client", kind: "reference", context_policy: "on_request" });
  expect(byId.get(ITEM_INJURY)).toMatchObject({ kind: "date", context_policy: "include" });
  expect(byId.get(ITEM_QME)).toMatchObject({ kind: "reference", max_items: 10 });
});

it("a scope's values are cells: a reference as its references, a date as a date", async () => {
  const res = await scopesService.listContextValues(REYES);
  if (!res.ok) throw new Error(res.error.message);
  const byField = new Map(res.data.values.map((v) => [v.field_id, v]));
  const client = byField.get(ITEM_CLIENT)!;
  expect(client.references).toEqual([expect.objectContaining({ id: GOLDEN_STATE, label: "Golden State Indemnity Co." })]);
  expect(client).toMatchObject({ version: 2, source_type: "manual", kind: "reference" });
  expect(byField.get(ITEM_INJURY)).toMatchObject({ value: "2023-09-02", kind: "date" });
  const qme = byField.get(ITEM_QME)!;
  expect(qme.references[0]).toMatchObject({ type: "file" });
  expect(qme).toMatchObject({ source_type: "ai_enriched", version: 3 });
});

it("the chat lens's cell chip and a scope's home read the store", async () => {
  const cell = await scopesService.resolveContextCell({ scopeId: REYES, contextItemId: ITEM_INJURY });
  if (!cell.ok) throw new Error(cell.error.message);
  expect(cell.data).toMatchObject({ scopeName: TREE.scopes[1]!.name, itemName: "Date of Injury" });
  expect(cell.data.value?.value).toBe("2023-09-02");

  const home = await scopesService.getScopeHome(REYES);
  if (!home.ok) throw new Error(home.error.message);
  expect(home.data.scope).toEqual({ id: REYES, name: TREE.scopes[1]!.name, organization_id: ORG, scope_type_id: MATTERS });
});

it("a suggestion's target, a name lookup, the archive and the System items read the store", async () => {
  const target = await scopesService.resolveSuggestionTarget({ scopeId: REYES, contextItemId: ITEM_CLIENT });
  if (!target.ok) throw new Error(target.error.message);
  expect(target.data.scope_type).toMatchObject({ id: MATTERS, slug: "matters", label_singular: "Matter" });
  expect(target.data.target_item?.field).toMatchObject({ id: ITEM_CLIENT, key: "client" });
  expect(target.data.target_item?.current?.references[0]?.id).toBe(GOLDEN_STATE);

  const named = await scopesService.findScopesByName(ORG, ["golden state indemnity co."]);
  if (!named.ok) throw new Error(named.error.message);
  expect(named.data).toEqual([{ id: GOLDEN_STATE, name: "Golden State Indemnity Co.", type: "Client" }]);

  const archived = await scopesService.listArchivedScopeTypes(ORG);
  if (!archived.ok) throw new Error(archived.error.message);
  expect(archived.data.types).toEqual([
    expect.objectContaining({ label_plural: "Referral Sources", archived_scope_count: 1, archived_at: "2026-09-20T12:00:00Z" }),
  ]);

  const system = await scopesService.listSystemContextItems();
  if (!system.ok) throw new Error(system.error.message);
  expect(system.data.items.map((i) => i.key)).toEqual(["company_name"]);
});
