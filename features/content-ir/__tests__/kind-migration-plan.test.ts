/**
 * The migration planner: computes each kind's data/edges/emitted schemas +
 * the dual-gate verdict → is_active, holding back (loudly) any kind that
 * lacks a sample or fails the gate. Nothing is silently dropped.
 */

import type { KindSchema } from "../core/kind-schema.types";
import { planKindMigration } from "../registry/kind-migration-plan";
import type { DualGateDefinition } from "../registry/kind-dual-gate";

const schemas: Record<string, KindSchema> = {
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

const samples: Record<string, Record<string, unknown>> = {
  flashcard_set: {
    __kind: "flashcard_set",
    title: "Bio",
    cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
  },
  flashcard: { __kind: "flashcard", front: "Q", back: "A" },
};

const defs: Record<string, DualGateDefinition> = {
  flashcard_set: {
    legacyBlockType: "flashcards",
    toLegacyServerData: (env) => ({ cards: env.root.value.cards ?? [] }),
  },
  flashcard: {
    legacyBlockType: "flashcards",
    toLegacyServerData: (env) => ({ ...env.root.value }),
  },
};
const getDefinition = (k: string): DualGateDefinition | null => defs[k] ?? null;

describe("kind migration planner", () => {
  it("marks a good kind active with data, edges, emitted schemas, and a fingerprint", () => {
    const plan = planKindMigration({ schemas, samples, getDefinition });
    const set = plan.kinds.find((k) => k.kind === "flashcard_set")!;

    expect(set.isActive).toBe(true);
    expect(set.data.map((d) => d.name)).toEqual(["title", "cards"]);
    expect(set.edges).toEqual([
      { fieldPath: "cards", childKind: "flashcard", position: 0 },
    ]);
    expect(set.emittedBlockSchema).toBeTruthy();
    expect(set.emittedJsonSchema).toBeTruthy();
    expect(set.emittedFingerprint).toMatch(/\S/);
    expect(set.notes).toEqual([]);
    expect(plan.activeCount).toBe(2);
  });

  it("holds a kind inactive (loudly) when it has no sample_data", () => {
    const plan = planKindMigration({
      schemas,
      samples: { flashcard: samples.flashcard }, // no flashcard_set sample
      getDefinition,
    });
    const set = plan.kinds.find((k) => k.kind === "flashcard_set")!;
    expect(set.isActive).toBe(false);
    expect(set.dualGate).toBeNull();
    expect(set.notes.join(" ")).toContain("no sample_data");
    expect(plan.inactiveCount).toBe(1);
  });

  it("holds a kind inactive with a gate-failure note when the sample is malformed", () => {
    const plan = planKindMigration({
      schemas,
      samples: {
        ...samples,
        flashcard_set: { __kind: "flashcard_set", title: "no cards key" },
      },
      getDefinition,
    });
    const set = plan.kinds.find((k) => k.kind === "flashcard_set")!;
    expect(set.isActive).toBe(false);
    expect(set.notes.join(" ")).toContain("failed the dual gate");
  });
});
