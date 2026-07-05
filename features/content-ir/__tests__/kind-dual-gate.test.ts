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
