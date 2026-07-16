/**
 * research_report kind family → ResearchBlock bridge.
 *
 * The kind is derived from what the component CAN render — the full
 * `ResearchData` contract of `ResearchBlock`
 * (components/mardown-display/blocks/research/ResearchBlock.tsx), NOT from
 * what today's XML parser produces. That distinction is the whole point:
 * `parseResearchMarkdown` initializes but NEVER populates the fields behind
 * the Analysis and Recommendations tabs (`convergentThemes`,
 * `conflictingEvidence`, `shortTermOutlook` / `mediumTermOutlook` /
 * `longTermVision`, `challenges`, `recommendations`, `limitations`,
 * `sourceQuality`, `metadata`) nor the per-finding evidence fields
 * (`primarySource`, `additionalSources`, `urls`, `significance`,
 * `futureImplications`, real `confidenceLevel`s). The component renders all
 * of them. A `__kind` JSON arrival carries every one of those fields
 * first-class, so the canonical path EXCEEDS the legacy XML path by
 * construction.
 *
 * Family (6 kinds): research_report → research_section → research_finding,
 * plus research_theme (convergent themes), research_challenge,
 * research_recommendation.
 *
 * The bridge follows the quiz/flashcards precedent
 * (`makeCompleteEnvelopeBridge`): complete-only, zero data loss (unknown keys
 * ride onto serverData), memoized per envelope. It synthesizes everything the
 * component's prop type requires but that is pure parse provenance
 * (`allSections`, `unrecognizedSections`, `rawContent`, `parsingStats`) —
 * agents never author those. Presentation ids (`section-i`, `finding-i-j`,
 * `challenge-i`, `rec-i`) are synthesized too, mirroring the quiz bridge.
 *
 * Enum normalization kills two silent legacy failure modes:
 * - a recommendation whose `target` is not one of the four groups the
 *   component iterates would NEVER render — the bridge folds unknown targets
 *   to "general";
 * - a `confidenceLevel` outside HIGH/MEDIUM/LOW would break the badge and the
 *   confidence filter — the bridge folds unknown levels to "MEDIUM".
 *
 * NOT registered anywhere by this module (fleet rule: registration is the
 * integrator's edit). `RESEARCH_REPORT_KIND_DEFINITIONS` is shaped to drop
 * into `SYSTEM_KIND_DEFINITIONS` verbatim at integration time.
 */

