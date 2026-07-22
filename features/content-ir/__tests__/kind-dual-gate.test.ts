/**
 * The dual gate (Arman's law) — a kind is `is_active` only when its sample
 * passes BOTH the structural (Pydantic/ajv-over-emitted_json_schema) leg and
 * the render (bridge-produces-real-serverData) leg. The emitted schema is
 * produced by the REAL emitter so the structural leg is tested end-to-end.
 */

import type { KindSchema } from "../core/kind-schema.types";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  runKindDualGate,
  describeDualGateFailure,
  type DualGateDefinition,
} from "../registry/kind-dual-gate";

const SCHEMAS: Record<string, KindSchema> = {
  flashcard_set: {
    kind: "flashcard_set",
    fields: {
      title: { type: "string", required: true },
      cards: { type: "array", itemKinds: ["flashcard"], required: true },
    },
  },
  flashcard: {
    kind: "flashcard",
    fields: {
      front: { type: "string", required: true },
      back: { type: "string", required: true },
    },
  },
};

// The plain, __kind-less, strict emitted_json_schema (what Pydantic mirrors).
const emittedJsonSchema = kindSchemaToJsonSchema(
  "flashcard_set",
  (k) => SCHEMAS[k],
  { strict: true, injectKind: false },
)!.schema;

// A well-formed sample in block form (carries __kind at every level).
const goodSample = {
  __kind: "flashcard_set",
  title: "Cell Biology",
  cards: [
    { __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" },
    { __kind: "flashcard", front: "Genetic material?", back: "DNA" },
  ],
};

// A bridge that derives real serverData (the healthy render path).
const goodDef: DualGateDefinition = {
  legacyBlockType: "flashcards",
  toLegacyServerData: (env) => ({
    cards: (env.root.value.cards as unknown[]) ?? [],
  }),
};

describe("kind dual gate", () => {
  it("passes when a good sample clears BOTH legs", () => {
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: goodSample,
      emittedJsonSchema,
      definition: goodDef,
    });
    expect(result.structural.ok).toBe(true);
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
    expect(describeDualGateFailure("flashcard_set", result)).toBe("");
  });

  it("fails the structural leg when a required child field is missing", () => {
    const badSample = {
      __kind: "flashcard_set",
      title: "T",
      cards: [{ __kind: "flashcard", front: "only front" }], // no `back`
    };
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: badSample,
      emittedJsonSchema,
      definition: goodDef,
    });
    expect(result.structural.ok).toBe(false);
    expect(result.isActive).toBe(false);
    expect(describeDualGateFailure("flashcard_set", result)).toContain(
      "structural(Pydantic)",
    );
  });

  it("fails the structural leg on an extra property (strict additionalProperties)", () => {
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: { ...goodSample, surprise: "extra" },
      emittedJsonSchema,
      definition: goodDef,
    });
    expect(result.structural.ok).toBe(false);
    expect(result.isActive).toBe(false);
  });

  it("fails the render leg when the bridge produces empty serverData", () => {
    const emptyBridge: DualGateDefinition = {
      legacyBlockType: "flashcards",
      toLegacyServerData: () => ({}), // the "No flashcards available" failure
    };
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: goodSample,
      emittedJsonSchema,
      definition: emptyBridge,
    });
    expect(result.structural.ok).toBe(true);
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);
    expect(describeDualGateFailure("flashcard_set", result)).toContain(
      "render(UI)",
    );
  });

  it("fails the render leg when the kind has no component", () => {
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: goodSample,
      emittedJsonSchema,
      definition: null,
    });
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);
  });
});

// ─── The render leg is SEMANTIC, not a keys-count proxy ─────────────────────
// Before this suite, `validateRender` failed only on `Object.keys().length === 0`,
// so a bridge returning one junk key — or a fully-shaped-but-empty payload —
// sailed through the gate it exists to stop. These are the two shapes that
// actually shipped the 2026-07-04 "No flashcards available yet" bug.

