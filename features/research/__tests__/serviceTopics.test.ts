/**
 * Research-project decoupling tests (Phase 1/2 —
 * common-docs/research-project-decoupling/FEATURE.md):
 *
 *  - createTopic requires NO project; org is an explicit argument (canonical
 *    app context at the call site), never derived from a project.
 *  - When a projectId is given, exactly one canonical association edge
 *    (research_topic → project) is written through the associationsService
 *    chokepoint.
 *  - An edge-write failure NEVER deletes/invalidates the topic — it surfaces
 *    as a loud, retryable `projectLink` outcome.
 *  - Project-filtered topic lists are association-backed: edge query first,
 *    then ONE batched `.in("id", …)` topic read (never a project_id column
 *    filter).
 */

// Chainable Supabase query mock. Every builder method returns the builder;
// awaiting it (or calling .single()) resolves the configured result.
interface MockResult {
  data: unknown;
  error: unknown;
}

type Call = { method: string; args: unknown[] };

function makeBuilder(result: MockResult, calls: Call[]) {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  for (const m of ["select", "insert", "update", "delete", "is", "eq", "in", "order", "limit"]) {
    builder[m] = chain(m);
  }
  builder.single = jest.fn(() => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve(result);
  });
  // Awaitable builder for list reads.
  builder.then = (
    resolve: (r: MockResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const supabaseState: { result: MockResult; calls: Call[] } = {
  result: { data: null, error: null },
  calls: [],
};

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn((schema: string) => ({
      from: jest.fn((table: string) => {
        supabaseState.calls.push({ method: "from", args: [schema, table] });
        return makeBuilder(supabaseState.result, supabaseState.calls);
      }),
    })),
    rpc: jest.fn(() => Promise.resolve(supabaseState.result)),
  },
}));

const mockAdd = jest.fn();
const mockListForTargets = jest.fn();
const mockListForSources = jest.fn();
const mockSetTargets = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: (...args: unknown[]) => mockAdd(...args),
    listForTargets: (...args: unknown[]) => mockListForTargets(...args),
    listForSources: (...args: unknown[]) => mockListForSources(...args),
    setTargets: (...args: unknown[]) => mockSetTargets(...args),
    listForEntity: jest.fn(),
    remove: jest.fn(),
  },
}));

import {
  createTopic,
  getTopicsForProjects,
  getTopicProjectLinks,
  setTopicProject,
} from "../service";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const TOPIC_ID = "33333333-3333-3333-3333-333333333333";

/** Minimal rs_topic row with the fields `rowToResearchTopic` touches. */
function topicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOPIC_ID,
    name: "Test topic",
    organization_id: ORG_ID,
    // Non-authoritative leftover column (Phase-4 pending drop) — the mapper
    // must strip it from the domain shape.
    project_id: null,
    autonomy_level: "semi",
    tag_suggestions: null,
    max_keywords: 3,
    scrapes_per_keyword: 5,
    analyses_per_keyword: 3,
    max_keyword_syntheses: 3,
    max_project_syntheses: 1,
    max_documents: 1,
    max_tag_consolidations: 0,
    max_auto_tag_calls: 0,
    created_at: "2026-07-21T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabaseState.calls = [];
  supabaseState.result = { data: topicRow(), error: null };
});

describe("createTopic (project-optional)", () => {
  it("creates a topic with NO project and writes no association edge", async () => {
    const { topic, projectLink } = await createTopic(ORG_ID, {
      name: "Test topic",
    });

    expect(topic.id).toBe(TOPIC_ID);
    expect(projectLink).toEqual({ ok: true });
    expect(mockAdd).not.toHaveBeenCalled();

    // The insert payload must NOT contain project_id.
    const insertCall = supabaseState.calls.find((c) => c.method === "insert");
    if (!insertCall) throw new Error("expected an insert call");
    expect(insertCall.args[0]).not.toHaveProperty("project_id");
    expect(insertCall.args[0]).toMatchObject({
      organization_id: ORG_ID,
      name: "Test topic",
    });
  });

  it("writes exactly one research_topic → project edge when a project is chosen", async () => {
    mockAdd.mockResolvedValue({ ok: true, data: { id: "edge-1" } });

    const { projectLink } = await createTopic(
      ORG_ID,
      { name: "Test topic" },
      { projectId: PROJECT_ID },
    );

    expect(projectLink.ok).toBe(true);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "research_topic",
        sourceId: TOPIC_ID,
        targetType: "project",
        targetId: PROJECT_ID,
      }),
    );
  });

  it("keeps the topic valid and surfaces a retryable warning when the edge write fails", async () => {
    mockAdd.mockResolvedValue({
      ok: false,
      error: { message: "association rule missing" },
    });

    const { topic, projectLink } = await createTopic(
      ORG_ID,
      { name: "Test topic" },
      { projectId: PROJECT_ID },
    );

    // Topic survives — no delete, no throw.
    expect(topic.id).toBe(TOPIC_ID);
    expect(
      supabaseState.calls.filter((c) => c.method === "delete"),
    ).toHaveLength(0);
    expect(projectLink.ok).toBe(false);
    expect(projectLink.error).toContain("association rule missing");
  });

  it("still requires an organization (canonical app context, never project-derived)", async () => {
    await expect(createTopic("", { name: "Test topic" })).rejects.toThrow(
      "Organization is required",
    );
  });

  it("maps the Phase-4-pending max_project_syntheses column to max_topic_syntheses", async () => {
    const { topic } = await createTopic(ORG_ID, { name: "Test topic" });
    expect(topic.max_topic_syntheses).toBe(1);
    expect(topic).not.toHaveProperty("max_project_syntheses");
    expect(topic).not.toHaveProperty("project_id");
  });
});

