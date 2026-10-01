/**
 * V6-B (2026-10-01, independent production check): the Sources page said "All 79" on its Archived
 * tab while the list said "1–25 of 73", and "1–25 of 97 loaded · 870 matching" on Active; Use
 * existing → Websites listed "Enzyme - Wikipedia" twice. Root cause: every COUNT counted each
 * version of a re-read page (the capture and each recapture) as its own Source, and the list
 * collapsed versions only in the browser, after the page was read. Now the server lists and counts
 * ONE row per Source — the newest version (a capture with no newer recapture in the same archive
 * state) — and every Source read, list and count alike, goes through the one narrowing.
 */
type Call = { op: string; args: unknown[] };
const reads: { table: string; calls: Call[] }[] = [];

function builder(table: string) {
  const calls: Call[] = [];
  reads.push({ table, calls });
  const result = { data: [], error: null, count: 0, status: 200 };
  const b: Record<string, unknown> = {};
  for (const op of ["select", "or", "is", "eq", "neq", "in", "order", "range"]) {
    b[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return b;
    };
  }
  b.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: (table: string) => builder(table), rpc: async () => ({ data: [], error: null }) }),
  },
}));

import { readSourceLaneCounts, readSourcesCounts } from "../hooks/useSources";
import { countSavedSources, fetchSavedSourcesPage } from "@/features/resource-manager/source-input/savedWebPages";
import { NEWER_VERSION_EMBED } from "../sourceRows";

function sourceReads() {
  return reads.filter((r) => r.table === "processed_documents");
}

function assertOneRowPerSource(calls: Call[]) {
  const select = calls.find((c) => c.op === "select");
  expect(String(select?.args[0])).toContain(NEWER_VERSION_EMBED);
  expect(calls).toEqual(
    expect.arrayContaining([
      { op: "eq", args: ["newer_version.derivation_kind", "recapture"] },
      { op: "is", args: ["newer_version", null] },
    ]),
  );
}

beforeEach(() => {
  reads.length = 0;
});

describe("one row per Source — every list and count", () => {
  it("the Saved / All captures counts count Sources, not versions (Active and Archived)", async () => {
    await readSourcesCounts({ kind: "all" }, "u", "", "active");
    await readSourcesCounts({ kind: "all" }, "u", "", "archived");
    expect(sourceReads()).toHaveLength(4);
    sourceReads().forEach((r) => assertOneRowPerSource(r.calls));
  });

  it("the lane tabs count Sources, not versions", async () => {
    await readSourceLaneCounts(["all", "mine"], { organizationId: null, saved: true, teamFilter: null, archived: "archived" }, "u");
    expect(sourceReads()).toHaveLength(2);
    sourceReads().forEach((r) => assertOneRowPerSource(r.calls));
  });

  it("an archived view asks for the newest ARCHIVED version; an active view the newest live one", async () => {
    await readSourcesCounts({ kind: "all" }, "u", "", "archived");
    expect(sourceReads()[0].calls).toEqual(
      expect.arrayContaining([
        { op: "or", args: ["deleted_at.not.is.null,archived_at.not.is.null", { referencedTable: "newer_version" }] },
      ]),
    );
    reads.length = 0;
    await readSourcesCounts({ kind: "all" }, "u", "", "active");
    expect(sourceReads()[0].calls).toEqual(
      expect.arrayContaining([
        { op: "is", args: ["newer_version.deleted_at", null] },
        { op: "is", args: ["newer_version.archived_at", null] },
      ]),
    );
  });

  it("Use existing → Websites counts and lists one row per Source", async () => {
    await countSavedSources("web_page", { kind: "all" } as never, "u", 0);
    await fetchSavedSourcesPage({ group: "web_page", scope: { kind: "all" } as never, userId: "u", offset: 0, limit: 25 });
    expect(sourceReads()).toHaveLength(2);
    sourceReads().forEach((r) => assertOneRowPerSource(r.calls));
  });
});