/** Build a definition whose bridge returns exactly `serverData`. */
function bridgeReturning(
  serverData: Record<string, unknown> | undefined,
): DualGateDefinition {
  return { legacyBlockType: "flashcards", toLegacyServerData: () => serverData };
}

/** Run the gate over the good sample with a bridge that returns `serverData`. */
function gateWithBridgeOutput(serverData: Record<string, unknown> | undefined) {
  return runKindDualGate({
    kind: "flashcard_set",
    sample: goodSample,
    emittedJsonSchema,
    definition: bridgeReturning(serverData),
  });
}

describe("dual gate — render leg rejects junk serverData", () => {
  it('FAILS on `{ language: "json" }` — the raw code-region annotation', () => {
    // StreamBlockAccumulator.buildBlockData() emits this for an untyped ```json
    // fence; render-block-to-content-block maps it onto serverData. It is a
    // TRUTHY object with one key and ZERO kind data.
    const result = gateWithBridgeOutput({ language: "json" });

    expect(result.structural.ok).toBe(true); // the sample itself is fine
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);

    const message = describeDualGateFailure("flashcard_set", result);
    expect(message).toContain("render(UI)");
    expect(message).toContain("only annotation keys");
    expect(message).toContain("language");
    expect(message).toContain("not kind data");
  });

  it("FAILS on `{ title: '', cards: [] }` — present shape, empty semantics", () => {
    const result = gateWithBridgeOutput({ title: "", cards: [] });

    expect(result.structural.ok).toBe(true);
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);

    const message = describeDualGateFailure("flashcard_set", result);
    expect(message).toContain("render(UI)");
    expect(message).toContain("every content value is empty");
    expect(message).toContain("title");
    expect(message).toContain("cards");
  });

  it("FAILS when the bridge returns undefined", () => {
    expect(gateWithBridgeOutput(undefined).render.ok).toBe(false);
  });

  it("FAILS on whitespace-only strings and nested emptiness", () => {
    expect(gateWithBridgeOutput({ title: "   " }).render.ok).toBe(false);
    expect(gateWithBridgeOutput({ data: { items: [] } }).render.ok).toBe(false);
    expect(gateWithBridgeOutput({ cards: [{}, {}] }).render.ok).toBe(false);
    expect(gateWithBridgeOutput({ cards: ["", "  "] }).render.ok).toBe(false);
    expect(gateWithBridgeOutput({ title: null, cards: [] }).render.ok).toBe(false);
  });

  it("FAILS when the bridge lies about its return type (array / scalar)", () => {
    // The facet's declared type is a promise, not a guarantee — bridges are
    // ordinary code. The gate must not take the type on faith.
    const arrayBridge = {
      legacyBlockType: "flashcards",
      toLegacyServerData: () => [] as unknown,
    } as unknown as DualGateDefinition;
    const scalarBridge = {
      legacyBlockType: "flashcards",
      toLegacyServerData: () => "cards" as unknown,
    } as unknown as DualGateDefinition;

    for (const definition of [arrayBridge, scalarBridge]) {
      const result = runKindDualGate({
        kind: "flashcard_set",
        sample: goodSample,
        emittedJsonSchema,
        definition,
      });
      expect(result.render.ok).toBe(false);
      expect(result.isActive).toBe(false);
    }
  });
});