describe("association-backed project filtering", () => {
  it("resolves topics via edges + ONE batched .in('id', …) read", async () => {
    mockListForTargets.mockResolvedValue({
      ok: true,
      data: {
        edges: [
          {
            id: "e1",
            targetId: PROJECT_ID,
            sourceType: "research_topic",
            sourceId: TOPIC_ID,
            role: null,
            label: null,
            position: null,
            metadata: {},
            orgId: ORG_ID,
            createdAt: "2026-07-21T00:00:00Z",
          },
          // A non-topic edge on the same project must be ignored.
          {
            id: "e2",
            targetId: PROJECT_ID,
            sourceType: "task",
            sourceId: "44444444-4444-4444-4444-444444444444",
            role: null,
            label: null,
            position: null,
            metadata: {},
            orgId: ORG_ID,
            createdAt: "2026-07-21T00:00:00Z",
          },
        ],
      },
    });
    supabaseState.result = { data: [topicRow()], error: null };

    const topics = await getTopicsForProjects([PROJECT_ID]);

    expect(mockListForTargets).toHaveBeenCalledWith("project", [PROJECT_ID]);
    const inCall = supabaseState.calls.find((c) => c.method === "in");
    if (!inCall) throw new Error("expected a batched .in() call");
    expect(inCall.args).toEqual(["id", [TOPIC_ID]]);
    // Never a project_id column filter.
    const eqCalls = supabaseState.calls.filter((c) => c.method === "eq");
    for (const c of eqCalls) expect(c.args[0]).not.toBe("project_id");
    expect(topics).toHaveLength(1);
    expect(topics[0].id).toBe(TOPIC_ID);
  });

  it("returns [] without touching rs_topic when the project has no topic edges", async () => {
    mockListForTargets.mockResolvedValue({ ok: true, data: { edges: [] } });

    const topics = await getTopicsForProjects([PROJECT_ID]);

    expect(topics).toEqual([]);
    expect(supabaseState.calls.filter((c) => c.method === "from")).toHaveLength(
      0,
    );
  });

  it("getTopicProjectLinks keys the first project edge per topic", async () => {
    mockListForSources.mockResolvedValue({
      ok: true,
      data: {
        edges: [
          {
            id: "e1",
            sourceId: TOPIC_ID,
            targetType: "project",
            targetId: PROJECT_ID,
            role: null,
            label: null,
            position: null,
            metadata: {},
            orgId: ORG_ID,
            createdAt: "2026-07-21T00:00:00Z",
          },
        ],
      },
    });

    const links = await getTopicProjectLinks([TOPIC_ID]);
    expect(mockListForSources).toHaveBeenCalledWith(
      "research_topic",
      [TOPIC_ID],
      "project",
    );
    expect(links).toEqual({ [TOPIC_ID]: PROJECT_ID });
  });

  it("setTopicProject uses setTargets replace-semantics (and clears with [])", async () => {
    mockSetTargets.mockResolvedValue({ ok: true, data: null });

    await setTopicProject(TOPIC_ID, PROJECT_ID);
    expect(mockSetTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "research_topic",
        sourceId: TOPIC_ID,
        targetType: "project",
        targetIds: [PROJECT_ID],
      }),
    );

    await setTopicProject(TOPIC_ID, null);
    expect(mockSetTargets).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetIds: [] }),
    );
  });
});
