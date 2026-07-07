/**
 * progress_tracker kind — structural leg + legacy bridge + XML strategy.
 *
 * Proves the three legs the migration (kind_progress_tracker_full.sql)
 * relies on, against the REAL production code paths:
 *
 *   1. Structural: the converter-emitted JSON Schemas (kindSchemaToJsonSchema
 *      over the splice-ready KindDefinitions, strict + no __kind injection —
 *      the exact options the live flashcard rows use) accept both migration
 *      examples via the REAL gate leg (validateStructuralLeg), and the
 *      storage transform yields the exact data arrays + edges the migration
 *      inserts.
 *   2. Bridge: `toLegacyServerData` derives serverData the real component
 *      family accepts — validateProgressTracker (the family's own floor)
 *      passes, ids/totals synthesize with parser parity, and the
 *      complete-only law holds.
 *   3. Strategy: `progress_tracker_legacy_text` converts a REAL
 *      `<progress_tracker>` region (the live palette template) into a
 *      canonical value that is schema-valid and, bridged, matches what
 *      parseProgressMarkdown produces directly — THE KEYSTONE parity.
 */

import Ajv from "ajv";
import {
  parseProgressMarkdown,
  validateProgressTracker,
} from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import { envelopeFromCompleteValue } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { kindSchemaToStorage } from "../registry/kind-storage-transform";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import type { KindSchema } from "../core/kind-schema.types";
import {
  PROGRESS_TRACKER_KIND_DEFINITIONS,
  progressTrackerMarkdownFromValue,
  progressTrackerServerDataFromEnvelope,
} from "../kinds/progress-tracker";
import { progressTrackerLegacyTextToKindValue } from "../surfaces/progress-tracker-legacy-text";

const SLUGS = ["progress_tracker", "progress_phase", "progress_step"] as const;

function definitionOf(kind: string) {
  const definition = PROGRESS_TRACKER_KIND_DEFINITIONS.find(
    (d) => d.kind === kind,
  );
  if (!definition?.schema) throw new Error(`missing definition for ${kind}`);
  return definition;
}

function schemaOf(kind: string): KindSchema {
  const schema = definitionOf(kind).schema;
  if (!schema) throw new Error(`missing schema for ${kind}`);
  return schema;
}

function resolve(kind: string): KindSchema | undefined {
  return PROGRESS_TRACKER_KIND_DEFINITIONS.find((d) => d.kind === kind)
    ?.schema ?? undefined;
}

/** Converter-emitted provider schema — the exact migration payload recipe. */
function emittedSchemaFor(kind: string): unknown {
  const exported = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: false,
  });
  if (!exported) throw new Error(`no emitted schema for ${kind}`);
  return exported.schema;
}

// ---------------------------------------------------------------------------
// The two migration examples (kind_example rows), verbatim.
// ---------------------------------------------------------------------------

/** Canonical example — the palette's SIMPLE variant shape. */
const SAMPLE_SIMPLE: Record<string, unknown> = {
  __kind: "progress_tracker",
  title: "Learning Progress",
  phases: [
    {
      __kind: "progress_phase",
      name: "React Fundamentals",
      completion_percentage: 60,
      steps: [
        { __kind: "progress_step", text: "Components & JSX", completed: true },
        { __kind: "progress_step", text: "Props & State", completed: true },
        { __kind: "progress_step", text: "Event Handling", completed: true },
        {
          __kind: "progress_step",
          text: "Lifecycle Methods",
          completed: false,
        },
        { __kind: "progress_step", text: "Hooks", completed: false },
      ],
    },
    {
      __kind: "progress_phase",
      name: "Advanced Topics",
      completion_percentage: 25,
      steps: [
        { __kind: "progress_step", text: "Context API", completed: true },
        {
          __kind: "progress_step",
          text: "Performance Optimization",
          completed: false,
        },
        { __kind: "progress_step", text: "Testing", completed: false },
        { __kind: "progress_step", text: "Custom Hooks", completed: false },
      ],
    },
  ],
};

