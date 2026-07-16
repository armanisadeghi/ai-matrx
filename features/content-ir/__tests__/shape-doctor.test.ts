/**
 * Shape doctor (pure) — per-kind asset completeness + red/yellow findings.
 * Fabricated inputs cover: an all-green kind, the worst red class (ACTIVE
 * kind whose recomputed structural gate fails — schema drifted under the
 * sample), the duplicate-skill red (R9: ONE skill per kind per syntax), the
 * yellow no-example gap, and the interim sample_data warn.
 *
 * Plus the `n/a` doctrine (R10 honesty pass): the two classes of kind that
 * CANNOT hold some assets — `data_only` (workflow I/O contracts) and
 * `nested_only_child` (renders only inside its root) — get `n/a` cells and
 * emit no findings, while every RED still screams and no positive cell is
 * ever overwritten.
 */

import {
  runShapeDoctor,
  attributeSkillsToKinds,
  classifyExemption,
  stripKindFromJsonSchema,
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
    metadata: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ShapeDoctorInput>): ShapeDoctorInput {
  return {
    kinds: [],
    examples: [],
    components: [],
    surfaces: [],
    edges: [],
    renderBlockSkills: [],
    contentBlocks: [],
    detectorTokens: [],
    codeRenderPaths: { compiledKinds: [], artifactKinds: [] },
    ...overrides,
  };
}

/** `<parent> embeds <child>` — one kind_edge row. */
function edge(parentDefinitionId: string, childDefinitionId: string, fieldName = "items") {
  return { parentDefinitionId, childDefinitionId, fieldName };
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
            isActive: true,
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
      cells: { ok: 7, warn: 0, missing: 0, "n/a": 0 },
    });
    expect(row.exemption).toBeNull();
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

// ─── The `n/a` doctrine ─────────────────────────────────────────────────────

const WORKFLOW_IO_META = { family: "workflow_io", generic: true, category: "pure" };

