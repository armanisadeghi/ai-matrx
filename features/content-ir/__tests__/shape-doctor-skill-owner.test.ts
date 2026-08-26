/**
 * THE DUPLICATE-SKILL RESOLUTION, proven falsifiable.
 *
 * The admin resolution surface (/administration/utilities/kind-registry/
 * findings/duplicate-skill) closes an R9 violation by DECLARING which skill
 * owns a kind, written to `kind_definition.metadata.skill_owner`. A resolution
 * that silenced the red unconditionally would be worse than no resolution — so
 * these tests plant the known-bad cases and require the red to survive them:
 *
 *   - a declaration naming a skill that does NOT teach the kind (stale) → RED
 *   - a declaration for the wrong syntax → RED for the contested syntax
 *   - no declaration at all → RED, exactly as before
 *
 * …and require it to actually work in the one case it is for.
 */

import {
  kindSkillOwner,
  runShapeDoctor,
  type DoctorKindDefinition,
  type ShapeDoctorInput,
} from "../registry/shape-doctor";
import {
  recommendOwner,
  skillNamedForKind,
  countKindMentions,
  parentKindSlugs,
  type DuplicateSkillCandidate,
} from "../admin/duplicate-skill-analysis";
import {
  FINDING_CATALOG,
  FINDING_CATALOG_ORDER,
  findingSpec,
} from "../admin/shape-finding-catalog";

const T0 = "2026-07-01T00:00:00Z";

const SCHEMA = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false,
};

