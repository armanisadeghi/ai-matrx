// features/unified-data/standard-field-columns/__tests__/whole-result-and-tab-counts.test.ts
//
// Lane 7 W2 fix round 2: (1) the export and the grouped view read the WHOLE result page by page
// under the ceiling and say when it stopped; (2) the CRM scope tabs count with the list's OWN
// predicates whenever the query narrows by something the counts RPC cannot see — a custom-field
// filter, a column filter, or a search that reaches a custom field — so a tab never reads 0 above
// a matching row.

const rpcCalls: string[] = [];
const headCounts: { scope: string; filters: string[] }[] = [];

jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: async () => 100000 }));
jest.mock("@/lib/toast", () => ({ toast: { info: jest.fn() } }));
jest.mock("@/lib/entity-list/readListRpc", () => ({
  readListRpc: async (name: string) => {
    rpcCalls.push(name);
    return { data: [{ scope: "all", total: 0 }], error: null };
  },
}));
// A PostgREST double: records every predicate and answers a HEAD count per lane.
jest.mock("@/utils/supabase/client", () => {
  const make = () => {
    const preds: string[] = [];
    let scope = "";
    const q: Record<string, unknown> = {};
    for (const m of ["is", "not", "eq", "neq", "in", "ilike", "gte", "lte", "gt", "lt", "or", "order", "range", "returns"]) {
      q[m] = (...args: unknown[]) => {
        preds.push(`${m}:${JSON.stringify(args)}`);
        if (m === "eq" && args[0] === "created_by") scope ||= "mine";
        if (m === "in" && args[0] === "organization_id") scope ||= "orgs";
        if (m === "eq" && args[0] === "published_to_web") scope ||= "public";
        return q;
      };
    }
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => {
      const isAll = preds.some((p) => p.startsWith("or:") && p.includes("created_by.eq"));
      headCounts.push({ scope: isAll ? "all" : scope, filters: preds });
      resolve({ count: preds.some((p) => p.includes("home_clinic")) ? 1 : 0, error: null });
    };
    return q;
  };
  const client = { schema: () => ({ from: () => ({ select: () => make() }) }) };
  return { supabase: client, createClient: () => client };
});

import { readWholeResult } from "../wholeResult";
import { standardWholeResultExport } from "../standardWholeResultExport";
import { toast } from "@/lib/toast";
import { fetchPartyScopeCounts } from "@/features/crm/service";
import { DEFAULT_RECORD_CLASS_FILTER, type PartyListQuery } from "@/features/crm/types";
import type { StandardFieldColumn } from "../standardFieldColumns";

const HOME: StandardFieldColumn = {
  key: "home_clinic", label: "Home clinic", behavior: "list", multi: false, isDate: false,
  options: [{ key: "westside", label: "Westside" }, { key: "downtown", label: "Downtown" }], fieldIds: ["f1"],
};

describe("the whole result, not the page", () => {
  it("reads every page in order up to the total", async () => {
    const all = Array.from({ length: 2465 }, (_, i) => ({ id: i }));
    const ranges: [number, number][] = [];
    const out = await readWholeResult(async (from, to) => {
      ranges.push([from, to]);
      return { rows: all.slice(from, to + 1), total: all.length };
    });
    expect(out.rows).toHaveLength(2465);
    expect(out.ceiling).toBeNull();
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops at the ceiling and says how far it got", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const out = await readWholeResult(async (from, to) => ({ rows: all.slice(from, to + 1), total: all.length }), 1500);
    expect(out.rows).toHaveLength(1500);
    expect(out.ceiling).toBe(1500);
  });

  it("the export hands every row, projected onto the columns shown, and says when capped", async () => {
    type Row = { id: string; display_name: string; custom_fields: Record<string, unknown> };
    const rows: Row[] = Array.from({ length: 465 }, (_, i) => ({ id: `p${i}`, display_name: `Person ${i}`, custom_fields: { home_clinic: "westside" } }));
    const build = standardWholeResultExport<Row>({
      columns: [
        { id: "display_name", header: "Name", accessorKey: "display_name" },
        { id: "secret", header: "Hidden", accessorKey: "id" },
        { id: "cf:home_clinic", header: "Home clinic", label: "Home clinic", accessorFn: (r) => r.custom_fields.home_clinic, copyValue: () => "Westside" },
      ],
      hidden: () => ["secret"],
      order: () => ["display_name", "secret", "cf:home_clinic"],
      read: async () => ({ rows, total: 600, ceiling: 465 }),
      noun: "records",
    });
    const config = build();
    expect(config.sheetColumns?.()).toEqual([{ id: "display_name", label: "Name" }, { id: "cf:home_clinic", label: "Home clinic" }]);
    const out = await config.sheetRows!();
    expect(out).toHaveLength(465);
    expect(out[0]).toEqual({ display_name: "Person 0", "cf:home_clinic": "Westside" });
    expect(toast.info).toHaveBeenCalledWith("Exported the first 465 of 600 records");
  });
});

describe("the CRM tabs count what the list shows", () => {
  const ctx = { userId: "u1", orgIds: ["o1"], orgNames: {} } as never;
  const base: PartyListQuery = {
    scope: { kind: "all" }, orgId: null, search: "", kind: "all",
    filters: { record_class: DEFAULT_RECORD_CLASS_FILTER }, page: 1, view: "active",
  };
  beforeEach(() => {
    rpcCalls.length = 0;
    headCounts.length = 0;
  });

  it("an untouched list still asks the one counts RPC", async () => {
    await fetchPartyScopeCounts(base, ctx, [HOME]);
    expect(rpcCalls).toEqual(["crm_list_scope_counts"]);
    expect(headCounts).toHaveLength(0);
  });

  it("a custom-field filter makes every lane count with the list's own predicates", async () => {
    const q = { ...base, filters: { ...base.filters, custom: { home_clinic: { kind: "select" as const, value: "westside", values: ["westside"] } } } };
    const counts = await fetchPartyScopeCounts(q, ctx, [HOME]);
    expect(rpcCalls).toEqual([]);
    expect(counts.byKind.all).toBe(1);
    expect(headCounts.every((c) => c.filters.some((p) => p.includes("custom_fields->>home_clinic")))).toBe(true);
  });

  it("a search that reaches a custom field's words does too", async () => {
    const counts = await fetchPartyScopeCounts({ ...base, search: "Costa Mesa" }, ctx, [HOME]);
    expect(rpcCalls).toEqual([]);
    expect(headCounts.some((c) => c.filters.some((p) => p.includes("custom_fields->>home_clinic.ilike")))).toBe(true);
    expect(Object.keys(counts.byKind).length).toBeGreaterThan(0);
  });

  it("an ordinary column filter is counted by the list too (the class, not only custom fields)", async () => {
    await fetchPartyScopeCounts({ ...base, filters: { ...base.filters, job_title: "Therapist" } }, ctx, []);
    expect(rpcCalls).toEqual([]);
    expect(headCounts.some((c) => c.filters.some((p) => p.includes("job_title")))).toBe(true);
  });
});