describe("shape doctor — n/a classification", () => {
  it("marks a DATA-ONLY (workflow_io) kind n/a for component/surface/skill/block", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "http_response",
            emittedJsonSchema: { type: "object" },
            metadata: WORKFLOW_IO_META,
          }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: {}, updatedAt: T0 },
        ],
      }),
    );

    const row = report.rows[0];
    expect(row.exemption?.class).toBe("data_only");
    for (const col of ["component", "surface", "skill", "content_block"] as const) {
      expect(row.assets[col].status).toBe("n/a");
      expect(row.assets[col].detail).toContain("generated workflow_io contract");
    }
    // Definition / example / gate stay REAL — a data-only kind still has a
    // schema that must validate against its sample.
    expect(row.assets.definition.status).toBe("ok");
    expect(row.assets.example.status).toBe("ok");
    expect(row.assets.gate_structural.status).toBe("ok");

    // No yellow noise.
    expect(report.findings).toHaveLength(0);
    expect(report.totals.cells["n/a"]).toBe(4);
  });

  it("marks a NESTED-ONLY CHILD n/a for component/surface/skill/block", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "root", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        edges: [edge("root", "child", "cards")],
      }),
    );

    const child = report.rows.find((r) => r.kind === "flashcard");
    expect(child?.exemption?.class).toBe("nested_only_child");
    expect(child?.exemption?.parents).toEqual(["flashcard_set"]);
    for (const col of ["component", "surface", "skill", "content_block"] as const) {
      expect(child?.assets[col].status).toBe("n/a");
      expect(child?.assets[col].detail).toContain("nested-only child of flashcard_set");
    }
    // Those four findings must NOT be emitted for the child.
    for (const code of ["no-skill", "no-content-block"] as const) {
      expect(report.findings.some((f) => f.code === code && f.kind === "flashcard")).toBe(false);
    }
  });

  it("keeps `no-example` LOUD for a nested-only child (its schema is unproven)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "timeline_period" }),
          makeKind({ id: "child", kind: "timeline_event" }),
        ],
        edges: [edge("root", "child", "events")],
      }),
    );

    const child = report.rows.find((r) => r.kind === "timeline_event");
    expect(child?.exemption?.class).toBe("nested_only_child");
    // example + gate are NEVER exemptible — a child CAN and SHOULD have one.
    expect(child?.assets.example.status).toBe("missing");
    expect(child?.assets.gate_structural.status).toBe("missing");
    expect(
      report.findings.some((f) => f.code === "no-example" && f.kind === "timeline_event"),
    ).toBe(true);
  });

  it("never exempts an ACTIVE kind, even when it IS nested in another kind", () => {
    // quiz_set is embedded by study_pack_set yet is an ACTIVE root — its
    // missing component is a REAL gap that must stay loud (R6).
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "pack", kind: "study_pack_set" }),
          makeKind({ id: "quiz", kind: "quiz_set", isActive: true }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "quiz", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        edges: [edge("pack", "quiz", "included_sets")],
      }),
    );

    const quiz = report.rows.find((r) => r.kind === "quiz_set");
    expect(quiz?.exemption).toBeNull();
    expect(quiz?.assets.component.status).toBe("missing");
    expect(quiz?.assets.surface.status).toBe("warn");
    expect(report.findings.some((f) => f.code === "no-skill" && f.kind === "quiz_set")).toBe(true);
    expect(
      report.findings.some((f) => f.code === "no-content-block" && f.kind === "quiz_set"),
    ).toBe(true);
  });

  it("does not treat SELF-recursion as evidence of nesting", () => {
    // decision_node.yes → decision_node is recursion, not a parent embed.
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "n1", kind: "decision_node" })],
        edges: [edge("n1", "n1", "yes")],
      }),
    );
    expect(report.rows[0].exemption).toBeNull();
    expect(report.rows[0].assets.component.status).toBe("missing");
  });

  it("never lets n/a overwrite a POSITIVE cell (child taught by its parent's skill)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "root", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        edges: [edge("root", "child", "cards")],
        // The parent's skill body demonstrates the nested child's __kind.
        renderBlockSkills: [
          {
            skillId: "kind_flashcard_set",
            label: "Flashcards",
            body: '{"__kind":"flashcard_set","cards":[{"__kind":"flashcard"}]}',
          },
        ],
        contentBlocks: [{ id: "b1", template: '{"__kind": "flashcard"} nested' }],
      }),
    );

    const child = report.rows.find((r) => r.kind === "flashcard");
    expect(child?.exemption?.class).toBe("nested_only_child");
    // Real coverage wins over the exemption.
    expect(child?.assets.skill.status).toBe("ok");
    expect(child?.assets.content_block.status).toBe("ok");
    // Cells with no possible positive stay n/a.
    expect(child?.assets.component.status).toBe("n/a");
    expect(child?.assets.surface.status).toBe("n/a");
  });

  it("a registered component or surface DISQUALIFIES the nested-child exemption", () => {
    const withComponent = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        components: [
          {
            id: "c1",
            kindDefinitionId: "child",
            platform: "web",
            role: "output",
            componentKey: "FlashcardBlock",
          },
        ],
        edges: [edge("root", "child", "cards")],
      }),
    );
    const child = withComponent.rows.find((r) => r.kind === "flashcard");
    expect(child?.exemption).toBeNull();
    expect(child?.assets.component.status).toBe("ok");
    // Gap cells come back.
    expect(child?.assets.surface.status).toBe("warn");
    expect(withComponent.findings.some((f) => f.code === "no-skill" && f.kind === "flashcard")).toBe(
      true,
    );

    const withSurface = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "child",
            surfaceType: "xml_tag",
            token: "flashcard",
            isActive: true,
          },
        ],
        edges: [edge("root", "child", "cards")],
      }),
    );
    expect(withSurface.rows.find((r) => r.kind === "flashcard")?.exemption).toBeNull();
  });

  it("a compiled render path DISQUALIFIES the nested-child exemption", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        edges: [edge("root", "child", "cards")],
        codeRenderPaths: { compiledKinds: ["flashcard"], artifactKinds: [] },
      }),
    );
    const child = report.rows.find((r) => r.kind === "flashcard");
    expect(child?.exemption).toBeNull();
    expect(child?.assets.component.status).toBe("warn");
  });

  // ─── Reds survive the exemption, always ───────────────────────────────────

  it("still screams RED on an ACTIVE exempted-family kind failing its gate", () => {
    // Activating a workflow_io kind does not silence its recomputed gate.
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "json",
            isActive: true,
            metadata: WORKFLOW_IO_META,
          }),
        ],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            data: { title: "Set", cards: [{ front: "f", extra: true }] },
            updatedAt: T0,
          },
        ],
      }),
    );
    expect(report.rows[0].exemption?.class).toBe("data_only");
    expect(report.findings.some((f) => f.code === "active-gate-fail")).toBe(true);
    expect(report.totals.red).toBe(1);
  });

  it("still screams RED on duplicate skills teaching an exempted nested child", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "root", kind: "flashcard_set", isActive: true }),
          makeKind({ id: "child", kind: "flashcard" }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "root", isCanonical: true, data: goodSample, updatedAt: T0 },
        ],
        edges: [edge("root", "child", "cards")],
        renderBlockSkills: [
          { skillId: "flash-a", label: "A", body: '{"__kind":"flashcard"}' },
          { skillId: "flash-b", label: "B", body: '{"__kind":"flashcard"}' },
        ],
      }),
    );
    const red = report.findings.find((f) => f.code === "duplicate-skill");
    expect(red?.kind).toBe("flashcard");
    expect(report.rows.find((r) => r.kind === "flashcard")?.assets.skill.status).toBe("warn");
  });

  it("still screams RED on component-without-schema for an exempted kind", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "json",
            emittedJsonSchema: null,
            metadata: WORKFLOW_IO_META,
          }),
        ],
        components: [
          {
            id: "c1",
            kindDefinitionId: "k1",
            platform: "web",
            role: "output",
            componentKey: "JsonBlock",
          },
        ],
      }),
    );
    expect(report.findings.some((f) => f.code === "component-without-schema")).toBe(true);
  });

  it("classifyExemption encodes the exact predicate", () => {
    const child = makeKind({ id: "c", kind: "flashcard" });
    const base = {
      kind: child,
      parentKinds: ["flashcard_set"],
      componentCount: 0,
      surfaceCount: 0,
      codeRenderPathCount: 0,
    };
    expect(classifyExemption(base)?.class).toBe("nested_only_child");
    expect(classifyExemption({ ...base, parentKinds: [] })).toBeNull();
    expect(classifyExemption({ ...base, componentCount: 1 })).toBeNull();
    expect(classifyExemption({ ...base, surfaceCount: 1 })).toBeNull();
    expect(classifyExemption({ ...base, codeRenderPathCount: 1 })).toBeNull();
    expect(
      classifyExemption({ ...base, kind: makeKind({ id: "c", kind: "x", isActive: true }) }),
    ).toBeNull();

    // family=workflow_io wins regardless of nesting/render evidence.
    const dataOnly = makeKind({ id: "d", kind: "json", metadata: { family: "workflow_io" } });
    expect(
      classifyExemption({
        kind: dataOnly,
        parentKinds: [],
        componentCount: 0,
        surfaceCount: 0,
        codeRenderPathCount: 0,
      })?.class,
    ).toBe("data_only");
    // A non-workflow_io family is NOT a data-only kind.
    expect(
      classifyExemption({
        kind: makeKind({ id: "r", kind: "research_report", metadata: { family: "research_report" } }),
        parentKinds: [],
        componentCount: 0,
        surfaceCount: 0,
        codeRenderPathCount: 0,
      }),
    ).toBeNull();
  });
});

