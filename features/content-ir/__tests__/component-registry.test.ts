/**
 * The Shape System component resolver (rulings R1 + R6): compiled bootstrap
 * floor, warm DB override, loud-but-recovering warm failure. The DB source
 * is mocked at the module seam — the resolver's own logic is what's under
 * test (the read adapter's row mapping is covered by its own conventions;
 * the live row is verified against the real DB out-of-band).
 */

// component-registry FIRST: it anchors the registry cluster's import cycle
// on kind-registry (the only safe entry — see the cycle note it carries).
import {
  ComponentRegistry,
  resolveComponent,
  type ComponentResolution,
} from "../registry/component-registry";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";
import { getSystemComponentEntries } from "../registry/system-components";
import {
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "../registry/schema-source-kind-components";

jest.mock("../registry/schema-source-kind-components", () => ({
  listKindComponentsFromTables: jest.fn(),
}));

const mockList = listKindComponentsFromTables as jest.MockedFunction<
  typeof listKindComponentsFromTables
>;

// Safe at test-module scope: every import above has fully initialized, so the
// lazy derivation (see system-components.ts cycle note) resolves here.
const SYSTEM_COMPONENT_ENTRIES = getSystemComponentEntries();

function dbRow(
  overrides: Partial<KindComponentProjection> &
    Pick<KindComponentProjection, "kind" | "componentKey">,
): KindComponentProjection {
  return {
    platform: "web",
    role: "output",
    source: "db",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

const OUTPUT_ENTRIES = SYSTEM_COMPONENT_ENTRIES.filter(
  (e) => e.role === "output",
);
const INPUT_ENTRIES = SYSTEM_COMPONENT_ENTRIES.filter(
  (e) => e.role === "input",
);

describe("compiled bootstrap (system-components)", () => {
  it("mirrors EVERY legacyBlockType facet — one web/output entry per bridge, no drift possible", () => {
    const bridged = SYSTEM_KIND_DEFINITIONS.filter((d) => d.legacyBlockType);
    expect(OUTPUT_ENTRIES).toHaveLength(bridged.length);
    expect(OUTPUT_ENTRIES.map((e) => [e.kind, e.componentKey])).toEqual(
      bridged.map((d) => [d.kind, d.legacyBlockType]),
    );
    for (const entry of SYSTEM_COMPONENT_ENTRIES) {
      expect(entry.platform).toBe("web");
      expect(entry.source).toBe("bundled");
    }
  });

  it("D1 input floor: EVERY compiled kind gets one web/input generic_structured entry", () => {
    expect(INPUT_ENTRIES).toHaveLength(SYSTEM_KIND_DEFINITIONS.length);
    expect(INPUT_ENTRIES.map((e) => e.kind)).toEqual(
      SYSTEM_KIND_DEFINITIONS.map((d) => d.kind),
    );
    for (const entry of INPUT_ENTRIES) {
      expect(entry.componentKey).toBe("generic_structured");
    }
  });

  it("covers every known bridge by name", () => {
    const byKind = new Map(OUTPUT_ENTRIES.map((e) => [e.kind, e.componentKey]));
    // This is the named legacy-bridge contract. New compiled bridges are
    // covered exhaustively by the preceding mirror test and must not make this
    // historical name check stale every time a purpose-built renderer lands.
    expect(Object.fromEntries(byKind)).toEqual(expect.objectContaining({
      flashcard_set: "flashcards",
      quiz_set: "quiz",
      presentation_deck: "presentation",
      decision_tree: "decision_tree",
      comparison_set: "comparison_table",
      diagram_spec: "diagram",
      math_problem: "math_problem",
      item_presentation: "item_presentation",
      schema_proposal: "schema_proposal",
      // Gold-mine sweep
      mermaid_diagram: "mermaid",
      task_list: "tasks",
      resource_collection: "resources",
      progress_tracker: "progress_tracker",
      timeline: "timeline",
      structured_info: "structured_info",
      transcript: "transcript",
      troubleshooting_guide: "troubleshooting",
      cooking_recipe: "cooking_recipe",
      research_report: "research",
      questionnaire: "questionnaire",
      video_prompt_options: "video_prompt_options",
      keyword_relationship_research: "keyword_research",
      seo_keyword_relationship_research_result: "seo_keyword_research_result",
      keyword_classification_batch_v1: "keyword_classification_batch",
      page_brief: "page_brief",
      media_chapters: "media_chapters",
      generated_image_set: "generated_image_set",
      generated_video_set: "generated_video_set",
      generated_audio: "generated_audio",
      podcast_episode: "podcast_episode",
      episode_title_options: "episode_title_options",
      masterwork_checkup_finding: "masterwork_checkup_finding",
      agent_result: "agent_result",
      ingested_sources: "ingested_sources",
      study_notes: "study_notes",
      // study_pack_v2: the spoken lessons + the composed pack root.
      lesson_script_set: "lesson_scripts",
      study_pack_set: "study_pack",
      seo_package: "seo_package",
      keyword_serp_intent_analysis_v1: "keyword_serp_intent_analysis",
      memory_aid: "memory_aid",
      memory_hint: "memory_hint",
      plan_page_research: "plan_page_research",
      plan_page_outline: "plan_page_outline",
      plan_page_draft: "plan_page_draft",
      plan_page_review: "plan_page_review",
      cms_page_build: "cms_page_build",
      // Workflow run surfaces — a node's outcome and a run's result render
      // through the registry like any other kind, never as a JSON dump.
      node_outcome: "node_outcome",
      run_result: "run_result",
      // Search kind family (Search Kinds Pilot)
      web_search_results: "web_search_results",
      web_result: "web_result",
      news_result: "news_result",
      video_result: "video_result",
      faq_item: "faq_item",
      discussion_result: "discussion_result",
      local_place: "local_place",
      entity_card: "entity_card",
      ai_answer: "ai_answer",
      rating: "rating",
      opening_hours: "opening_hours",
      postal_address: "postal_address",
      geo_coordinates: "geo_coordinates",
      // Rank / SERP-landscape family (Rank Kinds Run)
      seo_rank_serp_landscape: "seo_rank_serp_landscape",
      serp_placement: "serp_placement",
      seo_rank_reading: "seo_rank_reading",
      seo_rank_target: "seo_rank_target",
      seo_rank_portfolio: "seo_rank_portfolio",
      seo_rank_target_removal: "seo_rank_target_removal",
      provider_run_receipt: "provider_run_receipt",
      // Tabular primitive (Table Kinds Run)
      data_table: "data_table",
      // RAG retrieval + citation family (RAG Kinds Run). `source_ref` is a
      // SYSTEM-WIDE primitive, not a RAG kind — the platform's cited-source
      // shape, nested by every family that says where something came from.
      source_ref: "source_ref",
      retrieved_chunk: "retrieved_chunk",
      rag_search_result: "rag_search_result",
      rag_cross_doc_search_result: "rag_cross_doc_search_result",
      rag_synthesize_result: "rag_synthesize_result",
    }));
  });
});

describe("resolveComponent — compiled floor (pre-warm)", () => {
  it("resolves every compiled entry (both roles) from the compiled tier, trusted-active", () => {
    for (const entry of SYSTEM_COMPONENT_ENTRIES) {
      expect(resolveComponent(entry.kind, "web", entry.role)).toEqual({
        componentKey: entry.componentKey,
        source: "bundled",
        config: {},
        componentSource: null,
        propsTransform: null,
        pinnedKindVersion: null,
        updatedAt: null,
        createdBy: null,
        isActive: true,
        resolvedBy: "compiled",
      } satisfies ComponentResolution);
    }
  });

  it("misses are null: un-bridged output, other platforms, unknowns (both roles)", () => {
    expect(resolveComponent("flashcard", "web", "output")).toBeNull();
    expect(
      resolveComponent("flashcard_set", "react-native", "output"),
    ).toBeNull();
    expect(resolveComponent("never_heard_of_it", "web", "output")).toBeNull();
    expect(resolveComponent("never_heard_of_it", "web", "input")).toBeNull();
  });
});

describe("ComponentRegistry — DB tier", () => {
  it("a DB row for a (kind, platform, role) OVERRIDES the compiled entry once ingested", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    registry.ingestDbRows([
      dbRow({
        kind: "flashcard_set",
        componentKey: "flashcards",
        source: "bundled",
        config: { legacyBlockType: "flashcards" },
      }),
    ]);
    expect(registry.resolve("flashcard_set", "web", "output")).toEqual({
      componentKey: "flashcards",
      source: "bundled",
      config: { legacyBlockType: "flashcards" },
      isActive: true,
      resolvedBy: "db",
      componentSource: null,
      propsTransform: null,
      pinnedKindVersion: null,
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: null,
    });
    // The compiled floor is untouched underneath.
    expect(registry.hasCompiled("flashcard_set", "web", "output")).toBe(true);
  });

  it("a DB-only kind resolves with its own is_active verdict", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    registry.ingestDbRows([
      dbRow({ kind: "timeline_v2", componentKey: "timeline", isActive: false }),
    ]);
    expect(registry.resolve("timeline_v2", "web", "output")).toMatchObject({
      componentKey: "timeline",
      isActive: false,
      resolvedBy: "db",
    });
    expect(registry.hasCompiled("timeline_v2", "web", "output")).toBe(false);
  });

  it("first row per key wins (rows arrive is_default-first / sort_order-asc)", () => {
    const registry = new ComponentRegistry(() => []);
    registry.ingestDbRows([
      dbRow({ kind: "k", componentKey: "default_component" }),
      dbRow({ kind: "k", componentKey: "secondary_component" }),
    ]);
    expect(registry.resolve("k", "web", "output")?.componentKey).toBe(
      "default_component",
    );
  });
});

describe("ComponentRegistry — warm tier", () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it("ensureWarm ingests the DB rows exactly once per session", async () => {
    mockList.mockResolvedValue([
      dbRow({ kind: "warm_kind", componentKey: "warm_component" }),
    ]);
    const registry = new ComponentRegistry(getSystemComponentEntries);

    expect(registry.resolve("warm_kind", "web", "output")).toBeNull();
    await registry.ensureWarm();
    await registry.ensureWarm();

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(registry.resolve("warm_kind", "web", "output")).toMatchObject({
      componentKey: "warm_component",
      resolvedBy: "db",
    });
  });

  it("warm failure: compiled floor keeps serving, ONE console.error, retryable", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      mockList.mockRejectedValue(new Error("db unreachable"));
      const registry = new ComponentRegistry(getSystemComponentEntries);

      await registry.ensureWarm();
      // Compiled fallback still answers.
      expect(registry.resolve("flashcard_set", "web", "output")).toMatchObject({
        componentKey: "flashcards",
        resolvedBy: "compiled",
      });

      // Failure reset the promise — the next call retries the fetch...
      await registry.ensureWarm();
      expect(mockList).toHaveBeenCalledTimes(2);
      // ...but the console scream fired exactly once.
      expect(consoleError).toHaveBeenCalledTimes(1);
      // The scream is worded by the shared resolver
      // (`@ai-matrx/content-ir-react`), which now owns the warm lifecycle.
      expect(String(consoleError.mock.calls[0]?.[0])).toContain(
        "component-resolver warm load failed",
      );

      // Recovery: a later successful fetch upgrades in place.
      mockList.mockResolvedValue([
        dbRow({ kind: "late_kind", componentKey: "late_component" }),
      ]);
      await registry.ensureWarm();
      expect(registry.resolve("late_kind", "web", "output")).toMatchObject({
        componentKey: "late_component",
        resolvedBy: "db",
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("D115 inversion — module init registers the kind-components invalidation", () => {
  it("fireInvalidation(kindComponents) forces a resolver refresh with no import edge from the firer", async () => {
    const { fireInvalidation, INVALIDATION_KEYS } =
      await import("@/lib/invalidation/invalidation-registry");
    mockList.mockClear();
    mockList.mockResolvedValue([]);

    // Importing component-registry (done at this file's top) must have
    // registered the callback — the firer (toolStateEffects) only knows the
    // NAME, so an unregistered name here means the repaint is silently dead.
    expect(fireInvalidation(INVALIDATION_KEYS.kindComponents)).toBe(true);

    // The callback force-refreshes (maxAgeMs 0) → one warm list re-fetch.
    await Promise.resolve();
    expect(mockList).toHaveBeenCalledTimes(1);
  });
});
