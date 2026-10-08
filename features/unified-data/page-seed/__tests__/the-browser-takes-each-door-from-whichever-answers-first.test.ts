/** @jest-environment jsdom */
// EACH OF THE BROWSER'S FIRST READS IS ANSWERED BY WHICHEVER LANDS FIRST (lane SSR-ROWS-3).
//
// The server streams its `where_id_opens` and the table's bundle even when the person's knob is off.
// The browser's own chain must not ask a door the server already answered (that made knob-off pages
// ~1 s slower: three serial browser reads instead of one), and must not wait for a server that is slow.

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/records-ui/first-page", () => ({
  askTablePageSeed: async ({ dataSource }: { dataSource: { rpc: (fn: string, args: Record<string, unknown>, o: unknown) => Promise<unknown> } }) => {
    await dataSource.rpc("table_page_bundle", { p_organization_id: "0a54df90-eab8-4d07-ab29-81a45fb41e04", p_table_id: "5a1e0000-0000-4000-8000-0000000000aa" }, { schema: "custom" });
    await dataSource.rpc("read_records_page", { p_table_id: "5a1e0000-0000-4000-8000-0000000000aa", p_limit: 100 }, { schema: "custom" });
    return { at: Date.now(), answers: [] };
  },
}));

import { seedKey } from "@ai-matrx/records/core";
import { forgetObjectOrganizations } from "../../objectOrganization";
import { askClientTableSeed } from "../clientTableSeed";
import type { TablePageSeed } from "../tablePageSeed.server";

const VISITS = "5a1e0000-0000-4000-8000-0000000000aa";
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const BUNDLE_ARGS = { p_organization_id: ORG, p_table_id: VISITS };

function network(delayMs: number) {
  const asked: string[] = [];
  return {
    asked,
    source: {
      rpc: (fn: string) => {
        asked.push(fn);
        return new Promise((resolve) =>
          setTimeout(() => resolve({ data: fn === "where_id_opens" ? { kind: "table", organization_id: ORG } : { from: "browser" }, error: null }), delayMs),
        );
      },
      schema: () => ({}),
    } as never,
  };
}

const serverSeed = (): TablePageSeed => ({
  tableId: VISITS,
  where: { data: { kind: "table", organization_id: ORG }, error: null },
  organizationId: ORG,
  bundle: { data: { from: "server" }, error: null },
  records: { at: Date.now(), answers: [{ door: "table_page_bundle", args: BUNDLE_ARGS, data: { from: "server" } }] },
});

beforeEach(() => {
  jest.useFakeTimers();
  forgetObjectOrganizations();
});
afterEach(() => jest.useRealTimers());

it("a door the server already answered is not asked again; the rest are asked at once", async () => {
  const net = network(200);
  const asked = askClientTableSeed(net.source, VISITS, { server: Promise.resolve(serverSeed()) });
  await jest.advanceTimersByTimeAsync(500);
  await asked;
  expect(seedKey("table_page_bundle", BUNDLE_ARGS)).toBeTruthy();
  expect(net.asked).not.toContain("table_page_bundle");
  expect(net.asked).toContain("read_records_page");
});

it("a slow server is never waited for: every door is answered by the browser's own read", async () => {
  const net = network(100);
  const t0 = Date.now();
  const asked = askClientTableSeed(net.source, VISITS, { server: new Promise(() => {}) });
  await jest.advanceTimersByTimeAsync(400);
  const seed = await asked;
  expect(seed?.organizationId).toBe(ORG);
  expect(net.asked).toEqual(["where_id_opens", "table_page_bundle", "read_records_page"]);
  expect(Date.now() - t0).toBeLessThan(1200);
});