function makeKind(overrides: Partial<DoctorKindDefinition>): DoctorKindDefinition {
  return {
    id: "k1",
    kind: "ner_entity_ref",
    label: "Entity ref",
    isActive: false,
    emittedJsonSchema: SCHEMA,
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

/** Two skills teaching `ner_entity_ref` in json — the live 2026-08-26 shape. */
function contestedInput(metadata: unknown): ShapeDoctorInput {
  return baseInput({
    kinds: [makeKind({ metadata })],
    examples: [
      {
        id: "e1",
        kindDefinitionId: "k1",
        isCanonical: true,
        data: { name: "Acme" },
        updatedAt: T0,
      },
    ],
    renderBlockSkills: [
      {
        skillId: "kind_ner_entity_ref",
        label: "Entity ref",
        body: '{"__kind": "ner_entity_ref"}',
      },
      {
        skillId: "kind_ner_canonicalization_result",
        label: "Canonicalization result",
        body: '{"entities": [{"__kind": "ner_entity_ref"}]}',
      },
    ],
  });
}

describe("kindSkillOwner", () => {
  it("reads the object form and the bare-string form", () => {
    expect(
      kindSkillOwner({ skill_owner: { json: { skill_id: "a" } } }, "json"),
    ).toBe("a");
    expect(kindSkillOwner({ skill_owner: { json: "b" } }, "json")).toBe("b");
  });

  it("returns null for absent, malformed, or wrong-syntax declarations", () => {
    expect(kindSkillOwner(null, "json")).toBeNull();
    expect(kindSkillOwner({ skill_owner: "nope" }, "json")).toBeNull();
    expect(kindSkillOwner({ skill_owner: { xml: "a" } }, "json")).toBeNull();
    expect(kindSkillOwner({ skill_owner: { json: { skill_id: "" } } }, "json")).toBeNull();
  });
});

describe("duplicate-skill resolution via metadata.skill_owner", () => {
  it("still screams RED with no declaration", () => {
    const report = runShapeDoctor(contestedInput(null));
    expect(report.findings.some((f) => f.code === "duplicate-skill")).toBe(true);
    expect(report.rows[0].assets.skill.status).toBe("warn");
  });

  it("clears the RED once the kind declares which skill owns it", () => {
    const report = runShapeDoctor(
      contestedInput({
        skill_owner: { json: { skill_id: "kind_ner_entity_ref" } },
      }),
    );
    expect(report.findings.some((f) => f.code === "duplicate-skill")).toBe(false);
    expect(report.rows[0].assets.skill.status).toBe("ok");
    expect(report.rows[0].assets.skill.detail).toContain("owner declared");
  });

  it("KNOWN-BAD: a declaration naming a skill that does not teach the kind stays RED and says STALE", () => {
    const report = runShapeDoctor(
      contestedInput({ skill_owner: { json: { skill_id: "kind_something_else" } } }),
    );
    const red = report.findings.find((f) => f.code === "duplicate-skill");
    expect(red).toBeDefined();
    expect(red?.message).toContain("STALE");
    expect(report.rows[0].assets.skill.status).toBe("warn");
  });

  it("KNOWN-BAD: an xml declaration does not silence a contested json syntax", () => {
    const report = runShapeDoctor(
      contestedInput({ skill_owner: { xml: { skill_id: "kind_ner_entity_ref" } } }),
    );
    expect(report.findings.some((f) => f.code === "duplicate-skill")).toBe(true);
  });
});

describe("the decision evidence", () => {
  it("names the container skill and recommends the standalone one", () => {
    const candidates: DuplicateSkillCandidate[] = [
      {
        skillId: "kind_ner_entity_ref",
        label: "Entity ref",
        body: "",
        teaches: ["ner_entity_ref"],
        namedForThisKind: true,
        containerKinds: [],
        mentions: 1,
      },
      {
        skillId: "kind_ner_canonicalization_result",
        label: "Canonicalization",
        body: "",
        teaches: ["ner_canonicalization_result", "ner_entity_ref"],
        namedForThisKind: false,
        containerKinds: ["ner_canonicalization_result"],
        mentions: 1,
      },
    ];
    const { owner, rationale } = recommendOwner("ner_entity_ref", candidates);
    expect(owner).toBe("kind_ner_entity_ref");
    expect(rationale).toContain("ner_canonicalization_result");
  });

  it("refuses to invent a winner when two candidates both teach it standalone", () => {
    const rival = (skillId: string): DuplicateSkillCandidate => ({
      skillId,
      label: skillId,
      body: "",
      teaches: ["citation"],
      namedForThisKind: false,
      containerKinds: [],
      mentions: 1,
    });
    const { owner } = recommendOwner("citation", [rival("a"), rival("b")]);
    expect(owner).toBeNull();
  });

  it("skillNamedForKind honours the R9 convention including hyphens", () => {
    expect(skillNamedForKind("kind_card_detail", "card_detail")).toBe(true);
    expect(skillNamedForKind("kind-card-detail", "card_detail")).toBe(true);
    expect(skillNamedForKind("kind_card_enrichment", "card_detail")).toBe(false);
  });

  it("countKindMentions counts canonical __kind demonstrations only", () => {
    expect(
      countKindMentions('a {"__kind": "citation"} b {"__kind":"citation"} c', "citation"),
    ).toBe(2);
    expect(countKindMentions('{"kind": "citation"}', "citation")).toBe(0);
  });

  it("parentKindSlugs ignores self-recursive edges", () => {
    const idBySlug = new Map([["decision_node", "d1"]]);
    const slugById = new Map([["d1", "decision_node"]]);
    expect(
      parentKindSlugs("decision_node", idBySlug, slugById, [
        { parentDefinitionId: "d1", childDefinitionId: "d1", fieldName: "yes" },
      ]),
    ).toEqual([]);
  });
});

describe("the finding catalog", () => {
  it("describes EVERY code the doctor can raise, so no card can be silently missing", () => {
    // The catalog is a Record<FindingCode, …>, so the compiler already refuses
    // a missing code. This asserts the runtime object matches the type.
    for (const spec of FINDING_CATALOG_ORDER) {
      expect(FINDING_CATALOG[spec.code].code).toBe(spec.code);
      expect(spec.what.length).toBeGreaterThan(20);
      expect(spec.how.length).toBeGreaterThan(10);
    }
    expect(FINDING_CATALOG_ORDER.length).toBe(Object.keys(FINDING_CATALOG).length);
  });

  it("orders reds before yellows", () => {
    const firstYellow = FINDING_CATALOG_ORDER.findIndex((s) => s.severity === "yellow");
    expect(
      FINDING_CATALOG_ORDER.slice(0, firstYellow).every((s) => s.severity === "red"),
    ).toBe(true);
  });

  it("every cli-refresh code carries the exact command an agent must run", () => {
    for (const spec of FINDING_CATALOG_ORDER) {
      if (spec.lane === "cli-refresh") {
        expect(spec.command).toMatch(/^pnpm /);
      }
    }
  });

  it("codes the board cannot observe are flagged, never left to read as a green zero", () => {
    expect(FINDING_CATALOG["coverage-input-missing"].measuredOnBoard).toBe(false);
    expect(FINDING_CATALOG["detector-extract-failed"].measuredOnBoard).toBe(false);
  });

  it("findingSpec refuses an unknown code (the route 404s rather than showing an empty page)", () => {
    expect(findingSpec("not-a-real-code")).toBeUndefined();
    expect(findingSpec("duplicate-skill")).toBeDefined();
  });
});