describe("dual gate — render leg keeps real serverData passing", () => {
  it("PASSES when an annotation key coexists with real content", () => {
    // `language` alone is junk; `language` + `code` is a legitimate code kind.
    const result = gateWithBridgeOutput({ language: "python", code: "x = 1" });
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it("PASSES on falsy-but-real values — 0 and false are content", () => {
    // progress_tracker returns `completedItems: 0`; flashcard_set returns
    // `isComplete: false`. Treating these as "empty" would break live kinds.
    expect(gateWithBridgeOutput({ completedItems: 0 }).render.ok).toBe(true);
    expect(gateWithBridgeOutput({ isComplete: false }).render.ok).toBe(true);
  });

  it("PASSES when a real payload sits beside legitimately-empty arrays", () => {
    // research_report's live bridge emits `allSections: []` +
    // `unrecognizedSections: []` alongside real content. A rule of
    // "every array must be non-empty" would have failed a healthy active kind.
    const result = gateWithBridgeOutput({
      title: "State of X",
      sections: [{ heading: "Intro" }],
      allSections: [],
      unrecognizedSections: [],
    });
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it("PASSES on content nested inside an object value", () => {
    expect(gateWithBridgeOutput({ data: { items: [1] } }).render.ok).toBe(true);
    expect(gateWithBridgeOutput({ theme: { preset: "dark" } }).render.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Render-leg satisfier PRECEDENCE.
//
// The leg gained two satisfiers (a resolved `kind_component` row, and the
// data-only n/a rule) so agent-authored kinds whose renderer is a
// `source='db'` row could pass at all. Every compiled kind ALSO owns a
// `source='bundled'` component row, so if the resolved-component check ran
// first it would short-circuit past the bridge check for exactly the kinds
// that guard protects — silently re-opening the "No <kind> available" class.
// These tests pin the ordering.
// ─────────────────────────────────────────────────────────────────────────────

describe("dual gate — render-leg satisfier precedence", () => {
  const activeComponent = {
    componentKey: "flashcards",
    isActive: true,
    source: "bundled",
  };

  it("STILL FAILS a broken compiled bridge even when an active component row exists", () => {
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: goodSample,
      emittedJsonSchema,
      definition: bridgeReturning({ language: "json" }), // junk annotation
      resolvedComponent: activeComponent,
    });
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);
    expect(result.render.detail).toContain("No flashcard_set available");
  });

  it("STILL FAILS when the compiled bridge throws, component row notwithstanding", () => {
    const result = runKindDualGate({
      kind: "flashcard_set",
      sample: goodSample,
      emittedJsonSchema,
      definition: {
        legacyBlockType: "flashcards",
        toLegacyServerData: () => {
          throw new Error("bridge exploded");
        },
      },
      resolvedComponent: activeComponent,
    });
    expect(result.render.ok).toBe(false);
    expect(result.render.detail).toContain("bridge exploded");
  });

  it("PASSES a DB-component kind that has no compiled registry entry at all", () => {
    // The agent-authored case: definition is null (not compiled), renderer is
    // a source='db' row. This is what was structurally impossible before.
    const result = runKindDualGate({
      kind: "wine_tasting",
      sample: goodSample,
      emittedJsonSchema,
      definition: null,
      resolvedComponent: {
        componentKey: "wine_tasting_card",
        isActive: true,
        source: "db",
      },
    });
    expect(result.render.ok).toBe(true);
    expect(result.render.detail).toContain("wine_tasting_card");
  });

  it("FAILS a kind with no compiled entry and an INACTIVE component row", () => {
    const result = runKindDualGate({
      kind: "wine_tasting",
      sample: goodSample,
      emittedJsonSchema,
      definition: null,
      resolvedComponent: {
        componentKey: "wine_tasting_card",
        isActive: false,
        source: "db",
      },
    });
    expect(result.render.ok).toBe(false);
    expect(result.render.detail).toContain("nothing to render");
  });

  it("FAILS a kind with neither a compiled entry nor any component row", () => {
    const result = runKindDualGate({
      kind: "chart",
      sample: goodSample,
      emittedJsonSchema,
      definition: null,
      resolvedComponent: null,
    });
    expect(result.render.ok).toBe(false);
    expect(result.isActive).toBe(false);
  });

  it("treats the render leg as n/a for data-only contract kinds", () => {
    const result = runKindDualGate({
      kind: "workflow_io_thing",
      sample: goodSample,
      emittedJsonSchema,
      definition: null,
      resolvedComponent: null,
      dataOnly: true,
    });
    expect(result.render.ok).toBe(true);
    expect(result.render.detail).toContain("n/a");
    expect(result.isActive).toBe(true);
  });
});
