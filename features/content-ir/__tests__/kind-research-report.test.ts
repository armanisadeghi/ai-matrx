/**
 * research_report kind family — structural leg + bridge + XML strategy.
 *
 * Proves the three legs of the fleet deliverable:
 *   1. STRUCTURAL — the storage transform round-trips, the converter emits a
 *      complete provider schema (no unresolved refs), and both authored
 *      kind_example payloads pass the REAL ajv Draft 2020-12 structural leg
 *      (the exact validator the dual gate / shape doctor run). The migration
 *      marks them 'passed' on the strength of this suite.
 *   2. BRIDGE — `researchServerDataFromEnvelope` derives serverData the REAL
 *      ResearchBlock accepts (`ResearchArtifact` passes serverData straight
 *      through as the `research` prop; the contract type is derived from the
 *      component's own parser module, so acceptance is proven at COMPILE
 *      time, no casts) — INCLUDING the Analysis and Recommendations tab
 *      fields today's XML parser never fills.
 *   3. STRATEGY — `research_legacy_text` converts a REAL `<research>`
 *      markdown sample through the actual legacy parser into a schema-valid
 *      canonical value, with the parser↔renderer gap fields ABSENT (the
 *      defect made explicit), and that value rides the same envelope→bridge
 *      pipeline to component-ready serverData.
 */

import type { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import { xmlDiscriminator } from "../core/discriminator";
import type { CanonicalBlockIR } from "../core/ir-types";
import { envelopeFromCompleteValue } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  RESEARCH_REPORT_EXAMPLE_FULL,
  RESEARCH_REPORT_EXAMPLE_SIMPLE,
  RESEARCH_REPORT_KIND_DEFINITIONS,
  RESEARCH_REPORT_KIND_SCHEMAS,
  researchDataFromKindValue,
  researchMarkdownFromValue,
  researchServerDataFromEnvelope,
} from "../kinds/research-report";
import { researchLegacyTextToKindValue } from "../surfaces/research-legacy-text";

/** The REAL component contract (ResearchBlock's `research` prop shape). */
type ResearchData = NonNullable<ReturnType<typeof parseResearchMarkdown>>;

const FAMILY_KINDS = [
  "research_report",
  "research_section",
  "research_finding",
  "research_theme",
  "research_challenge",
  "research_recommendation",
];

/** The fields the legacy XML parser initializes but NEVER populates. */
const PARSER_GAP_FIELDS = [
  "convergentThemes",
  "conflictingEvidence",
  "shortTermOutlook",
  "mediumTermOutlook",
  "longTermVision",
  "challenges",
  "recommendations",
  "limitations",
  "sourceQuality",
  "metadata",
];

const resolve = (kind: string) => RESEARCH_REPORT_KIND_SCHEMAS[kind];