import type { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

/**
 * The REAL component contract — derived from the component's own parser
 * module so the bridge can never drift from what `ResearchBlock` accepts
 * (`ResearchArtifact` passes `serverData` straight through as the `research`
 * prop). Type-only import: erased at runtime.
 */
type ResearchData = NonNullable<ReturnType<typeof parseResearchMarkdown>>;
type ResearchSectionData = ResearchData["sections"][number];
type ResearchFindingData = ResearchSectionData["findings"][number];
type ResearchThemeData = ResearchData["convergentThemes"][number];
type ResearchChallengeData = ResearchData["challenges"][number];
type ResearchRecommendationData = ResearchData["recommendations"][number];

// ---------------------------------------------------------------------------
// Kind schemas — field names mirror the component props 1:1 (camelCase), so
// the bridge is a thin normalizer, not a translator.
// ---------------------------------------------------------------------------

export const RESEARCH_REPORT_KIND_SCHEMAS: Record<string, KindSchema> = {
  research_report: {
    kind: "research_report",
    fields: {
      title: { type: "string", required: true },
      overview: { type: "string" },
      researchScope: { type: "string" },
      keyFocusAreas: { type: "string" },
      analysisPeriod: { type: "string" },
      executiveSummary: { type: "string" },
      introduction: { type: "string" },
      researchQuestions: { type: "string[]" },
      sections: {
        type: "array",
        itemKinds: ["research_section"],
        required: true,
      },
      // ── Analysis tab (XML parser never fills any of these) ───────────────
      convergentThemes: { type: "array", itemKinds: ["research_theme"] },
      conflictingEvidence: {
        type: "inline_object",
        fields: {
          disagreement: { type: "string" },
          perspectives: { type: "string" },
          resolution: { type: "string" },
        },
      },
      shortTermOutlook: { type: "string[]" },
      mediumTermOutlook: { type: "string[]" },
      longTermVision: { type: "string[]" },
      // ── Recommendations tab (XML parser never fills any of these) ────────
      challenges: { type: "array", itemKinds: ["research_challenge"] },
      recommendations: {
        type: "array",
        itemKinds: ["research_recommendation"],
      },
      limitations: { type: "string[]" },
      // ── Conclusion / provenance ───────────────────────────────────────────
      conclusion: { type: "string" },
      keyTakeaways: { type: "string[]" },
      methodology: {
        type: "inline_object",
        fields: {
          searchStrategy: { type: "string" },
          selectionCriteria: { type: "string" },
          analysisFramework: { type: "string" },
        },
      },
      sourceQuality: {
        type: "inline_object",
        fields: {
          peerReviewed: { type: "number" },
          industryReports: { type: "number" },
          expertInterviews: { type: "number" },
          governmentPubs: { type: "number" },
        },
      },
      metadata: {
        type: "inline_object",
        fields: {
          researchDate: { type: "string" },
          lastUpdated: { type: "string" },
          confidenceRating: { type: "string" },
          biasAssessment: { type: "string" },
        },
      },
      additionalDetails: { type: "inline_object", open: true, fields: {} },
    },
  },
  research_section: {
    kind: "research_section",
    fields: {
      title: { type: "string", required: true },
      subtitle: { type: "string" },
      findings: {
        type: "array",
        itemKinds: ["research_finding"],
        required: true,
      },
    },
  },
  research_finding: {
    kind: "research_finding",
    fields: {
      title: { type: "string", required: true },
      keyDetails: { type: "string", required: true },
      primarySource: { type: "string" },
      additionalSources: { type: "string[]" },
      urls: { type: "string[]" },
      significance: { type: "string" },
      futureImplications: { type: "string" },
      confidenceLevel: { type: "enum", values: ["HIGH", "MEDIUM", "LOW"] },
    },
  },
  research_theme: {
    kind: "research_theme",
    fields: {
      theme: { type: "string", required: true },
      description: { type: "string", required: true },
    },
  },
  research_challenge: {
    kind: "research_challenge",
    fields: {
      title: { type: "string", required: true },
      description: { type: "string", required: true },
      currentSolutions: { type: "string" },
      researchGaps: { type: "string" },
      category: {
        type: "enum",
        values: ["technical", "ethical", "regulatory", "other"],
      },
    },
  },
  research_recommendation: {
    kind: "research_recommendation",
    fields: {
      recommendation: { type: "string", required: true },
      target: {
        type: "enum",
        values: ["researchers", "industry", "policymakers", "general"],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Bridge helpers — tolerant reads, enum folding, id synthesis.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeConfidence(
  value: unknown,
): ResearchFindingData["confidenceLevel"] {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") {
      return upper;
    }
  }
  return "MEDIUM";
}

/**
 * The component renders recommendations by iterating exactly four target
 * groups — a recommendation with any other target string silently never
 * renders. Folding unknowns to "general" makes that failure impossible.
 */
function normalizeTarget(
  value: unknown,
): ResearchRecommendationData["target"] {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (
      lower === "researchers" ||
      lower === "industry" ||
      lower === "policymakers" ||
      lower === "general"
    ) {
      return lower;
    }
  }
  return "general";
}

function normalizeCategory(
  value: unknown,
): ResearchChallengeData["category"] {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (
      lower === "technical" ||
      lower === "ethical" ||
      lower === "regulatory" ||
      lower === "other"
    ) {
      return lower;
    }
  }
  return "other";
}

function mapFinding(
  finding: Record<string, unknown>,
  sectionIndex: number,
  findingIndex: number,
): ResearchFindingData {
  return {
    id: `finding-${sectionIndex}-${findingIndex}`,
    title: str(finding.title),
    primarySource: str(finding.primarySource),
    additionalSources: strArray(finding.additionalSources),
    urls: strArray(finding.urls),
    keyDetails: str(finding.keyDetails),
    significance: str(finding.significance),
    futureImplications: str(finding.futureImplications),
    confidenceLevel: normalizeConfidence(finding.confidenceLevel),
  };
}

function mapSections(value: unknown): ResearchSectionData[] {
  if (!Array.isArray(value)) return [];
  const sections: ResearchSectionData[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const index = sections.length;
    const findings = Array.isArray(raw.findings)
      ? raw.findings
          .filter(isRecord)
          .map((finding, findingIndex) =>
            mapFinding(finding, index, findingIndex),
          )
      : [];
    const section: ResearchSectionData = {
      id: `section-${index}`,
      title: str(raw.title),
      findings,
    };
    const subtitle = optStr(raw.subtitle);
    if (subtitle !== undefined) section.subtitle = subtitle;
    sections.push(section);
  }
  return sections;
}

function mapThemes(value: unknown): ResearchThemeData[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((theme) => ({
    theme: str(theme.theme),
    description: str(theme.description),
  }));
}

function mapChallenges(value: unknown): ResearchChallengeData[] {
  if (!Array.isArray(value)) return [];
  const challenges: ResearchChallengeData[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const challenge: ResearchChallengeData = {
      id: `challenge-${challenges.length}`,
      title: str(raw.title),
      description: str(raw.description),
      category: normalizeCategory(raw.category),
    };
    const currentSolutions = optStr(raw.currentSolutions);
    if (currentSolutions !== undefined) {
      challenge.currentSolutions = currentSolutions;
    }
    const researchGaps = optStr(raw.researchGaps);
    if (researchGaps !== undefined) challenge.researchGaps = researchGaps;
    challenges.push(challenge);
  }
  return challenges;
}

function mapRecommendations(value: unknown): ResearchRecommendationData[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((raw, index) => ({
    id: `rec-${index}`,
    recommendation: str(raw.recommendation),
    target: normalizeTarget(raw.target),
  }));
}

function mapConflictingEvidence(
  value: unknown,
): ResearchData["conflictingEvidence"] {
  if (!isRecord(value)) return undefined;
  return {
    disagreement: str(value.disagreement),
    perspectives: str(value.perspectives),
    resolution: str(value.resolution),
  };
}

function mapMethodology(value: unknown): ResearchData["methodology"] {
  if (!isRecord(value)) return undefined;
  return {
    searchStrategy: str(value.searchStrategy),
    selectionCriteria: str(value.selectionCriteria),
    analysisFramework: str(value.analysisFramework),
  };
}

function mapSourceQuality(value: unknown): ResearchData["sourceQuality"] {
  if (!isRecord(value)) return undefined;
  return {
    peerReviewed: num(value.peerReviewed),
    industryReports: num(value.industryReports),
    expertInterviews: num(value.expertInterviews),
    governmentPubs: num(value.governmentPubs),
  };
}

function mapReportMetadata(value: unknown): ResearchData["metadata"] {
  const metadata: ResearchData["metadata"] = {};
  if (!isRecord(value)) return metadata;
  const researchDate = optStr(value.researchDate);
  if (researchDate !== undefined) metadata.researchDate = researchDate;
  const lastUpdated = optStr(value.lastUpdated);
  if (lastUpdated !== undefined) metadata.lastUpdated = lastUpdated;
  const confidenceRating = optStr(value.confidenceRating);
  if (confidenceRating !== undefined) {
    metadata.confidenceRating = confidenceRating;
  }
  const biasAssessment = optStr(value.biasAssessment);
  if (biasAssessment !== undefined) metadata.biasAssessment = biasAssessment;
  return metadata;
}

/** Keys the bridge consumes — everything else rides onto serverData. */
const MAPPED_REPORT_KEYS = new Set([
  "title",
  "overview",
  "researchScope",
  "keyFocusAreas",
  "analysisPeriod",
  "executiveSummary",
  "introduction",
  "researchQuestions",
  "sections",
  "convergentThemes",
  "conflictingEvidence",
  "shortTermOutlook",
  "mediumTermOutlook",
  "longTermVision",
  "challenges",
  "recommendations",
  "conclusion",
  "keyTakeaways",
  "methodology",
  "sourceQuality",
  "limitations",
  "metadata",
]);

/**
 * Canonical kind value → the component's exact prop object. Exported so the
 * structural test proves — at compile time, no casts — that the bridge output
 * satisfies the REAL `ResearchBlock` contract, Analysis/Recommendations tab
 * fields included.
 */
export function researchDataFromKindValue(
  value: Record<string, unknown>,
): ResearchData {
  const research: ResearchData = {
      title: str(value.title) || "Research Analysis",
      overview: str(value.overview),
      introduction: str(value.introduction),
      researchQuestions: strArray(value.researchQuestions),
      sections: mapSections(value.sections),
      convergentThemes: mapThemes(value.convergentThemes),
      shortTermOutlook: strArray(value.shortTermOutlook),
      mediumTermOutlook: strArray(value.mediumTermOutlook),
      longTermVision: strArray(value.longTermVision),
      challenges: mapChallenges(value.challenges),
      recommendations: mapRecommendations(value.recommendations),
      conclusion: str(value.conclusion),
      keyTakeaways: strArray(value.keyTakeaways),
      limitations: strArray(value.limitations),
      metadata: mapReportMetadata(value.metadata),
      // Parse provenance the component's prop type requires but a canonical
      // JSON arrival never carries — synthesized, honest (the Debug tab shows
      // the canonical value as the "raw content").
      allSections: [],
      unrecognizedSections: [],
      rawContent: JSON.stringify(value, null, 2),
      parsingStats: {
        totalLines: 0,
        processedLines: 0,
        recognizedSections: 0,
        unrecognizedSections: 0,
      },
    };

    const researchScope = optStr(value.researchScope);
    if (researchScope !== undefined) research.researchScope = researchScope;
    const keyFocusAreas = optStr(value.keyFocusAreas);
    if (keyFocusAreas !== undefined) research.keyFocusAreas = keyFocusAreas;
    const analysisPeriod = optStr(value.analysisPeriod);
    if (analysisPeriod !== undefined) research.analysisPeriod = analysisPeriod;
    const executiveSummary = optStr(value.executiveSummary);
    if (executiveSummary !== undefined) {
      research.executiveSummary = executiveSummary;
    }
    const conflictingEvidence = mapConflictingEvidence(
      value.conflictingEvidence,
    );
    if (conflictingEvidence !== undefined) {
      research.conflictingEvidence = conflictingEvidence;
    }
    const methodology = mapMethodology(value.methodology);
    if (methodology !== undefined) research.methodology = methodology;
    const sourceQuality = mapSourceQuality(value.sourceQuality);
    if (sourceQuality !== undefined) research.sourceQuality = sourceQuality;

    return research;
}

export const researchServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "research_report",
  (value) => {
    // Zero data loss: schema-unknown extras ride along untouched.
    const serverData: Record<string, unknown> = {
      ...researchDataFromKindValue(value),
    };
    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_REPORT_KEYS.has(key) || key in serverData) continue;
      serverData[key] = extra;
    }
    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — research_report → human-readable report markdown.
