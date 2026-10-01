/**
 * THE DATA HOME SEARCHES, SORTS, LANES AND STARS IN HAND (DATA-HOME-3A acceptance 1, 2, 6).
 *
 * Arman, 2026-10-01: "no search, no tabular view, not built for many companies". Today's page had
 * no title search at all; these drive the real ranker and the real service the shell calls.
 */
import { createDataHomeService } from "../dataHomeService";
import { parseTokens, scoreRow, withinOneEdit } from "../dataHomeSearch";
import { ownerLabel } from "../dataHomeColumns";
import { tokensToFilters, updatedBucket } from "../dataHomeQuery";
import type { EntityListQuery, EntityListSort } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import { ORGS, bigCorpus, corpus } from "./fixtures";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");

function query(patch: Partial<EntityListQuery> = {}): EntityListQuery {
  return { scope: makeScope("all"), orgId: null, search: "", deep: false, archived: "active", filters: {}, page: 1, ...patch };
}
const SORT: EntityListSort = { sort: "updated", direction: "desc", favoritesFirst: true, pageSize: 25 };

function service(rows = corpus(), starred = new Set<string>()) {
  return createDataHomeService({ load: async () => rows, isStarred: (r) => starred.has(r.id), ownerLabel, now: () => NOW });
}

describe("the ranker", () => {
  it("tolerates one typo on a word of five or more letters, never on a short word", () => {
    expect(withinOneEdit("harbr", "harbor")).toBe(true);
    expect(withinOneEdit("harbro", "harbor")).toBe(false);
    const rows = corpus();
    expect(scoreRow(rows[1]!, "harbr")).not.toBeNull();
    expect(scoreRow(rows[1]!, "jbo")).toBeNull();
  });

  it("parses tokens out of the text and leaves the words", () => {
    const { text, tokens } = parseTokens("kind:form intake org:titan is:starred updated:7d in:title");
    expect(text).toBe("intake");
    expect(tokens).toMatchObject({ kind: ["form"], org: ["titan"], starred: true, updated: "7d", titleOnly: true });
  });
});