const emitted = kindSchemaToJsonSchema("research_report", resolve, {
  strict: true,
  injectKind: false,
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("research_report kind family — schemas", () => {
  it("declares exactly the six family kinds, root bridged to the research block", () => {
    expect(Object.keys(RESEARCH_REPORT_KIND_SCHEMAS).sort()).toEqual(
      [...FAMILY_KINDS].sort(),
    );
    expect(RESEARCH_REPORT_KIND_DEFINITIONS.map((def) => def.kind).sort()).toEqual(
      [...FAMILY_KINDS].sort(),
    );
    const root = RESEARCH_REPORT_KIND_DEFINITIONS.find(
      (def) => def.kind === "research_report",
    );
    expect(root?.legacyBlockType).toBe("research");
    expect(root?.toLegacyServerData).toBe(researchServerDataFromEnvelope);
  });

  it("round-trips every schema through the storage transform (data[] + edges)", () => {
    for (const kind of FAMILY_KINDS) {
      const schema = RESEARCH_REPORT_KIND_SCHEMAS[kind];
      const storage = kindSchemaToStorage(schema);
      expect(storageToKindSchema(kind, storage)).toEqual(schema);
    }
  });

  it("externalizes the full child-kind edge graph", () => {
    const rootEdges = kindSchemaToStorage(
      RESEARCH_REPORT_KIND_SCHEMAS.research_report,
    ).edges;
    expect(rootEdges).toEqual([
      { fieldPath: "sections", childKind: "research_section", position: 0 },
      {
        fieldPath: "convergentThemes",
        childKind: "research_theme",
        position: 0,
      },
      { fieldPath: "challenges", childKind: "research_challenge", position: 0 },
      {
        fieldPath: "recommendations",
        childKind: "research_recommendation",
        position: 0,
      },
    ]);
    const sectionEdges = kindSchemaToStorage(
      RESEARCH_REPORT_KIND_SCHEMAS.research_section,
    ).edges;
    expect(sectionEdges).toEqual([
      { fieldPath: "findings", childKind: "research_finding", position: 0 },
    ]);
  });

  it("emits a complete provider JSON Schema — no unresolved refs", () => {
    expect(emitted).not.toBeNull();
    expect(emitted?.unresolved).toEqual([]);
    const defs = (emitted?.schema ?? {}) as { $defs?: Record<string, unknown> };
    expect(Object.keys(defs.$defs ?? {}).sort()).toEqual([
      "research_challenge",
      "research_finding",
      "research_recommendation",
      "research_section",
      "research_theme",
    ]);
  });
});

describe("structural leg — REAL ajv Draft 2020-12 over the emitted schema", () => {
  it("the FULL canonical example passes (Analysis + Recommendations populated)", () => {
    const leg = validateStructuralLeg(
      RESEARCH_REPORT_EXAMPLE_FULL,
      emitted?.schema,
    );
    expect(leg).toEqual({ ok: true });
  });

  it("the SIMPLE example passes", () => {
    const leg = validateStructuralLeg(
      RESEARCH_REPORT_EXAMPLE_SIMPLE,
      emitted?.schema,
    );
    expect(leg).toEqual({ ok: true });
  });

  it("the dual gate passes end-to-end for the canonical example", () => {
    const result = runKindDualGate({
      kind: "research_report",
      sample: RESEARCH_REPORT_EXAMPLE_FULL,
      emittedJsonSchema: emitted?.schema,
      definition: {
        legacyBlockType: "research",
        toLegacyServerData: researchServerDataFromEnvelope,
      },
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render).toEqual({ ok: true });
    expect(result.isActive).toBe(true);
  });

  it("rejects an out-of-enum recommendation target (the enum is enforced, not decorative)", () => {
    const mutated = clone(RESEARCH_REPORT_EXAMPLE_FULL) as {
      recommendations: Array<{ target: string }>;
    };
    mutated.recommendations[0].target = "executives";
    const leg = validateStructuralLeg(mutated, emitted?.schema);
    expect(leg.ok).toBe(false);
    expect(leg.detail).toContain("recommendations");
  });
});

describe("bridge — serverData satisfies the REAL ResearchBlock contract", () => {
  const envelope = envelopeFromCompleteValue(
    RESEARCH_REPORT_EXAMPLE_FULL,
    "research_report",
  );
  const serverData = researchServerDataFromEnvelope(envelope);

  it("derives serverData from a complete envelope (and declines a streaming one)", () => {
    expect(serverData).toBeDefined();
    const streaming: CanonicalBlockIR = {
      ...envelope,
      root: { ...envelope.root, status: "streaming" },
    };
    expect(researchServerDataFromEnvelope(streaming)).toBeUndefined();
  });

  it("compile-time proof: the bridge value IS the component's prop type, tab fields included", () => {
    // researchDataFromKindValue returns the type derived from the component's
    // own parser module — this assignment fails to COMPILE if the bridge ever
    // drifts from what ResearchBlock accepts. No casts anywhere.
    const research: ResearchData = researchDataFromKindValue(
      RESEARCH_REPORT_EXAMPLE_FULL,
    );
    expect(research.title).toBe(
      "Grid-Scale Energy Storage: State of the Field 2026",
    );
    // Typed access to the Analysis/Recommendations tab fields — the fields
    // the XML parser never fills reach the component's props here.
    expect(research.convergentThemes).toHaveLength(2);
    expect(research.recommendations).toHaveLength(4);
    expect(research.shortTermOutlook).toHaveLength(2);
    expect(research.conflictingEvidence?.resolution).toContain("4-hour");
  });

  it("populates the Analysis tab fields the XML parser never fills", () => {
    expect(serverData?.convergentThemes).toEqual([
      expect.objectContaining({ theme: "Duration is the new cost axis" }),
      expect.objectContaining({ theme: "Market design lags technology" }),
    ]);
    expect(serverData?.shortTermOutlook).toEqual([
      "Sodium-ion enters commercial 2-6 hour deployments",
      "First bankable 100-hour iron-air contracts signed",
    ]);
    expect(serverData?.mediumTermOutlook).toHaveLength(2);
    expect(serverData?.longTermVision).toHaveLength(1);
    expect(serverData?.conflictingEvidence).toEqual(
      expect.objectContaining({
        disagreement: expect.stringContaining("lithium-ion cost declines"),
      }),
    );
  });

  it("populates the Recommendations tab fields the XML parser never fills", () => {
    const recommendations = serverData?.recommendations as Array<
      Record<string, unknown>
    >;
    expect(recommendations.map((rec) => rec.target)).toEqual([
      "researchers",
      "industry",
      "policymakers",
      "general",
    ]);
    expect(recommendations.map((rec) => rec.id)).toEqual([
      "rec-0",
      "rec-1",
      "rec-2",
      "rec-3",
    ]);
    const challenges = serverData?.challenges as Array<Record<string, unknown>>;
    expect(challenges.map((challenge) => challenge.category)).toEqual([
      "technical",
      "regulatory",
    ]);
    expect(serverData?.limitations).toHaveLength(2);
    expect(serverData?.sourceQuality).toEqual({
      peerReviewed: 24,
      industryReports: 11,
      expertInterviews: 4,
      governmentPubs: 7,
    });
  });

  it("maps findings with sources, urls, and real confidence levels", () => {
    const sections = serverData?.sections as Array<{
      id: string;
      findings: Array<Record<string, unknown>>;
    }>;
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("section-0");
    const [first, second] = sections[0].findings;
    expect(first.id).toBe("finding-0-0");
    expect(first.confidenceLevel).toBe("HIGH");
    expect(first.urls).toEqual(["https://example.com/iron-air-pilot"]);
    expect(first.additionalSources).toEqual([
      "DOE Storage Futures Study",
      "BNEF 2026 outlook",
    ]);
    expect(second.confidenceLevel).toBe("MEDIUM");
  });

  it("synthesizes the parse-provenance fields the component's prop type requires", () => {
    expect(serverData?.allSections).toEqual([]);
    expect(serverData?.unrecognizedSections).toEqual([]);
    expect(serverData?.parsingStats).toEqual({
      totalLines: 0,
      processedLines: 0,
      recognizedSections: 0,
      unrecognizedSections: 0,
    });
    expect(typeof serverData?.rawContent).toBe("string");
    expect(serverData?.rawContent).toContain("Grid-Scale Energy Storage");
  });

  it("folds unknown enum values instead of silently dropping content", () => {
    const research = researchDataFromKindValue({
      title: "Enum folding",
      sections: [
        {
          title: "Findings",
          findings: [
            { title: "F", keyDetails: "D", confidenceLevel: "very high" },
          ],
        },
      ],
      recommendations: [
        { recommendation: "Do the thing.", target: "executives" },
      ],
      challenges: [{ title: "C", description: "D", category: "financial" }],
    });
    // An unknown target would NEVER render (the component iterates exactly
    // four audience groups) — the bridge makes that failure impossible.
    expect(research.recommendations[0].target).toBe("general");
    expect(research.challenges[0].category).toBe("other");
    expect(research.sections[0].findings[0].confidenceLevel).toBe("MEDIUM");
  });
});

describe("<research> XML strategy — research_legacy_text wraps the REAL legacy parser", () => {
  const SAMPLE_XML = [
    "<research>",
    "# AI Code Assistants in Enterprise Development",
    "",
    "## Research Overview",
    "This report reviews field evidence on AI code assistants in enterprise teams.",
    "**Research Scope:** Enterprise deployments 2024-2026",
    "**Key Focus Areas:** Productivity, code quality, review load",
    "**Analysis Period:** 2024-2026",
    "",
    "## Executive Summary",
    "Adoption doubled while measured quality effects stayed mixed.",
    "",
    "## Introduction",
    "This review asks what field studies actually establish.",
    "1. Does assistant adoption improve delivery speed?",
    "2. What are the effects on code quality and review load?",
    "",
    "## Key Research and Discoveries",
    "Across twelve field studies, delivery speed rose consistently while review load grew in proportion to generated-code volume.",
    "",
    "## Conclusion",
    "Evidence supports adoption paired with review guardrails.",
    "1. Speed gains are real and repeatable.",
    "2. Quality effects hinge on review practice, not on the assistant.",
    "",
    "## Methodology",
    "**Search Strategy:** Systematic review of published field studies",
    "**Source Selection Criteria:** Production deployments only",
    "**Analysis Framework:** Before/after delivery-metric comparison",
    "</research>",
  ].join("\n");

  const value = researchLegacyTextToKindValue(SAMPLE_XML);

  it("converts a REAL <research> sample to a canonical research_report value", () => {
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");
    expect(value.__kind).toBe("research_report");
    expect(value.title).toBe("AI Code Assistants in Enterprise Development");
    expect(value.researchScope).toBe("Enterprise deployments 2024-2026");
    expect(value.keyFocusAreas).toBe("Productivity, code quality, review load");
    expect(value.analysisPeriod).toBe("2024-2026");
    expect(value.executiveSummary).toContain("Adoption doubled");
    expect(value.researchQuestions).toEqual([
      "Does assistant adoption improve delivery speed?",
      "What are the effects on code quality and review load?",
    ]);
    expect(value.keyTakeaways).toEqual([
      "Speed gains are real and repeatable.",
      "Quality effects hinge on review practice, not on the assistant.",
    ]);
    expect(value.methodology).toEqual({
      searchStrategy: "Systematic review of published field studies",
      selectionCriteria: "Production deployments only",
      analysisFramework: "Before/after delivery-metric comparison",
    });

    const sections = value.sections as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(1);
    expect(sections[0].__kind).toBe("research_section");
    const findings = sections[0].findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(1);
    expect(findings[0].__kind).toBe("research_finding");
    expect(findings[0].keyDetails).toContain("twelve field studies");
    expect(findings[0].confidenceLevel).toBe("MEDIUM");
  });

  it("emits the parser↔renderer gap fields ABSENT — what XML can't express is not fabricated", () => {
    if (!value) throw new Error("unreachable");
    for (const field of PARSER_GAP_FIELDS) {
      expect(field in value).toBe(false);
    }
  });

  it("the converged XML value is schema-valid, not just bridge-tolerated", () => {
    const leg = validateStructuralLeg(value, emitted?.schema);
    expect(leg).toEqual({ ok: true });
  });

  it("accepts BOTH host framings (accumulator tag-inclusive, splitter inner-only) identically", () => {
    const inner = SAMPLE_XML.replace("<research>\n", "").replace(
      "\n</research>",
      "",
    );
    expect(researchLegacyTextToKindValue(inner)).toEqual(value);
  });

  it("XML value → envelope → bridge yields component-ready serverData with the tab fields empty", () => {
    if (!value) throw new Error("unreachable");
    const envelope = envelopeFromCompleteValue(value, "research_report", {
      discriminator: xmlDiscriminator("research"),
    });
    const serverData = researchServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();

    // Compile-time acceptance by the component contract, XML path included.
    const research: ResearchData = researchDataFromKindValue(value);
    expect(research.title).toBe("AI Code Assistants in Enterprise Development");
    expect(research.sections[0].findings[0].keyDetails).toContain(
      "twelve field studies",
    );
    // The gap, visible end-to-end: the XML path renders these tabs empty; the
    // JSON path (previous describe block) fills them through the SAME bridge.
    expect(research.convergentThemes).toEqual([]);
    expect(research.recommendations).toEqual([]);
    expect(research.shortTermOutlook).toEqual([]);
    expect(research.limitations).toEqual([]);
  });

  it("returns null when the region has no recognizable structure (legacy rendering stands)", () => {
    expect(
      researchLegacyTextToKindValue(
        "<research>\nJust prose with no headers at all.\n</research>",
      ),
    ).toBeNull();
  });
});

describe("toMarkdown facet", () => {
  it("renders human-readable markdown with the analysis and recommendations sections", () => {
    const markdown = researchMarkdownFromValue(RESEARCH_REPORT_EXAMPLE_FULL);
    expect(markdown).toContain(
      "# Grid-Scale Energy Storage: State of the Field 2026",
    );
    expect(markdown).toContain("## Analysis");
    expect(markdown).toContain("**Convergent themes**");
    expect(markdown).toContain("## Recommendations");
    expect(markdown).toContain("**Study limitations**");
    expect(markdown).not.toContain("[object Object]");
  });
});
