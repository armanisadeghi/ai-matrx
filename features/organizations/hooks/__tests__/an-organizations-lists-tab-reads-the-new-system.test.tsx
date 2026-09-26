/**
 * Lane MOVER-DELETIONS — an organization's Lists tab after Data tables → new system.
 *
 * The switch archives an organization's older pick lists and each lives on in the record store as a
 * Table of choices under the same id; a new list in a switched organization is born there. The
 * organization's Lists tab (the resource catalogue's `structured_list` entry: useOrgSharedItems for
 * the tab, useContainerInventory for its count, ContainerResourceSheet) read only the older list
 * table, filtered by organization and NOT by archive — so after Harbor Dental Group switched, the tab
 * listed nothing it could open (or the archived older row), and its count said 0. Now:
 *
 *   A. the tab lists the organization's lists that live in the new system
 *      (`custom.organization_pick_lists`), once per id, beside the live older lists;
 *   B. an archived older list row is never listed (`deleted_at is null`);
 *   C. the tile counts them.
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
    // The older-table count: Harbor Dental's older list was archived by the press, so it counts none.
    if (fn === "container_resource_counts") return { data: [{ resource_key: "structured_list", n: 0 }], error: null };
    return { data: [], error: null };
  }),
  schema: (schema: string) => ({
    from: (table: string) => builder(`${schema}.${table}`, []),
    rpc: async (fn: string) => {
      rpcs.push(`${schema}.${fn}`);
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
  await act(async () => {
    root.render(<Probe />);
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

test("A. the tab lists the organization's lists that live in the new system, once each", () => {
  expect(rpcs).toContain("custom.organization_pick_lists");
  expect(seen.items.filter((i) => i.id === STORE_LIST)).toEqual([
    expect.objectContaining({ id: STORE_LIST, title: "Insurance Carriers" }),
  ]);
});

test("B. an archived older list row is never listed", () => {
  const older = calls.find((c) => c.table.endsWith("udt_structured_lists"));
  expect(older).toBeDefined();
  expect(older?.chain).toContainEqual(["is", ["deleted_at", null]]);
});

test("C. the Lists tile counts the lists in the new system", () => {
  expect(seen.count).toBe(1);
});
