/**
 * verify-7 #5 (2026-10-01): admin's Workspace said 0 Websites while the library listed the web
 * pages saved in that organization. The Websites entry has no token and no table, so neither the
 * container RPC nor `entity_kind_counts` reaches it; the tile now counts what Use existing lists
 * for that organization (`countSavedSources`). Red on the parent commit: the tile read 0.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "6f1e2d3c-4b5a-4968-8776-655443322110";
const savedCalls: unknown[][] = [];

const client = {
  rpc: async () => ({ data: [], error: null }),
  schema: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return b;
    },
    rpc: async () => ({ data: [], error: null }),
  }),
};
jest.mock("@/utils/supabase/client", () => ({ supabase: client, createClient: () => client }));
jest.mock("@/features/scopes/service/kindInventory", () => ({ fetchKindCounts: async () => new Map() }));
jest.mock("@/features/user-lists/where-lists-live", () => ({ organizationPickListsInTheNewSystem: async () => [] }));
jest.mock("@/features/resource-manager/source-input/savedWebPages", () => ({
  countSavedSources: async (...args: unknown[]) => {
    savedCalls.push(args);
    return 7;
  },
}));

import { useContainerInventory } from "../useContainerInventory";
import { storeReadsWrapper } from "@/test-utils/store-reads";

it("the Websites tile counts the organization's saved web pages", async () => {
  let websites: number | null | undefined;
  let loading = true;
  function Probe() {
    const inventory = useContainerInventory({ column: "organization_id", value: ORG });
    websites = inventory.counts.website;
    loading = inventory.loading;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const Store = storeReadsWrapper();
  await act(async () => {
    root.render(
      <Store>
        <Probe />
      </Store>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(loading).toBe(false);
  expect(websites).toBe(7);
  expect(savedCalls[0]?.slice(0, 2)).toEqual(["web_page", { kind: "organization", organizationId: ORG }]);
  root.unmount();
});
