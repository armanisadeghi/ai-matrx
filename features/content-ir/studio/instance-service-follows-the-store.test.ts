/**
 * The browser's kind-record service writes where the ORGANIZATION keeps its kind records.
 *
 * `content_ir.kind_instance` is declared superseded by `custom.record`. aidream answers
 * "which store holds this organization's kind records" in one door; the browser asks the
 * same question (`./kind-record-home.ts`: the organization's record-store switch AND a
 * Table with slug `kind_instance`) and reads/writes through the store's own doors when the
 * answer is the store.
 *
 * Only the network boundary is faked: the Supabase client (which records every relation a
 * call touched), the store's client (which records every door), the switch, and the
 * signed-in person. For a store organization, touching `content_ir.kind_instance` FAILS the
 * test; for a legacy organization, touching any store door fails it.
 */

const STORE_ORG = "2f4d8a61-7c3e-4b9a-9f1e-6a5b4c3d2e10";
const LEGACY_ORG = "8c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const KIND_DEF = "b3c2d1e0-f9a8-4b7c-8d6e-5f4a3b2c1d0e";
const TABLE = "0b7b4a5e-6d57-4c55-9a61-1f3b3a0f0c11";

type Call = { relation: string; op: string; args: unknown[] };
const tableCalls: Call[] = [];
const doorCalls: Array<{ door: string; args: unknown }> = [];

function builder(relation: string) {
  const b: Record<string, unknown> = {};
  const chain = (op: string) =>
    (...args: unknown[]) => {
      tableCalls.push({ relation, op, args });
      return b;
    };
  for (const op of ["select", "eq", "is", "not", "insert", "update"]) b[op] = chain(op);
  // The person-wide door carries labels, not payloads; the documents are read back by id.
  b.in = (...args: unknown[]) => {
    tableCalls.push({ relation, op: "in", args });
    const ids = args[1] as string[];
    return {
      then: (resolve: (v: unknown) => unknown) =>
        resolve({
          data: ids.map((id) => ({
            id,
            data: { __kind: "wine_tasting", wine_name: "Ridge Monte Bello 2019" },
          })),
          error: null,
        }),
    };
  };
  b.maybeSingle = async () =>
    relation === "content_ir.kind_definition"
      ? { data: { kind: "wine_tasting", version: 3, emitted_json_schema: null }, error: null }
      : { data: { kind_definition: { kind: "wine_tasting" } }, error: null };
  b.single = async () => ({
    data: {
      id: "legacy-row-1",
      title: "Ridge Monte Bello 2019",
      validation_status: "passed",
      kind_version: 3,
      confirmation: "confirmed",
    },
    error: null,
  });
  b.order = async () => ({
    data: [
      {
        id: "legacy-row-1",
        title: "Ridge Monte Bello 2019",
        validation_status: "passed",
        kind_version: 3,
        updated_at: "2026-09-27T09:00:00Z",
        data: { __kind: "wine_tasting", wine_name: "Ridge Monte Bello 2019" },
        archived_at: null,
      },
    ],
    error: null,
  });
  return b;
}

jest.mock("@/utils/supabase/client", () => {
  const client = {
    schema: (schema: string) => ({
      from: (table: string) => builder(`${schema}.${table}`),
      // content_ir.kind_instances_everywhere — the OLD table across every organization.
      rpc: async (name: string, args: unknown) => {
        doorCalls.push({ door: `rpc:${name}`, args });
        return {
          data: {
            success: true,
            total: 2,
            instances: [
              {
                id: "legacy-row-1",
                title: "Ridge Monte Bello 2019",
                validation_status: "passed",
                kind_version: 3,
                updated_at: "2026-09-27T09:00:00Z",
                archived_at: null,
                organization_id: LEGACY_ORG,
                organization_name: "Legacy Cellars",
                created_by: USER,
              },
              {
                // an old-table row of an org that has since adopted the store: never listed twice
                id: "stale-copy",
                title: "Ridge Monte Bello 2019",
                validation_status: "passed",
                kind_version: 3,
                updated_at: "2026-09-27T08:00:00Z",
                archived_at: null,
                organization_id: STORE_ORG,
                organization_name: "Store Cellars",
                created_by: USER,
              },
            ],
          },
          error: null,
        };
      },
    }),
  };
  return { supabase: client, createClient: () => client };
});

jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => [
    { id: STORE_ORG, name: "Store Cellars" },
    { id: LEGACY_ORG, name: "Legacy Cellars" },
  ],
}));

jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: USER } }, error: null }),
}));

jest.mock("@/utils/supabase/writeOne", () => ({
  tryWriteOne: async () => ({ error: null }),
}));

jest.mock("@/lib/list-scope", () => ({
  defaultListFilter: async (_token: string, opts: { ownerColumn?: string; userId: string }) => ({
    ownerOnly: false,
    apply: (q: unknown) => q,
  }),
}));

jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({
  UNIFIED_DATA_CAMPAIGN: {
    // Both organizations have the switch ON: the legacy one differs only in having no
    // `kind_instance` Table — the per-source ramp, not the switch, decides it.
    enabled: async (org: string) => org === STORE_ORG || org === LEGACY_ORG,
  },
}));

jest.mock("@ai-matrx/records-ui", () => ({
  personActor: (id: string) => ({ kind: "person", id }),
  recordsDataSource: (c: unknown) => c,
}));

jest.mock("@ai-matrx/records/core", () => ({
  createRecordsClient: (config: { organizationId: string }) => {
    const door =
      (name: string, answer: (args: any) => unknown) =>
      async (args?: unknown) => {
        doorCalls.push({ door: name, args: { ...(args as object), organizationId: config.organizationId } });
        return { ok: true, data: answer(args) };
      };
    return {
      tableList: door("tableList", () =>
        config.organizationId === STORE_ORG
          ? [{ id: TABLE, slug: "kind_instance", name: "Saved shapes" }]
          : [{ id: "other-table", slug: "contacts", name: "Contacts" }],
      ),
      recordWrite: door("recordWrite", () => "store-record-1"),
      recordWriteGraph: door("recordWriteGraph", () => ({ parent_id: "store-record-2" })),
      list: door("list", () => ({
        rows: [
          {
            id: "store-record-1",
            document: {
              kind_definition_id: KIND_DEF,
              kind_version: 3,
              title: "Ridge Monte Bello 2019",
              validation_status: "pending",
              data: { __kind: "wine_tasting", wine_name: "Ridge Monte Bello 2019" },
            },
            level: "editor",
            hidden: {},
          },
        ],
        total: null,
      })),
      recordHeaders: door("recordHeaders", () => [
        { id: "store-record-1", updated_at: "2026-09-27T10:00:00Z" },
      ]),
      recordDelete: door("recordDelete", () => "2026-09-27T10:05:00Z"),
    };
  },
}));

import {
  listKindInstances,
  saveKindInstance,
  softDeleteKindInstance,
} from "./instance-service";

const touchedLegacyTable = () =>
  tableCalls.some((c) => c.relation === "content_ir.kind_instance");
const writeDoors = () =>
  doorCalls.filter((c) => c.door !== "tableList").map((c) => c.door);

beforeEach(() => {
  tableCalls.length = 0;
  doorCalls.length = 0;
});