// ─── Coverage gates (crosswalk + contract manifest) ─────────────────────────

describe("shape doctor — coverage gates", () => {
  it("exempts ALL four generated contract families as data_only", () => {
    for (const family of ["action_io", "tool_io", "workflow_io", "agent_io"]) {
      const report = runShapeDoctor(
        baseInput({
          kinds: [
            makeKind({
              id: "k1",
              kind: `${family}_thing_input`,
              emittedJsonSchema: { type: "object" },
              metadata: { family },
            }),
          ],
          examples: [
            { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: {}, updatedAt: T0 },
          ],
        }),
      );
      expect(report.rows[0].exemption?.class).toBe("data_only");
      expect(report.rows[0].family).toBe(family);
      expect(report.findings).toHaveLength(0);
    }
  });

  it("reds vocab-unclassified for kind slugs / detector tokens / surface tokens missing from the crosswalk", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({ id: "k1", kind: "known_kind" }),
          makeKind({ id: "k2", kind: "mystery_kind" }),
        ],
        detectorTokens: [
          { token: "mystery_tag", surfaceType: "xml_tag", source: "test#SET" },
          // Control tags are code-owned protocol — never crosswalk-gated here.
          { token: "thinking", surfaceType: "xml_tag", source: "test#SET" },
        ],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "k1",
            surfaceType: "fence_lang",
            token: "mystery_fence",
            isActive: true,
          },
        ],
        crosswalkNames: new Set(["known_kind"]),
      }),
    );
    const codes = report.findings.filter((f) => f.code === "vocab-unclassified");
    expect(codes).toHaveLength(3);
    const joined = codes.map((f) => f.message).join("\n");
    expect(joined).toContain('"mystery_fence"');
    expect(joined).toContain('"mystery_kind"');
    expect(joined).toContain('"mystery_tag"');
    expect(joined).not.toContain('"thinking"');
    expect(codes.every((f) => f.severity === "red")).toBe(true);
  });

  it("stays quiet when the crosswalk covers everything", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "known_kind" })],
        detectorTokens: [{ token: "known_kind", surfaceType: "xml_tag", source: "test#SET" }],
        crosswalkNames: new Set(["known_kind"]),
      }),
    );
    expect(report.findings.filter((f) => f.code === "vocab-unclassified")).toHaveLength(0);
  });

  it("reds contract-gap in both directions (manifest↔live)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          // Live ACTIVE generated kind absent from the manifest → stale.
          makeKind({
            id: "k1",
            kind: "tool_io_orphan_input",
            isActive: true,
            emittedJsonSchema: { type: "object" },
            metadata: { family: "tool_io" },
          }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: {}, updatedAt: T0 },
        ],
        contractManifest: [
          // Manifest contract with no active live row → missing.
          { kind: "action_io_missing_output", family: "action_io" },
        ],
      }),
    );
    const gaps = report.findings.filter((f) => f.code === "contract-gap");
    expect(gaps).toHaveLength(2);
    expect(gaps.map((f) => f.message).join("\n")).toContain("action_io_missing_output");
    expect(gaps.map((f) => f.message).join("\n")).toContain("tool_io_orphan_input");
    expect(gaps.every((f) => f.severity === "red")).toBe(true);
  });

  it("does not gap-check INACTIVE generated kinds (deliberate deactivations)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "workflow_io_user_input_output",
            isActive: false,
            emittedJsonSchema: { type: "object" },
            metadata: { family: "workflow_io" },
          }),
        ],
        examples: [
          { id: "e1", kindDefinitionId: "k1", isCanonical: true, data: {}, updatedAt: T0 },
        ],
        contractManifest: [],
      }),
    );
    expect(report.findings.filter((f) => f.code === "contract-gap")).toHaveLength(0);
  });
});

