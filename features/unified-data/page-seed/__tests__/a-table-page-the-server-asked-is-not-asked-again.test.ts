/** @jest-environment jsdom */
// features/unified-data/page-seed/__tests__/a-table-page-the-server-asked-is-not-asked-again.test.ts
//
// LANE PAGE-BUNDLE-2. Dr. Patel's front desk opens "Visits" from a link. The server render asked
// `custom.where_id_opens` and `custom.table_page_bundle` as her and streamed the answers in. The
// page's own stores must hold them, so the browser asks NEITHER door; the bundle must be primed
// BEFORE the organization answer resolves (that answer mounts the records client that consumes it).
// A seed the server could not fill asks the door from the browser, exactly as before.

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: { onAuthStateChange: () => ({}) } }) }));

import { takePrimedTablePageBundle, forgetPrimedTablePageBundles } from "@ai-matrx/records/core";
import { ensureObjectOrganization, forgetObjectOrganizations } from "../../objectOrganization";
import { primeTablePage } from "../primeTablePage";
import type { TablePageSeed } from "../tablePageSeed.server";

const VISITS = "5a1e0000-0000-4000-8000-0000000000aa";
const PATEL = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

function source() {
  const asked: string[] = [];
  return {
    asked,
    rpc: async (fn: string) => {
      asked.push(fn);
      return { data: { kind: "table", organization_id: PATEL, path: `/data/${VISITS}`, live: true }, error: null };
    },
  };
}

const seed = (): TablePageSeed => ({
  tableId: VISITS,
  where: { data: { kind: "table", organization_id: PATEL, path: `/data/${VISITS}`, live: true }, error: null },
  organizationId: PATEL,
  bundle: { data: { parts: [] }, error: null },
});

afterEach(() => {
  forgetObjectOrganizations();
  forgetPrimedTablePageBundles();
});

describe("a table page the server asked", () => {
  it("is answered in the browser without asking where_id_opens, and the bundle is primed first", async () => {
    const s = source();
    primeTablePage(VISITS, Promise.resolve(seed()), s);
    // The page's own question for this id joins the in-flight prime; when its answer lands the
    // bundle is already held for the records client that answer mounts.
    const answer = await ensureObjectOrganization(s, VISITS);
    const bundleHeldWhenOrgResolved = takePrimedTablePageBundle(PATEL, VISITS, null) !== null;
    expect(answer).toMatchObject({ state: "found", organizationId: PATEL });
    expect(bundleHeldWhenOrgResolved).toBe(true);
    expect(s.asked).toEqual([]);
  });

  it("asks where_id_opens from the browser when the server could not", async () => {
    const s = source();
    const served = Promise.resolve(null);
    primeTablePage(VISITS, served, s);
    await served;
    await new Promise((r) => setTimeout(r, 0));
    expect(s.asked).toEqual(["where_id_opens"]);
    expect(takePrimedTablePageBundle(PATEL, VISITS, null)).toBeNull();
  });

  it("takes React's streamed thenable (whose then returns nothing) the same as a promise", async () => {
    const s = source();
    const value = seed();
    // React's deserialized RSC promise: `then` registers callbacks and returns undefined.
    const streamed = { then(onFulfilled: (v: TablePageSeed) => void) { setTimeout(() => onFulfilled(value), 0); } };
    primeTablePage(VISITS, streamed as unknown as Promise<TablePageSeed | null>, s);
    const answer = await ensureObjectOrganization(s, VISITS);
    expect(answer).toMatchObject({ state: "found", organizationId: PATEL });
    expect(s.asked).toEqual([]);
  });
});