// Mirrors the component's tab structure (Overview / Findings / Analysis /
// Recommendations) as document sections. Unknown keys never silently vanish.
// ---------------------------------------------------------------------------

const MD_FINDING_KNOWN_KEYS = [
  "title",
  "keyDetails",
  "primarySource",
  "additionalSources",
  "urls",
  "significance",
  "futureImplications",
  "confidenceLevel",
];

const MD_REPORT_KNOWN_KEYS = [...MAPPED_REPORT_KEYS, "additionalDetails"];

function bulletList(items: string[]): string | null {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : null;
}

function numberedList(items: string[]): string | null {
  return items.length > 0
    ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : null;
}

function labeledSection(heading: string, body: string | null): string | null {
  return body ? `## ${heading}\n\n${body}` : null;
}

function findingMarkdown(finding: Record<string, unknown>): string {
  const blocks: Array<string | null> = [
    `#### ${str(finding.title) || "Finding"}`,
  ];

  const meta: string[] = [];
  const confidence = optStr(finding.confidenceLevel);
  if (confidence) meta.push(`- **Confidence:** ${confidence}`);
  const primarySource = optStr(finding.primarySource);
  if (primarySource) meta.push(`- **Primary source:** ${primarySource}`);
  const additionalSources = strArray(finding.additionalSources);
  if (additionalSources.length > 0) {
    meta.push(`- **Additional sources:** ${additionalSources.join(", ")}`);
  }
  for (const url of strArray(finding.urls)) {
    meta.push(`- <${url}>`);
  }
  if (meta.length > 0) blocks.push(meta.join("\n"));

  const keyDetails = optStr(finding.keyDetails);
  if (keyDetails) blocks.push(keyDetails);
  const significance = optStr(finding.significance);
  if (significance) blocks.push(`**Significance:** ${significance}`);
  const futureImplications = optStr(finding.futureImplications);
  if (futureImplications) {
    blocks.push(`**Future implications:** ${futureImplications}`);
  }

  const extras = extrasList(collectExtras(finding, MD_FINDING_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

function sectionMarkdown(section: Record<string, unknown>): string {
  const blocks: Array<string | null> = [
    `### ${str(section.title) || "Findings"}`,
  ];
  const subtitle = optStr(section.subtitle);
  if (subtitle) blocks.push(`*${subtitle}*`);
  const findings = Array.isArray(section.findings)
    ? section.findings.filter(isRecordValue)
    : [];
  blocks.push(...findings.map(findingMarkdown));
  return joinBlocks(blocks);
}

export function researchMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const blocks: Array<string | null> = [
    `# ${str(value.title) || "Research Analysis"}`,
  ];

  const overview = optStr(value.overview);
  if (overview) blocks.push(overview);

  const headerMeta: string[] = [];
  const researchScope = optStr(value.researchScope);
  if (researchScope) headerMeta.push(`- **Scope:** ${researchScope}`);
  const keyFocusAreas = optStr(value.keyFocusAreas);
  if (keyFocusAreas) headerMeta.push(`- **Focus areas:** ${keyFocusAreas}`);
  const analysisPeriod = optStr(value.analysisPeriod);
  if (analysisPeriod) headerMeta.push(`- **Period:** ${analysisPeriod}`);
  if (headerMeta.length > 0) blocks.push(headerMeta.join("\n"));

  blocks.push(
    labeledSection("Executive Summary", optStr(value.executiveSummary) ?? null),
  );

  const introduction = optStr(value.introduction);
  const questions = numberedList(strArray(value.researchQuestions));
  if (introduction || questions) {
    blocks.push(
      labeledSection(
        "Introduction",
        joinBlocks([
          introduction ?? null,
          questions ? `**Key research questions**\n\n${questions}` : null,
        ]),
      ),
    );
  }

  const sections = Array.isArray(value.sections)
    ? value.sections.filter(isRecordValue)
    : [];
  if (sections.length > 0) {
    blocks.push(
      labeledSection(
        "Research Findings",
        joinBlocks(sections.map(sectionMarkdown)),
      ),
    );
  }

  const analysisBlocks: Array<string | null> = [];
  const themes = Array.isArray(value.convergentThemes)
    ? value.convergentThemes.filter(isRecordValue)
    : [];
  if (themes.length > 0) {
    analysisBlocks.push(
      `**Convergent themes**\n\n${themes
        .map((theme) => `- **${str(theme.theme)}** — ${str(theme.description)}`)
        .join("\n")}`,
    );
  }
  const conflicting = isRecordValue(value.conflictingEvidence)
    ? value.conflictingEvidence
    : null;
  if (conflicting) {
    const lines: string[] = [];
    const disagreement = optStr(conflicting.disagreement);
    if (disagreement) lines.push(`- **Disagreement:** ${disagreement}`);
    const perspectives = optStr(conflicting.perspectives);
    if (perspectives) lines.push(`- **Perspectives:** ${perspectives}`);
    const resolution = optStr(conflicting.resolution);
    if (resolution) lines.push(`- **Resolution:** ${resolution}`);
    if (lines.length > 0) {
      analysisBlocks.push(`**Conflicting evidence**\n\n${lines.join("\n")}`);
    }
  }
  const shortTerm = bulletList(strArray(value.shortTermOutlook));
  if (shortTerm) {
    analysisBlocks.push(`**Short-term outlook (1-2 years)**\n\n${shortTerm}`);
  }
  const mediumTerm = bulletList(strArray(value.mediumTermOutlook));
  if (mediumTerm) {
    analysisBlocks.push(
      `**Medium-term outlook (3-5 years)**\n\n${mediumTerm}`,
    );
  }
  const longTerm = bulletList(strArray(value.longTermVision));
  if (longTerm) {
    analysisBlocks.push(`**Long-term vision (5+ years)**\n\n${longTerm}`);
  }
  blocks.push(labeledSection("Analysis", joinBlocks(analysisBlocks)));

  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.filter(isRecordValue)
    : [];
  if (recommendations.length > 0) {
    blocks.push(
      labeledSection(
        "Recommendations",
        recommendations
          .map(
            (rec) =>
              `- **${normalizeTarget(rec.target)}:** ${str(
                rec.recommendation,
              )}`,
          )
          .join("\n"),
      ),
    );
  }

  const challenges = Array.isArray(value.challenges)
    ? value.challenges.filter(isRecordValue)
    : [];
  const limitations = strArray(value.limitations);
  if (challenges.length > 0 || limitations.length > 0) {
    const challengeBlocks: Array<string | null> = [];
    for (const challenge of challenges) {
      const lines: string[] = [
        `- **${str(challenge.title)}** (${normalizeCategory(
          challenge.category,
        )}) — ${str(challenge.description)}`,
      ];
      const currentSolutions = optStr(challenge.currentSolutions);
      if (currentSolutions) {
        lines.push(`  - Current solutions: ${currentSolutions}`);
      }
      const researchGaps = optStr(challenge.researchGaps);
      if (researchGaps) lines.push(`  - Research gaps: ${researchGaps}`);
      challengeBlocks.push(lines.join("\n"));
    }
    const limitationList = bulletList(limitations);
    blocks.push(
      labeledSection(
        "Challenges & Limitations",
        joinBlocks([
          challengeBlocks.length > 0 ? challengeBlocks.join("\n") : null,
          limitationList ? `**Study limitations**\n\n${limitationList}` : null,
        ]),
      ),
    );
  }

  const conclusion = optStr(value.conclusion);
  const takeaways = numberedList(strArray(value.keyTakeaways));
  if (conclusion || takeaways) {
    blocks.push(
      labeledSection(
        "Conclusion",
        joinBlocks([
          conclusion ?? null,
          takeaways ? `**Key takeaways**\n\n${takeaways}` : null,
        ]),
      ),
    );
  }

  const methodology = isRecordValue(value.methodology)
    ? value.methodology
    : null;
  if (methodology) {
    const lines: string[] = [];
    const searchStrategy = optStr(methodology.searchStrategy);
    if (searchStrategy) lines.push(`- **Search strategy:** ${searchStrategy}`);
    const selectionCriteria = optStr(methodology.selectionCriteria);
    if (selectionCriteria) {
      lines.push(`- **Selection criteria:** ${selectionCriteria}`);
    }
    const analysisFramework = optStr(methodology.analysisFramework);
    if (analysisFramework) {
      lines.push(`- **Analysis framework:** ${analysisFramework}`);
    }
    blocks.push(
      labeledSection(
        "Methodology",
        lines.length > 0 ? lines.join("\n") : null,
      ),
    );
  }

  blocks.push(
    additionalDetailsSection(collectExtras(value, MD_REPORT_KNOWN_KEYS)),
  );

  return joinBlocks(blocks);
}

// ---------------------------------------------------------------------------
// Staged registry entries — drop-in shape for SYSTEM_KIND_DEFINITIONS at
// integration time (this module performs NO registration).
// ---------------------------------------------------------------------------

export const RESEARCH_REPORT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "research_report",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "research",
    toLegacyServerData: researchServerDataFromEnvelope,
    toMarkdown: researchMarkdownFromValue,
    artifact: { canvasType: "research" },
    persistence: { persistStructured: true },
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_report,
  },
  {
    kind: "research_section",
    schemaSource: "system",
    tier: "eager",
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_section,
  },
  {
    kind: "research_finding",
    schemaSource: "system",
    tier: "eager",
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_finding,
  },
  {
    kind: "research_theme",
    schemaSource: "system",
    tier: "eager",
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_theme,
  },
  {
    kind: "research_challenge",
    schemaSource: "system",
    tier: "eager",
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_challenge,
  },
  {
    kind: "research_recommendation",
    schemaSource: "system",
    tier: "eager",
    schema: RESEARCH_REPORT_KIND_SCHEMAS.research_recommendation,
  },
];