describe("the service the shell calls", () => {
  it("defaults to most recently updated first, and sorts both ways by any column", async () => {
    const s = service();
    const desc = await s.fetchPage(query(), SORT);
    expect(desc.rows[0]!.name).toBe("Roof Inspections");
    const byName = await s.fetchPage(query(), { ...SORT, sort: "name", direction: "asc" });
    expect(byName.rows.map((r) => r.name)[0]).toBe("Client Intake");
    const byNameDesc = await s.fetchPage(query(), { ...SORT, sort: "name", direction: "desc" });
    expect(byNameDesc.rows[0]!.name).toBe("Roof Inspections");
  });

  it("typing harbor ranks Harbor Dental's tables first; titanium finds tables by their organization", async () => {
    const s = service();
    const harbor = await s.fetchPage(query({ search: "harbor" }), SORT);
    expect(harbor.rows[0]!.name).toBe("Harbor Hygiene Schedule");
    expect(harbor.rows.every((r) => r.organizationName === ORGS.harbor.name)).toBe(true);
    const titanium = await s.fetchPage(query({ search: "titanium" }), SORT);
    expect(titanium.rows.map((r) => r.name).sort()).toEqual(["Client Intake", "Roof Inspections"]);
    const typo = await s.fetchPage(query({ search: "harbr" }), SORT);
    expect(typo.rows.length).toBeGreaterThan(0);
  });

  it("Title only excludes a match on the organization's name alone", async () => {
    const s = service();
    const all = await s.fetchPage(query({ search: "titanium" }), SORT);
    expect(all.total).toBe(2);
    const titleOnly = await s.fetchPage(query({ search: "titanium", filters: { title_only: { kind: "boolean", value: true } } }), SORT);
    expect(titleOnly.total).toBe(0);
  });

  it("kind:form filters as a token, and finished tokens become filter-bag entries", async () => {
    const s = service();
    const forms = await s.fetchPage(query({ search: "kind:form" }), SORT);
    expect(forms.rows.every((r) => r.kind === "form")).toBe(true);
    expect(forms.total).toBe(2);
    const parsed = tokensToFilters("kind:form ", { kinds: ["table", "form"], organizations: [] });
    expect(parsed).toEqual({ search: "", filters: { kind: { kind: "select", values: ["form"] } } });
  });

  it("the lanes are the shell's: All is Mine ∪ Team ∪ My Orgs ∪ Shared; Public waits in its own lane", async () => {
    const s = service();
    const counts = await s.fetchCounts(query());
    expect(counts.byKind).toMatchObject({ all: 6, mine: 2, shared: 1, public: 1 });
    const pub = await s.fetchPage(query({ scope: makeScope("public") }), SORT);
    expect(pub.rows.map((r) => r.name)).toEqual(["Public Price Sheet"]);
    // Each organization's count, for the organization filter.
    expect(counts.narrow.all?.find((o) => o.id === ORGS.titanium.id)?.count).toBe(2);
  });

  it("the organization filter narrows every lane and the counts", async () => {
    const s = service();
    const page = await s.fetchPage(query({ orgId: ORGS.titanium.id }), SORT);
    expect(page.rows.every((r) => r.organizationId === ORGS.titanium.id)).toBe(true);
    const counts = await s.fetchCounts(query({ orgId: ORGS.titanium.id }));
    expect(counts.byKind.all).toBe(2);
  });

  it("a starred row moves to the top, is:starred lists only starred, unstarred it goes back", async () => {
    const rows = corpus();
    const starred = new Set<string>();
    const target = rows.find((r) => r.name === "Public Price Sheet" ? false : r.name === "Harbor Hygiene Schedule")!;
    const before = await service(rows, starred).fetchPage(query(), SORT);
    expect(before.rows[0]!.id).not.toBe(target.id);
    starred.add(target.id);
    const after = await service(rows, starred).fetchPage(query(), SORT);
    expect(after.rows[0]!.id).toBe(target.id);
    const only = await service(rows, starred).fetchPage(query({ search: "is:starred" }), SORT);
    expect(only.rows.map((r) => r.id)).toEqual([target.id]);
    starred.delete(target.id);
    const back = await service(rows, starred).fetchPage(query(), SORT);
    expect(back.rows.map((r) => r.id)).toEqual(before.rows.map((r) => r.id));
  });

  it("a grouped view gets every row in one page, so a group's count is the filtered set's", async () => {
    const s = service();
    const all = await s.fetchPage(query(), { ...SORT, pageSize: 100_000 });
    expect(all.rows.length).toBe(all.total);
    const facets = await s.fetchFacets(query());
    const forms = facets.byKind.kind?.find((f) => f.value === "form")?.count;
    expect(forms).toBe(all.rows.filter((r) => r.kind === "form").length);
  });

  it("Updated groups by a bucket a person reads, never one group per timestamp", () => {
    expect(updatedBucket("2026-09-30T20:00:00.000Z", NOW)).toBe("Today");
    expect(updatedBucket("2026-09-27T00:00:00.000Z", NOW)).toBe("This week");
    expect(updatedBucket(null, NOW)).toBe("");
  });

  it("ranks 3,000 rows in under 50 ms per keystroke", async () => {
    const rows = bigCorpus();
    const s = service(rows);
    await s.fetchPage(query({ search: "h" }), SORT); // warm the index (the first load)
    const times: number[] = [];
    for (const typed of ["ha", "har", "harb", "harbo", "harbor"]) {
      const t0 = performance.now();
      const page = await s.fetchPage(query({ search: typed }), SORT);
      times.push(performance.now() - t0);
      if (typed === "harbor") expect(page.rows[0]!.name).toBe("Harbor Dental Recall");
    }
    expect(Math.max(...times)).toBeLessThan(50);
  });
});