// ─── Schema-side `__kind` strip (agent_io response_format schemas) ──────────

describe("shape doctor — schema-side __kind strip", () => {
  it("passes the gate when schema REQUIRES __kind (agent_io) and the sample carries it", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "agent_io_x_output",
            isActive: true,
            metadata: { family: "agent_io" },
            emittedJsonSchema: {
              type: "object",
              properties: {
                __kind: { const: "flashcard_set" },
                title: { type: "string" },
                nested: {
                  type: "object",
                  properties: { __kind: { const: "memory_palace" }, v: { type: "number" } },
                  required: ["__kind", "v"],
                  additionalProperties: false,
                },
              },
              required: ["__kind", "title", "nested"],
              additionalProperties: false,
            },
          }),
        ],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            // The deep sample-side strip removes BOTH __kind keys; the deep
            // schema-side strip removes both requirements — substance matches.
            data: {
              __kind: "flashcard_set",
              title: "t",
              nested: { __kind: "memory_palace", v: 1 },
            },
            updatedAt: T0,
          },
        ],
      }),
    );
    expect(report.rows[0].assets.gate_structural.status).toBe("ok");
    expect(report.findings.filter((f) => f.code === "active-gate-fail")).toHaveLength(0);
  });

  it("still fails the gate on REAL substance drift under a __kind-bearing schema", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [
          makeKind({
            id: "k1",
            kind: "agent_io_y_output",
            isActive: true,
            metadata: { family: "agent_io" },
            emittedJsonSchema: {
              type: "object",
              properties: { __kind: { const: "x" }, title: { type: "string" } },
              required: ["__kind", "title"],
              additionalProperties: false,
            },
          }),
        ],
        examples: [
          {
            id: "e1",
            kindDefinitionId: "k1",
            isCanonical: true,
            data: { __kind: "x" }, // missing required `title` — a real gap
            updatedAt: T0,
          },
        ],
      }),
    );
    expect(report.rows[0].assets.gate_structural.status).toBe("warn");
    expect(report.findings.some((f) => f.code === "active-gate-fail")).toBe(true);
  });

  it("stripKindFromJsonSchema removes __kind from properties/required at every depth", () => {
    const stripped = stripKindFromJsonSchema({
      properties: { __kind: { const: "a" }, keep: { type: "string" } },
      required: ["__kind", "keep"],
      $defs: {
        Inner: {
          properties: { __kind: { const: "b" } },
          required: ["__kind"],
        },
      },
    }) as Record<string, unknown>;
    expect(stripped).toEqual({
      properties: { keep: { type: "string" } },
      required: ["keep"],
      $defs: { Inner: { properties: {}, required: [] } },
    });
  });
});