describe("a record-store organization", () => {
  it("creates through the store's write door, never content_ir.kind_instance", async () => {
    const saved = await saveKindInstance({
      kindDefinitionId: KIND_DEF,
      kindVersion: 3,
      value: { wine_name: "Ridge Monte Bello 2019" },
      organizationId: STORE_ORG,
      titleKey: "wine_name",
    });
    expect(touchedLegacyTable()).toBe(false);
    expect(saved.id).toBe("store-record-1");
    expect(saved.home?.store).toBe("record");
    const write = doorCalls.find((c) => c.door === "recordWrite");
    expect(write).toBeDefined();
    const args = write!.args as { table_id: string; data: Record<string, unknown> };
    expect(args.table_id).toBe(TABLE);
    expect(args.data).toMatchObject({
      kind_definition_id: KIND_DEF,
      kind_version: 3,
      title: "Ridge Monte Bello 2019",
      created_by: USER,
      organization_id: STORE_ORG,
      // no schema on this kind: said as pending, never promoted to passed
      validation_status: "pending",
    });
    expect((args.data.data as Record<string, unknown>).__kind).toBe("wine_tasting");
  });

  it("writes the produced_by edge with the record, in one graph write", async () => {
    const saved = await saveKindInstance({
      kindDefinitionId: KIND_DEF,
      kindVersion: 3,
      value: { wine_name: "Ridge Monte Bello 2019" },
      organizationId: STORE_ORG,
      producedByMessageId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
    });
    expect(saved.producedByEdgeWritten).toBe(true);
    const graph = doorCalls.find((c) => c.door === "recordWriteGraph");
    expect((graph!.args as { edges: unknown[] }).edges).toEqual([
      { entity: "message", id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", direction: "in", label: "produced_by" },
    ]);
  });

  it("lists every organization's instances: the store's read door for it, the person-wide door for the rest", async () => {
    // The SELECTED organization is irrelevant to what is listed.
    const entries = await listKindInstances(KIND_DEF, "active", undefined, undefined, LEGACY_ORG);
    expect(entries.map((e) => e.id).sort()).toEqual(["legacy-row-1", "store-record-1"]);
    expect(entries.find((e) => e.id === "store-record-1")).toMatchObject({
      organizationId: STORE_ORG,
      organizationName: "Store Cellars",
    });
    expect(entries.find((e) => e.id === "legacy-row-1")).toMatchObject({
      organizationName: "Legacy Cellars",
    });
    expect(entries[0].updatedAt).toBe("2026-09-27T10:00:00Z");
    const list = doorCalls.find((c) => c.door === "list");
    expect((list!.args as { filter: unknown }).filter).toEqual({ kind_definition_id: KIND_DEF });

    tableCalls.length = 0;
    await softDeleteKindInstance("store-record-1", entries.find((e) => e.id === "store-record-1")!.home);
    expect(touchedLegacyTable()).toBe(false);
    expect(doorCalls.find((c) => c.door === "recordDelete")?.args).toMatchObject({
      record_id: "store-record-1",
    });
  });
});

describe("an organization that has not adopted the store for kind records", () => {
  it("creates and lists on content_ir.kind_instance exactly as before", async () => {
    const saved = await saveKindInstance({
      kindDefinitionId: KIND_DEF,
      kindVersion: 3,
      value: { wine_name: "Ridge Monte Bello 2019" },
      organizationId: LEGACY_ORG,
    });
    expect(saved.id).toBe("legacy-row-1");
    expect(saved.home).toBeUndefined();
    const insert = tableCalls.find((c) => c.relation === "content_ir.kind_instance" && c.op === "insert");
    expect(insert?.args[0]).toMatchObject({ organization_id: LEGACY_ORG, created_by: USER });

    const entries = await listKindInstances(KIND_DEF, "active", undefined, undefined, LEGACY_ORG);
    expect(entries.map((e) => e.id)).toContain("legacy-row-1");
    // Reading the store-side organization is fine; a legacy organization never WRITES to a store.
    expect(writeDoors().filter((d) => d.startsWith("recordWrite") || d === "recordDelete")).toEqual([]);
  });

  it("lists the same across-organization set when no organization is selected", async () => {
    const entries = await listKindInstances(KIND_DEF, "active");
    expect(entries.map((e) => e.id).sort()).toEqual(["legacy-row-1", "store-record-1"]);
    expect(doorCalls.some((c) => c.door === "rpc:kind_instances_everywhere")).toBe(true);
  });
});