// ---------------------------------------------------------------------------
// Authored examples — the kind_example seeds (block form, carrying __kind).
// The FULL example populates the Analysis + Recommendations tab fields the
// XML parser can never produce — the proof that the JSON path exceeds the
// XML path. Validated for real (ajv over the converter-emitted schema) by
// __tests__/kind-research-report.test.ts before the migration marks them
// 'passed'.
// ---------------------------------------------------------------------------

export const RESEARCH_REPORT_EXAMPLE_FULL: Record<string, unknown> = {
  __kind: "research_report",
  title: "Grid-Scale Energy Storage: State of the Field 2026",
  overview:
    "A synthesis of recent research on grid-scale energy storage technologies, spanning lithium-ion alternatives, flow batteries, and long-duration storage economics.",
  researchScope: "Grid-scale stationary storage, 2023-2026 literature",
  keyFocusAreas: "Battery chemistry, storage economics, grid integration",
  analysisPeriod: "2023-2026",
  executiveSummary:
    "Storage costs continue to fall while duration requirements rise. Iron-air and sodium-ion chemistries moved from lab to pilot deployment, and long-duration economics now hinge on capacity-market reform more than on cell cost.",
  introduction:
    "As renewable penetration passes 40 percent in leading grids, storage shifts from arbitrage asset to reliability backbone. This report reviews what the recent literature establishes, where evidence conflicts, and what remains open.",
  researchQuestions: [
    "Which post-lithium chemistries are closest to bankable grid deployment?",
    "How do long-duration storage economics change under high renewable penetration?",
    "What regulatory changes most affect storage revenue stacking?",
  ],
  sections: [
    {
      __kind: "research_section",
      title: "Key Research and Discoveries",
      subtitle: "Chemistry and deployment findings",
      findings: [
        {
          __kind: "research_finding",
          title: "Iron-air pilots reached grid interconnection",
          primarySource: "Journal of Power Sources (2025)",
          additionalSources: ["DOE Storage Futures Study", "BNEF 2026 outlook"],
          urls: ["https://example.com/iron-air-pilot"],
          keyDetails:
            "Three iron-air installations totaling 45 MW cleared interconnection and delivered 100-hour discharge in field conditions, at a reported cost of 20 USD per kWh of capacity.",
          significance:
            "First field evidence that multi-day storage can undercut gas peakers on capacity cost.",
          futureImplications:
            "If round-trip efficiency improves past 50 percent, iron-air becomes the default multi-day asset in high-wind grids.",
          confidenceLevel: "HIGH",
        },
        {
          __kind: "research_finding",
          title: "Sodium-ion supply chains localized faster than forecast",
          primarySource: "Nature Energy (2026)",
          additionalSources: [],
          urls: [],
          keyDetails:
            "Sodium-ion cell production outside China tripled year over year, driven by cathode plants co-located with soda-ash production.",
          significance:
            "Reduces geopolitical concentration risk that constrained lithium-ion procurement.",
          futureImplications:
            "Expect sodium-ion to take the 2-6 hour duration segment on cost by 2028.",
          confidenceLevel: "MEDIUM",
        },
      ],
    },
  ],
  convergentThemes: [
    {
      __kind: "research_theme",
      theme: "Duration is the new cost axis",
      description:
        "Across chemistries, papers converge on duration-adjusted cost (USD per kWh-cycle) replacing raw capex as the deciding metric.",
    },
    {
      __kind: "research_theme",
      theme: "Market design lags technology",
      description:
        "Multiple studies find capacity markets undervalue storage longer than 4 hours, independent of chemistry.",
    },
  ],
  conflictingEvidence: {
    disagreement:
      "Whether lithium-ion cost declines will outpace alternative chemistries through 2030.",
    perspectives:
      "Techno-economic models project continued 8 percent annual declines; supply-chain analyses argue raw-material floors arrive by 2028.",
    resolution:
      "Most recent reviews treat the 4-hour segment as lithium-locked while conceding everything longer to alternatives.",
  },
  shortTermOutlook: [
    "Sodium-ion enters commercial 2-6 hour deployments",
    "First bankable 100-hour iron-air contracts signed",
  ],
  mediumTermOutlook: [
    "Capacity-market reforms price duration explicitly",
    "Hybrid plants pairing storage chemistries become standard",
  ],
  longTermVision: [
    "Seasonal storage economics close for high-latitude grids",
  ],
  challenges: [
    {
      __kind: "research_challenge",
      title: "Round-trip efficiency of metal-air systems",
      description:
        "Iron-air round-trip efficiency remains below 45 percent, limiting use to low-cycle applications.",
      currentSolutions: "Electrolyte additives and electrode texturing pilots.",
      researchGaps: "No published pathway past 55 percent at system scale.",
      category: "technical",
    },
    {
      __kind: "research_challenge",
      title: "Interconnection queue backlogs",
      description:
        "Storage projects wait a median of 3.5 years for interconnection studies in US markets.",
      category: "regulatory",
    },
  ],
  recommendations: [
    {
      __kind: "research_recommendation",
      recommendation:
        "Prioritize round-trip efficiency research for metal-air chemistries over further capex reduction.",
      target: "researchers",
    },
    {
      __kind: "research_recommendation",
      recommendation:
        "Contract multi-chemistry portfolios rather than betting a single storage duration segment.",
      target: "industry",
    },
    {
      __kind: "research_recommendation",
      recommendation:
        "Reform capacity accreditation to value duration beyond 4 hours explicitly.",
      target: "policymakers",
    },
    {
      __kind: "research_recommendation",
      recommendation:
        "Expect grid electricity reliability economics to shift visibly by 2028.",
      target: "general",
    },
  ],
  conclusion:
    "The storage field has moved from a single-chemistry cost race to a duration-segmented market. Research attention is shifting accordingly, from cell chemistry to system economics and market design.",
  keyTakeaways: [
    "Duration-adjusted cost is the deciding metric, not raw capex.",
    "Iron-air and sodium-ion are field-proven, not speculative.",
    "Market design is now the binding constraint, not technology.",
  ],
  methodology: {
    searchStrategy:
      "Systematic search of peer-reviewed energy journals plus grid-operator technical reports, 2023-2026.",
    selectionCriteria:
      "Field data or validated techno-economic models; lab-only results excluded.",
    analysisFramework:
      "Duration-segmented comparison with confidence grading per finding.",
  },
  sourceQuality: {
    peerReviewed: 24,
    industryReports: 11,
    expertInterviews: 4,
    governmentPubs: 7,
  },
  limitations: [
    "Chinese-language deployment data underrepresented.",
    "Cost figures self-reported by vendors for pilot projects.",
  ],
  metadata: {
    researchDate: "2026-06-30",
    lastUpdated: "2026-07-06",
    confidenceRating: "Medium-high overall",
    biasAssessment: "Vendor-reported costs may skew optimistic",
  },
};

export const RESEARCH_REPORT_EXAMPLE_SIMPLE: Record<string, unknown> = {
  __kind: "research_report",
  title: "TypeScript Adoption in Enterprise Frontends",
  overview:
    "A short review of published migration case studies from JavaScript to TypeScript in large codebases.",
  introduction:
    "This mini-report summarizes what published case studies establish about enterprise TypeScript migrations.",
  researchQuestions: [
    "What defect-rate changes do enterprise TypeScript migrations report?",
  ],
  sections: [
    {
      __kind: "research_section",
      title: "Key Research Findings",
      findings: [
        {
          __kind: "research_finding",
          title: "Migrations report double-digit defect reduction",
          primarySource: "ICSE industry track (2024)",
          keyDetails:
            "Across six published case studies, teams reported 15-38 percent fewer production type errors within a year of completing migration.",
          significance:
            "Consistent direction of effect across independent organizations.",
          confidenceLevel: "MEDIUM",
        },
      ],
    },
  ],
  conclusion:
    "Published evidence, while self-selected, consistently associates TypeScript adoption with fewer production type errors.",
  keyTakeaways: ["Effect direction is consistent; effect size varies widely."],
};