describe("registry↔host surface reconciliation (surface-token-undetectable)", () => {
  const hostSurfaceTokens = {
    xml_tag: new Set(["flashcards"]),
    fence_lang: new Set(["mermaid"]),
    json_root_key: new Set(["quiz_title"]),
  };

  it("flags an ACTIVE surface token no host literal can fire", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set" })],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "k1",
            surfaceType: "xml_tag",
            token: "ghost_tag",
            isActive: true,
          },
        ],
        hostSurfaceTokens,
      }),
    );
    const reds = report.findings.filter((f) => f.code === "surface-token-undetectable");
    expect(reds).toHaveLength(1);
    expect(reds[0].severity).toBe("red");
    expect(reds[0].message).toContain('"ghost_tag"');
  });

  it("passes host-covered tokens and skips inactive + tool_name surfaces", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set" })],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "k1",
            surfaceType: "xml_tag",
            token: "flashcards",
            isActive: true,
          },
          {
            id: "s2",
            kindDefinitionId: "k1",
            surfaceType: "fence_lang",
            token: "mermaid",
            isActive: true,
          },
          {
            id: "s3",
            kindDefinitionId: "k1",
            surfaceType: "json_root_key",
            token: "quiz_title",
            isActive: true,
          },
          // Deactivated: SHOULD be undetectable — never a finding.
          {
            id: "s4",
            kindDefinitionId: "k1",
            surfaceType: "xml_tag",
            token: "questionnaire",
            isActive: false,
          },
          // tool_name has no markdown host — out of scope for this check.
          {
            id: "s5",
            kindDefinitionId: "k1",
            surfaceType: "tool_name",
            token: "make_flashcards",
            isActive: true,
          },
        ],
        hostSurfaceTokens,
      }),
    );
    expect(
      report.findings.filter((f) => f.code === "surface-token-undetectable"),
    ).toHaveLength(0);
  });

  it("emits nothing when host tokens are not supplied (degraded runtimes)", () => {
    const report = runShapeDoctor(
      baseInput({
        kinds: [makeKind({ id: "k1", kind: "flashcard_set" })],
        surfaces: [
          {
            id: "s1",
            kindDefinitionId: "k1",
            surfaceType: "xml_tag",
            token: "ghost_tag",
            isActive: true,
          },
        ],
      }),
    );
    expect(
      report.findings.filter((f) => f.code === "surface-token-undetectable"),
    ).toHaveLength(0);
  });
});
