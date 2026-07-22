import {
  finalizeStages,
  sourcesDiscoveredFromItems,
  type PipelineState,
  type StageKind,
  type StageState,
  type WorkItem,
} from "../usePipelineProgress";

function emptyStage(kind: StageKind): StageState {
  return {
    kind,
    status: "pending",
    items: {},
    itemOrder: [],
    totals: { started: 0, succeeded: 0, failed: 0 },
    recentCompletions: [],
    startedAt: null,
    completedAt: null,
  };
}

function baseState(overrides?: Partial<PipelineState>): PipelineState {
  const kinds: StageKind[] = [
    "search",
    "scrape",
    "analyze",
    "synthesize",
    "report",
  ];
  const stages = Object.fromEntries(
    kinds.map((k) => [k, emptyStage(k)]),
  ) as Record<StageKind, StageState>;
  return {
    stages,
    activeStage: null,
    startedAt: null,
    completedAt: null,
    infos: [],
    iterationMode: null,
    ...overrides,
  };
}

describe("finalizeStages", () => {
  it("marks phase-activated empty stages as skipped, not green complete", () => {
    const state = baseState({
      startedAt: 1_000,
      stages: {
        ...baseState().stages,
        search: {
          ...emptyStage("search"),
          status: "active",
          startedAt: 1_100,
        },
        scrape: {
          ...emptyStage("scrape"),
          status: "active",
          startedAt: 1_200,
        },
        analyze: {
          ...emptyStage("analyze"),
          status: "active",
          startedAt: 1_300,
          totals: { started: 8, succeeded: 6, failed: 2 },
          itemOrder: ["a1"],
          items: {
            a1: {
              id: "a1",
              label: "src",
              status: "success",
              metadata: {},
              startedAt: 1_300,
              updatedAt: 1_400,
              completedAt: 1_400,
            },
          },
        },
      },
    });

    const next = finalizeStages(state, 2_000);

    expect(next.stages.search.status).toBe("skipped");
    expect(next.stages.search.startedAt).toBeNull();
    expect(next.stages.search.completedAt).toBeNull();
    expect(next.stages.scrape.status).toBe("skipped");
    expect(next.stages.analyze.status).toBe("partial");
    expect(next.stages.analyze.completedAt).toBe(2_000);
    expect(next.activeStage).toBeNull();
  });

  it("keeps never-touched stages pending", () => {
    const next = finalizeStages(baseState({ startedAt: 1 }), 2);
    expect(next.stages.search.status).toBe("pending");
    expect(next.stages.scrape.status).toBe("pending");
  });
});

describe("sourcesDiscoveredFromItems", () => {
  it("prefers stored_count over sources_found", () => {
    const items: Array<Pick<WorkItem, "metadata">> = [
      { metadata: { stored_count: 10, sources_found: 99 } },
      { metadata: { sources_found: 5 } },
      { metadata: {} },
    ];
    expect(sourcesDiscoveredFromItems(items)).toBe(15);
  });
});