/** Full example — the DETAILED variant union: notes, statuses, timestamps. */
const SAMPLE_FULL: Record<string, unknown> = {
  __kind: "progress_tracker",
  title: "Q4 Platform Launch",
  description: "Everything required to ship the platform by end of quarter.",
  start_date: "2026-10-01",
  target_date: "2026-12-19",
  overall_progress: 33,
  total_items: 6,
  completed_items: 2,
  phases: [
    {
      __kind: "progress_phase",
      id: "phase-build",
      name: "Core Build",
      description: "Engineering workstream for the launch-blocking features.",
      color: "from-blue-500 to-blue-600",
      completion_percentage: 50,
      steps: [
        {
          __kind: "progress_step",
          id: "step-auth",
          text: "Ship authentication flow",
          completed: true,
          priority: "high",
          estimated_hours: 12,
        },
        {
          __kind: "progress_step",
          id: "step-billing",
          text: "Integrate billing provider",
          completed: true,
          priority: "high",
          estimated_hours: 8,
        },
        {
          __kind: "progress_step",
          id: "step-realtime",
          text: "Realtime sync hardening",
          completed: false,
          priority: "medium",
          estimated_hours: 16,
          category: "Infrastructure",
        },
        {
          __kind: "progress_step",
          id: "step-docs",
          text: "Developer documentation pass",
          completed: false,
          priority: "low",
          estimated_hours: 6,
          optional: true,
        },
      ],
    },
    {
      __kind: "progress_phase",
      id: "phase-launch",
      name: "Launch Readiness",
      completion_percentage: 0,
      steps: [
        {
          __kind: "progress_step",
          id: "step-loadtest",
          text: "Load test at 10x projected traffic",
          completed: false,
          priority: "high",
          estimated_hours: 10,
        },
        {
          __kind: "progress_step",
          id: "step-runbook",
          text: "Incident runbook review",
          completed: false,
          priority: "medium",
          estimated_hours: 3,
        },
      ],
    },
  ],
};

// The live palette template (skill.render_definition `progress-tracker`),
// framed the way the accumulator hands region text to a strategy.
const SAMPLE_XML = [
  "<progress_tracker>",
  "### Learning Progress",
  "",
  "**React Fundamentals** (80% complete)",
  "- [x] Components & JSX",
  "- [x] Props & State  ",
  "- [x] Event Handling",
  "- [ ] Lifecycle Methods",
  "- [ ] Hooks",
  "",
  "**Advanced Topics** (20% complete)",
  "- [x] Context API",
  "- [ ] Performance Optimization",
  "- [ ] Testing",
  "- [ ] Custom Hooks",
  "",
  "</progress_tracker>",
].join("\n");

// ---------------------------------------------------------------------------
// 1. Structural leg
// ---------------------------------------------------------------------------

