/**
 * Lane MOVER-DELETIONS — an organization's Lists tab reads the record store.
 *
 * Every pick list lives in the record store as a Table of choices. The organization's Lists tab
 * (the resource catalogue's `structured_list` entry: useOrgSharedItems for the tab,
 * useContainerInventory for its count) must:
 *
 *   A. list the organization's lists from the store's list index, once per id;
 *   B. read no workbench table for them;
 *   C. count them on the tile.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const HARBOR = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const STORE_LIST = "5b7a3f1e-2c4d-4e8f-9a1b-3c5d7e9f1a2b";

const calls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

/** A PostgREST builder that records what is chained on it and answers `rows`. */
function builder(table: string, rows: unknown[]) {
  const entry = { table, chain: [] as Array<[string, unknown[]]> };
  calls.push(entry);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "in", "limit", "neq"]) {
    b[m] = (...args: unknown[]) => {
      entry.chain.push([m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return b;
}

const rpcs: string[] = [];
const client = {
  rpc: jest.fn(async (fn: string) => {
    rpcs.push(fn);
    // The container count holds no list: lists are counted from the store.
    if (fn === "container_resource_counts") return { data: [{ resource_key: "structured_list", n: 0 }], error: null };
    return { data: [], error: null };
  }),
  schema: (schema: string) => ({
    from: (table: string) => builder(`${schema}.${table}`, []),
    rpc: async (fn: string) => {
      rpcs.push(`${schema}.${fn}`);
      if (schema === "custom" && fn === "pick_list_index") {
        return {
          data: { lists: [{ id: STORE_LIST, list_name: "Insurance Carriers", description: "Dental plans we bill", updated_at: "2026-09-26T16:26:44Z", item_count: 4 }], archived_ids: [] },
          error: null,
        };
      }
      if (schema === "custom" && fn === "organization_pick_lists") {
        return {
          data: [{ id: STORE_LIST, list_name: "Insurance Carriers", description: "Dental plans we bill", updated_at: "2026-09-26T16:26:44Z", lives_in: "record" }],
          error: null,
        };
      }
      return { data: [], error: null };
    },
  }),
  from: (table: string) => builder(`public.${table}`, []),
};

jest.mock("@/utils/supabase/client", () => ({ supabase: client, createClient: () => client }));
jest.mock("@/utils/permissions/orgModeration", () => ({ listOrgShareGrants: async () => [] }));

import { ORG_RESOURCE_CATALOGUE } from "../../resource-catalogue";
import { useOrgSharedItems } from "../useOrgSharedItems";
import { useContainerInventory } from "../useContainerInventory";
import { storeReadsWrapper } from "@/test-utils/store-reads";

const LISTS = ORG_RESOURCE_CATALOGUE.find((e) => e.key === "structured_list") ?? null;

const seen: { items: Array<{ id: string; title: string }>; loading: boolean; count: number | null | undefined } = {
  items: [],
  loading: true,
  count: undefined,
};

function Probe() {
  const shared = useOrgSharedItems(HARBOR, LISTS);
  const inventory = useContainerInventory({ column: "organization_id", value: HARBOR });
  seen.items = shared.items;
  seen.loading = shared.loading || inventory.loading;
  seen.count = inventory.counts.structured_list;
  return null;
}

let root: Root;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  calls.length = 0;
  rpcs.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // A fresh store per test: each test is a first visit to the organization.
  const Store = storeReadsWrapper();
  await act(async () => {
    root.render(
      <Store>
        <Probe />
      </Store>,
    );
  });
  for (let i = 0; i < 20 && seen.loading; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("A. the tab lists the organization's lists from the record store, once each", () => {
  expect(rpcs.some((fn) => fn === "custom.pick_list_index" || fn === "custom.organization_pick_lists")).toBe(true);
  expect(seen.items.filter((i) => i.id === STORE_LIST)).toEqual([
    expect.objectContaining({ id: STORE_LIST, title: "Insurance Carriers" }),
  ]);
});

test("B. no workbench table is read for the lists", () => {
  expect(calls.filter((c) => c.table.startsWith("workbench."))).toEqual([]);
});

test("C. the Lists tile counts the lists in the record store", () => {
  expect(seen.count).toBe(1);
});
