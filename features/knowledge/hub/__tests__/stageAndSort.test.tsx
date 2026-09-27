/**
 * H6a: the Stage facet (from source_list_facts) and per-column sort in the
 * table layout (Name, Kind, Captured by, Stage, When).
 */
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { SourceFacts } from "@/features/sources/sourceRows";
import { narrowByStage, stageCounts, stageOf, type HubStage } from "@/features/knowledge/hub/hubStage";
import { hubStateFromParams, hubStateToParams, DEFAULT_HUB_STATE } from "@/features/knowledge/hub/hubState";
import { hubTableColumns } from "@/features/knowledge/hub/components/HubResults";

const facts = (p: Partial<SourceFacts>): SourceFacts => ({
  chunkCount: 0,
  hasEntities: false,
  attachments: [],
  currentDocumentId: "x",
  currentChunkCount: 0,
  currentHasEntities: false,
  staleChunkCount: 0,
  indexing: false,
  headDocumentId: "x",
  entitiesState: null,
  ...p,
});

describe("stage buckets", () => {
  it("maps facts to the five stages", () => {
    expect(stageOf(facts({}), false)).toBe("not_searchable");
    expect(stageOf(facts({ indexing: true }), false)).toBe("indexing");
    expect(stageOf(facts({ currentChunkCount: 3, currentHasEntities: true }), false)).toBe("searchable");
    expect(stageOf(facts({ staleChunkCount: 5 }), false)).toBe("stale");
    expect(stageOf(facts({ currentChunkCount: 3, entitiesState: "failed:model refused" }), false)).toBe("failed");
    expect(stageOf(undefined, true)).toBe("failed");
    expect(stageOf(undefined, false)).toBeNull();
  });

  const hits: KnowledgeHit[] = [
    { entity: "processed_document", id: "a", title: "A" },
    { entity: "processed_document", id: "b", title: "B" },
    { entity: "processed_document", id: "c", title: "C" },
    { entity: "note", id: "n", title: "Note" },
  ];
  const stageFor = (id: string): HubStage | null => ({ a: "indexing", b: "stale" } as Record<string, HubStage>)[id] ?? null;

  it("narrows loaded hits; non-Sources never match; unread Sources are kept, never hidden on a guess", () => {
    expect(narrowByStage(hits, [], stageFor).length).toBe(4);
    expect(narrowByStage(hits, ["stale"], stageFor).map((h) => h.id)).toEqual(["b", "c"]);
    expect(stageCounts(hits, stageFor)).toEqual({ not_searchable: 0, indexing: 1, searchable: 0, stale: 1, failed: 0 });
  });

  it("the stage filter lives in the URL", () => {
    const qs = hubStateToParams({ ...DEFAULT_HUB_STATE, stage: ["stale", "indexing"] }).toString();
    expect(qs).toBe("stage=indexing%2Cstale");
    expect(hubStateFromParams(new URLSearchParams("stage=failed,bogus")).stage).toEqual(["failed"]);
  });
});

describe("table columns sort", () => {
  const label = (h: KnowledgeHit) => ({ a: "Searchable", b: "Failed", c: "Index stale" } as Record<string, string>)[h.id] ?? "—";
  const cols = hubTableColumns({ label, cell: () => null });
  const col = (id: string) => cols.find((c) => c.id === id)!;
  const rows: KnowledgeHit[] = [
    { entity: "processed_document", id: "a", title: "beta", updated_at: "2026-09-01T00:00:00Z" },
    { entity: "processed_document", id: "b", title: "Alpha", updated_at: "2026-09-03T00:00:00Z" },
    { entity: "processed_document", id: "c", title: "gamma", updated_at: "2026-09-02T00:00:00Z" },
  ];
  const sortBy = (id: string) => {
    const c = col(id);
    const v = c.sortValue ?? c.accessorFn!;
    return [...rows].sort((x, y) => (v(x) as number | string) < (v(y) as number | string) ? -1 : 1).map((r) => r.id);
  };

  it("offers Name, Kind, Captured by, Stage and When, all sortable", () => {
    expect(cols.map((c) => c.header)).toEqual(expect.arrayContaining(["Name", "Kind", "Captured by", "Stage", "When"]));
    expect(cols.every((c) => c.sortable !== false)).toBe(true);
  });
  it("Name sorts case-blind, Stage puts problems first, When sorts by time (newest first by default)", () => {
    expect(sortBy("title")).toEqual(["b", "a", "c"]);
    expect(sortBy("stage")).toEqual(["b", "c", "a"]);
    expect(sortBy("updated")).toEqual(["a", "c", "b"]);
    expect(col("updated").defaultSortDirection).toBe("desc");
  });
  it("without facts there is no Stage column (sample data)", () => {
    expect(hubTableColumns().some((c) => c.id === "stage")).toBe(false);
  });
});
