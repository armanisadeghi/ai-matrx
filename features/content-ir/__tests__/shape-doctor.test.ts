/**
 * Shape doctor (pure) — per-kind asset completeness + red/yellow findings.
 * Fabricated inputs cover: an all-green kind, the worst red class (ACTIVE
 * kind whose recomputed structural gate fails — schema drifted under the
 * sample), the duplicate-skill red (R9: ONE skill per kind per syntax), the
 * yellow no-example gap, and the interim sample_data warn.
 */

import {
  runShapeDoctor,
  attributeSkillsToKinds,
  type DoctorKindDefinition,
  type ShapeDoctorInput,
} from "../registry/shape-doctor";

const T0 = "2026-07-01T00:00:00Z";

const STRICT_CARD_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" } },
        required: ["front", "back"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "cards"],
  additionalProperties: false,
};

function makeKind(overrides: Partial<DoctorKindDefinition>): DoctorKindDefinition {
  return {
    id: "id-default",
    kind: "default_kind",
    label: "Default",
    isActive: false,
    emittedJsonSchema: STRICT_CARD_SCHEMA,
    sampleData: null,
    updatedAt: T0,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ShapeDoctorInput>): ShapeDoctorInput {
  return {
    kinds: [],
    examples: [],
    components: [],
    surfaces: [],
    renderBlockSkills: [],
    contentBlocks: [],
    detectorTokens: [],
    codeRenderPaths: { compiledKinds: [], artifactKinds: [] },
    ...overrides,
  };
}

const goodSample = {
  title: "Set",
  cards: [{ front: "f", back: "b" }],
};

describe("shape doctor", () => {
  it("reports an all-green kind with zero findings", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set", isActive: true })],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            data: goodSample,
            updatedAt: T0,
          },
        ],
        components: [
          {
            id: "c1",
            kindDefinitionId: "k1",
            platform: "web",
            role: "output",
            componentKey: "FlashcardsBlock",
          },
        ],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "k1",
            surfaceType: "xml_tag",
            token: "flashcards",
          },
        ],
        renderBlockSkills: [
          {
            skillId: "flashcard-set",
            label: "Flashcards",
            body: 'Emit `{"__kind": "flashcard_set", ...}`',
          },
        ],
        contentBlocks: [
          { id: "b1", template: 'Use {"__kind": "flashcard_set"} for study sets.' },
        ],
      }),
    );

    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    expect(row.kind).toBe("flashcard_set");
    for (const cell of Object.values(row.assets)) {
      expect(cell.status).toBe("ok");
    }
    expect(report.findings).toHaveLength(0);
    expect(report.totals).toEqual({
      kinds: 1,
      red: 0,
      yellow: 0,
      cells: { ok: 7, warn: 0, missing: 0 },
    });
  });

  it("screams RED when an ACTIVE kind fails its recomputed structural gate", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set", isActive: true })],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            // cards[0] missing required `back` + extra prop → schema drifted
            // under the stored sample; stored validation_status is NOT trusted.
            data: { title: "Set", cards: [{ front: "f", extra: true }] },
            updatedAt: T0,
          },
        ],
      }),
    );

    const row = report.rows[0];
    expect(row.assets.gate_structural.status).toBe("warn");
    expect(row.assets.gate_structural.detail).toContain("FAILED");
    const red = report.findings.find((f) => f.code === "active-gate-fail");
    expect(red).toBeDefined();
    expect(red?.severity).toBe("red");
    expect(red?.kind).toBe("flashcard_set");
    // Reds sort before yellows.
    expect(report.findings[0].severity).toBe("red");
  });

  it("does NOT scream red for an inactive kind failing the gate", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set", isActive: false })],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            data: { title: "Set", cards: [{ front: "f" }] },
            updatedAt: T0,
          },
        ],
      }),
    );
    expect(report.rows[0].assets.gate_structural.status).toBe("warn");
    expect(report.findings.some((f) => f.code === "active-gate-fail")).toBe(false);
  });

  it("screams RED when TWO render_block skills teach the same kind (same syntax)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "quiz_set" })],
        examples: [
          { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        renderBlockSkills: [
          { skillId: "quiz-old", label: "Quiz", body: '{"__kind": "quiz_set"}' },
          { skillId: "quiz-new", label: "Quiz v2", body: 'also {"__kind": "quiz_set"}' },
        ],
      }),
    );

    const red = report.findings.find((f) => f.code === "duplicate-skill");
    expect(red).toBeDefined();
    expect(red?.severity).toBe("red");
    expect(red?.message).toContain("quiz-old");
    expect(red?.message).toContain("quiz-new");
    expect(report.rows[0].assets.skill.status).toBe("warn");
  });

  it("allows one JSON + one XML skill for the same kind (R9: per syntax)", () => {
    const teachings = attributeSkillsToKinds(
      [
        { skillId: "kind_quiz_set", label: "Quiz JSON", body: null },
        { skillId: "kind_quiz_set_xml", label: "Quiz XML", body: null },
      ],
      new Set(["quiz_set"]),
    );
    expect(teachings).toEqual([
      { skillId: "kind_quiz_set", kind: "quiz_set", syntax: "json" },
      { skillId: "kind_quiz_set_xml", kind: "quiz_set", syntax: "xml" },
    ]);

    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "quiz_set" })],
        examples: [
          { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        renderBlockSkills: [
          { skillId: "kind_quiz_set", label: "Quiz JSON", body: null },
          { skillId: "kind_quiz_set_xml", label: "Quiz XML", body: null },
        ],
      }),
    );
    expect(report.findings.some((f) => f.code === "duplicate-skill")).toBe(false);
    expect(report.rows[0].assets.skill.status).toBe("ok");
  });

  it("yellows a kind without any example (and marks the cells missing)", () => {
    const report = runShapeDoctor(
      baseInput({ kinds: [makeKind({ id: "k1", kind: "decision_tree" })] }),
    );

    const row = report.rows[0];
    expect(row.assets.example.status).toBe("missing");
    expect(row.assets.gate_structural.status).toBe("missing");
    const yellow = report.findings.find((f) => f.code === "no-example");
    expect(yellow).toBeDefined();
    expect(yellow?.severity).toBe("yellow");
    expect(yellow?.kind).toBe("decision_tree");
  });

  it("uses interim sample_data for the gate but marks example as warn", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "k1", kind: "flashcard_set", sampleData: goodSample }),
        ],
      }),
    );

    const row = report.rows[0];
    expect(row.assets.example).toEqual({
      status: "warn",
      detail: "interim sample_data only",
    });
    expect(row.assets.gate_structural.status).toBe("ok");
    expect(row.assets.gate_structural.detail).toContain("interim sample_data");
    expect(report.findings.some((f) => f.code === "no-example")).toBe(false);
  });

  it("yellows unregistered detector tokens but never control tags", () => {
    const report = runShapeDoctor(
      baseInput({
        detectorTokens: [
          { token: "flashcards", surfaceType: "xml_tag", source: "accumulator" },
          { token: "flashcards", surfaceType: "xml_tag", source: "splitter" },
          { token: "thinking", surfaceType: "xml_tag", source: "accumulator" },
        ],
      }),
    );

    const tokenFindings = report.findings.filter(
      (f) => f.code === "detector-token-unregistered",
    );
    expect(tokenFindings).toHaveLength(1); // deduped, control tag excluded
    expect(tokenFindings[0].message).toContain("flashcards");
    expect(tokenFindings[0].message).toContain("expected until Stage 5");
  });
});
