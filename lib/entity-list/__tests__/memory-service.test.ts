/**
 * createMemoryListService — search, filter, sort, paging and facets run over
 * the WHOLE loaded corpus, never the visible page; a failed load is retried,
 * never cached as an empty list.
 */
import { createMemoryListService } from "../memoryService";
import { DEFAULT_ENTITY_LIST_QUERY, NONE_VALUE, type EntityListQuery } from "../types";

interface Row {
  id: string;
  repo: string;
  severity: "high" | "low";
  line: number | null;
}

const ROWS: Row[] = [
  { id: "a", repo: "aidream", severity: "low", line: 10 },
  { id: "b", repo: "matrx-frontend", severity: "high", line: 2 },
  { id: "c", repo: "aidream", severity: "high", line: null },
  { id: "d", repo: "", severity: "low", line: 7 },
];
const RANK = { high: 2, low: 1 };

function service(load: () => Promise<Row[]> = async () => ROWS) {
  return createMemoryListService<Row>({
    load,
    scope: "system",
    defaultSort: "repo",
    fields: {
      repo: { value: (r) => r.repo, facet: true, search: true },
      severity: { value: (r) => r.severity, sortValue: (r) => RANK[r.severity], facet: true },
      line: { value: (r) => r.line },
    },
  });
}

const q = (patch: Partial<EntityListQuery> = {}): EntityListQuery => ({
  ...DEFAULT_ENTITY_LIST_QUERY,
  scope: { kind: "system" },
  ...patch,
});
const sort = (s: string, direction: "asc" | "desc" = "asc", pageSize = 50) => ({
  sort: s,
  direction,
  favoritesFirst: false,
  pageSize,
});

describe("createMemoryListService", () => {
  it("pages over the whole filtered set and reports the true total", async () => {
    const page = await service().fetchPage(q({ page: 2 }), sort("repo", "asc", 2));
    expect(page.total).toBe(4);
    expect(page.rows.map((r) => r.id)).toEqual(["b", "d"]); // empty repo sinks last
  });

  it("sorts by sortValue when a field declares one", async () => {
    const page = await service().fetchPage(q(), sort("severity", "desc"));
    expect(page.rows.slice(0, 2).map((r) => r.severity)).toEqual(["high", "high"]);
  });

  it("filters by select values, including the none sentinel", async () => {
    const svc = service();
    const aidream = await svc.fetchPage(
      q({ filters: { repo: { kind: "select", values: ["aidream"] } } }),
      sort("repo"),
    );
    expect(aidream.rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
    const none = await svc.fetchPage(
      q({ filters: { repo: { kind: "select", values: [NONE_VALUE] } } }),
      sort("repo"),
    );
    expect(none.rows.map((r) => r.id)).toEqual(["d"]);
  });

  it("facets skip their own filter so every option stays choosable", async () => {
    const facets = await service().fetchFacets(
      q({ filters: { repo: { kind: "select", values: ["aidream"] } } }),
    );
    expect(facets.byKind.repo).toEqual([
      { value: "aidream", count: 2 },
      { value: NONE_VALUE, count: 1 },
      { value: "matrx-frontend", count: 1 },
    ]);
    // Severity facet IS narrowed by the repo filter.
    expect(facets.byKind.severity).toEqual([
      { value: "high", count: 1 },
      { value: "low", count: 1 },
    ]);
  });

  it("searches only the fields marked searchable", async () => {
    const counts = await service().fetchCounts(q({ search: "frontend" }));
    expect(counts.byKind.system).toBe(1);
  });

  it("retries a failed load instead of caching an empty corpus", async () => {
    let calls = 0;
    const svc = service(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return ROWS;
    });
    await expect(svc.fetchCounts(q())).rejects.toThrow("network");
    const counts = await svc.fetchCounts(q());
    expect(counts.byKind.system).toBe(4);
  });
});
