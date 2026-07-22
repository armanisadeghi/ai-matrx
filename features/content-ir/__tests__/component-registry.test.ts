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
    const byKind = new Map(
      OUTPUT_ENTRIES.map((e) => [e.kind, e.componentKey]),
    );
    expect(Object.fromEntries(byKind)).toEqual({
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
    });
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
        isActive: true,
        resolvedBy: "compiled",
      } satisfies ComponentResolution);
    }
  });

  it("misses are null: un-bridged output, other platforms, unknowns (both roles)", () => {
    expect(resolveComponent("flashcard", "web", "output")).toBeNull();
    expect(resolveComponent("flashcard_set", "react-native", "output")).toBeNull();
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
      expect(
        registry.resolve("flashcard_set", "web", "output"),
      ).toMatchObject({ componentKey: "flashcards", resolvedBy: "compiled" });

      // Failure reset the promise — the next call retries the fetch...
      await registry.ensureWarm();
      expect(mockList).toHaveBeenCalledTimes(2);
      // ...but the console scream fired exactly once.
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(String(consoleError.mock.calls[0]?.[0])).toContain(
        "component-registry warm load failed",
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