describe("progress_tracker — structural leg (converter-emitted schemas)", () => {
  it("every emitted schema compiles under the REAL gate ajv config", () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    for (const slug of SLUGS) {
      expect(() => ajv.compile(emittedSchemaFor(slug) as object)).not.toThrow();
    }
  });

  it("both migration examples pass validateStructuralLeg against the root schema", () => {
    const schema = emittedSchemaFor("progress_tracker");
    for (const sample of [SAMPLE_SIMPLE, SAMPLE_FULL]) {
      const result = validateStructuralLeg(sample, schema);
      expect(result).toEqual({ ok: true });
    }
  });

  it("rejects a payload missing the required floor (no title / no steps)", () => {
    const schema = emittedSchemaFor("progress_tracker");
    expect(
      validateStructuralLeg({ phases: [] }, schema).ok,
    ).toBe(false);
    expect(
      validateStructuralLeg(
        { title: "X", phases: [{ name: "P" }] },
        schema,
      ).ok,
    ).toBe(false);
  });

  it("storage transform yields the exact data arrays + edges the migration inserts", () => {
    const tracker = kindSchemaToStorage(schemaOf("progress_tracker"));
    expect(tracker.data.map((f) => f.name)).toEqual([
      "title",
      "description",
      "phases",
      "overall_progress",
      "start_date",
      "target_date",
      "total_items",
      "completed_items",
    ]);
    expect(tracker.edges).toEqual([
      { fieldPath: "phases", childKind: "progress_phase", position: 0 },
    ]);

    const phase = kindSchemaToStorage(schemaOf("progress_phase"));
    expect(phase.edges).toEqual([
      { fieldPath: "steps", childKind: "progress_step", position: 0 },
    ]);

    const step = kindSchemaToStorage(schemaOf("progress_step"));
    expect(step.edges).toEqual([]);
    expect(step.data.find((f) => f.name === "priority")).toEqual({
      name: "priority",
      type: "enum",
      values: ["low", "medium", "high"],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Legacy bridge — serverData the real component family accepts
// ---------------------------------------------------------------------------

describe("progress_tracker — legacy bridge (toLegacyServerData)", () => {
  it("passes the dual gate with the canonical sample (activation-ready)", () => {
    const result = runKindDualGate({
      kind: "progress_tracker",
      sample: SAMPLE_SIMPLE,
      emittedJsonSchema: emittedSchemaFor("progress_tracker"),
      definition: definitionOf("progress_tracker"),
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it("derives serverData validateProgressTracker accepts, with parser-parity ids and totals", () => {
    const envelope = envelopeFromCompleteValue(
      SAMPLE_SIMPLE,
      "progress_tracker",
    );
    const serverData = progressTrackerServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    // The component family's own validation contract.
    expect(
      validateProgressTracker(
        serverData as unknown as Parameters<typeof validateProgressTracker>[0],
      ),
    ).toBe(true);

    expect(serverData.title).toBe("Learning Progress");
    const categories = serverData.categories as Array<
      Record<string, unknown> & { items: Record<string, unknown>[] }
    >;
    expect(categories).toHaveLength(2);
    // Synthesized ids use the legacy parser's exact scheme.
    expect(categories[0].id).toBe("category-1");
    expect(categories[1].id).toBe("category-2");
    expect(categories[0].items[0].id).toBe("item-1");
    expect(categories[1].items[0].id).toBe("item-6");
    expect(categories[0].completionPercentage).toBe(60);
    // Computed totals mirror parseProgressMarkdown.
    expect(serverData.totalItems).toBe(9);
    expect(serverData.completedItems).toBe(4);
    expect(serverData.overallProgress).toBe(44);
  });

  it("maps the FULL union — notes, timestamps, priorities, hours, optional, authored ids/totals", () => {
    const envelope = envelopeFromCompleteValue(SAMPLE_FULL, "progress_tracker");
    const serverData = progressTrackerServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    expect(
      validateProgressTracker(
        serverData as unknown as Parameters<typeof validateProgressTracker>[0],
      ),
    ).toBe(true);
    expect(serverData.description).toBe(
      "Everything required to ship the platform by end of quarter.",
    );
    expect(serverData.startDate).toBe("2026-10-01");
    expect(serverData.targetDate).toBe("2026-12-19");
    // Authored totals win over computed ones.
    expect(serverData.overallProgress).toBe(33);
    expect(serverData.totalItems).toBe(6);
    expect(serverData.completedItems).toBe(2);

    const categories = serverData.categories as Array<
      Record<string, unknown> & { items: Record<string, unknown>[] }
    >;
    expect(categories[0].id).toBe("phase-build");
    expect(categories[0].description).toBe(
      "Engineering workstream for the launch-blocking features.",
    );
    expect(categories[0].color).toBe("from-blue-500 to-blue-600");

    const item = categories[0].items[2];
    expect(item).toMatchObject({
      id: "step-realtime",
      text: "Realtime sync hardening",
      completed: false,
      priority: "medium",
      estimatedHours: 16,
      category: "Infrastructure",
    });
    expect(categories[0].items[3].optional).toBe(true);
  });

  it("complete-only law: a streaming envelope yields no serverData", () => {
    const envelope = envelopeFromCompleteValue(
      SAMPLE_SIMPLE,
      "progress_tracker",
    );
    const streaming = {
      ...envelope,
      root: { ...envelope.root, status: "streaming" as const },
    };
    expect(progressTrackerServerDataFromEnvelope(streaming)).toBeUndefined();
  });

  it("declines payloads below the render floor (no phase with a surviving step)", () => {
    const empty = envelopeFromCompleteValue(
      {
        __kind: "progress_tracker",
        title: "Empty",
        phases: [{ __kind: "progress_phase", name: "P", steps: [] }],
      },
      "progress_tracker",
    );
    expect(progressTrackerServerDataFromEnvelope(empty)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. XML strategy — the REAL palette sample converges
// ---------------------------------------------------------------------------

describe("progress_tracker_legacy_text — real <progress_tracker> sample", () => {
  it("converts the live palette template into a schema-valid canonical value", () => {
    const value = progressTrackerLegacyTextToKindValue(SAMPLE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value.__kind).toBe("progress_tracker");
    expect(value.title).toBe("Learning Progress");
    const phases = value.phases as Array<
      Record<string, unknown> & { steps: Record<string, unknown>[] }
    >;
    expect(phases).toHaveLength(2);
    expect(phases[0].name).toBe("React Fundamentals");
    expect(phases[0].completion_percentage).toBe(80);
    expect(phases[0].steps).toHaveLength(5);
    expect(phases[0].steps[0]).toMatchObject({
      __kind: "progress_step",
      text: "Components & JSX",
      completed: true,
    });
    expect(value.total_items).toBe(9);
    expect(value.completed_items).toBe(4);
    expect(value.overall_progress).toBe(44);

    // The converged value is schema-valid, not just bridge-tolerated.
    expect(
      validateStructuralLeg(value, emittedSchemaFor("progress_tracker")),
    ).toEqual({ ok: true });
  });

  it("accepts the splitter's inner-only framing identically (host parity)", () => {
    const inner = SAMPLE_XML.replace(/^<progress_tracker>\n/, "").replace(
      /\n<\/progress_tracker>$/,
      "",
    );
    expect(progressTrackerLegacyTextToKindValue(inner)).toEqual(
      progressTrackerLegacyTextToKindValue(SAMPLE_XML),
    );
  });

  it("KEYSTONE parity: strategy → bridge equals the direct legacy parse", () => {
    const value = progressTrackerLegacyTextToKindValue(SAMPLE_XML);
    if (!value) throw new Error("strategy declined the palette sample");
    const serverData = progressTrackerServerDataFromEnvelope(
      envelopeFromCompleteValue(value, "progress_tracker"),
    );

    const inner = SAMPLE_XML.replace(/^<progress_tracker>\n/, "").replace(
      /\n<\/progress_tracker>$/,
      "",
    );
    const direct = parseProgressMarkdown(inner);

    // Same structural output the component receives on either path.
    expect(serverData).toEqual(JSON.parse(JSON.stringify(direct)));
  });

  it("returns null for a region with no checklist items (loud legacy fallback)", () => {
    expect(
      progressTrackerLegacyTextToKindValue(
        "<progress_tracker>\nJust prose, no checkboxes.\n</progress_tracker>",
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. toMarkdown facet — round-trips through the REAL legacy parser
// ---------------------------------------------------------------------------

describe("progress_tracker — toMarkdown round-trip", () => {
  it("emits the legacy grammar: parseProgressMarkdown recovers the tracker", () => {
    const markdown = progressTrackerMarkdownFromValue(SAMPLE_FULL);
    expect(markdown).toContain("### Q4 Platform Launch");
    expect(markdown).toContain("**Core Build** (50% complete)");
    expect(markdown).toContain(
      "- [ ] Realtime sync hardening {medium} (16h) [category:Infrastructure]",
    );

    const reparsed = parseProgressMarkdown(markdown);
    expect(validateProgressTracker(reparsed)).toBe(true);
    expect(reparsed.title).toBe("Q4 Platform Launch");
    expect(reparsed.categories).toHaveLength(2);
    expect(reparsed.categories[0].items).toHaveLength(4);
    expect(reparsed.categories[0].items[2]).toMatchObject({
      text: "Realtime sync hardening",
      completed: false,
      priority: "medium",
      estimatedHours: 16,
      category: "Infrastructure",
    });
    expect(reparsed.categories[0].items[3].optional).toBe(true);
  });
});
