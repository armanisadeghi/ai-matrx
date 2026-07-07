/**
 * `research_legacy_text` — the named parser strategy behind the `<research>`
 * XML surface (kind_surface: xml_tag/research → research_report).
 *
 * WRAPS the one existing legacy parser — `parseResearchMarkdown`, the exact
 * code ResearchBlock renders `<research>` markdown through today. It NEVER
 * re-implements that grammar; it only maps the parser's output onto the
 * canonical research_report value, so the XML surface converges to the SAME
 * shape a `__kind` JSON arrival carries (THE KEYSTONE).
 *
 * THE PARSER↔RENDERER GAP, made explicit: `parseResearchMarkdown` initializes
 * but never populates `convergentThemes`, `conflictingEvidence`,
 * `shortTermOutlook` / `mediumTermOutlook` / `longTermVision`, `challenges`,
 * `recommendations`, `limitations`, `sourceQuality`, and `metadata` — the
 * fields behind the component's Analysis and Recommendations tabs — nor the
 * per-finding evidence fields (`additionalSources`, `urls`, real
 * `confidenceLevel`s; structured findings even get empty `keyDetails`). This
 * strategy therefore emits those kind fields ABSENT, never as empty
 * placeholders: what the XML cannot express simply is not in the converged
 * value. The `__kind` JSON path populates all of them (see
 * kinds/research-report.ts) — that asymmetry is the win, not a defect of this
 * strategy.
 *
 * Parser sentinel strings ("No overview found" / "No introduction found" /
 * "No conclusion found") are parse noise, not data — they are dropped rather
 * than carried into the canonical value (the bridge then renders those
 * sections empty/hidden instead of displaying fake prose).
 *
 * Null (loud, legacy rendering untouched) when the parser throws or when the
 * region contains no recognizable section at all — converging an empty shell
 * adds nothing over today's rendering.
 */

import { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

type ResearchData = NonNullable<ReturnType<typeof parseResearchMarkdown>>;

/** Opening tag with optional attributes, e.g. `<research>` — host framing. */
const OPENING_TAG_RE = /^\s*<research(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</research>";

/** Parser fallbacks that mean "not found" — never canonical data. */
const SENTINELS = new Set([
  "No overview found",
  "No introduction found",
  "No conclusion found",
]);

function meaningful(text: string): string | null {
  const trimmed = text.trim();
  return trimmed !== "" && !SENTINELS.has(trimmed) ? trimmed : null;
}

function setIfMeaningful(
  value: Record<string, unknown>,
  key: string,
  text: string,
): void {
  const cleaned = meaningful(text);
  if (cleaned !== null) value[key] = cleaned;
}

function mapFinding(
  finding: ResearchData["sections"][number]["findings"][number],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    [KIND_KEY]: "research_finding",
    title: finding.title,
    // Required by the kind schema — present even when the legacy parser's
    // structured-finding branch left it empty (a documented parser gap).
    keyDetails: finding.keyDetails,
    confidenceLevel: finding.confidenceLevel,
  };
  setIfMeaningful(mapped, "primarySource", finding.primarySource);
  setIfMeaningful(mapped, "significance", finding.significance);
  setIfMeaningful(mapped, "futureImplications", finding.futureImplications);
  // The legacy parser never fills these; kept conditional so they appear the
  // day it does, and stay absent (not empty) until then.
  if (finding.additionalSources.length > 0) {
    mapped.additionalSources = finding.additionalSources;
  }
  if (finding.urls.length > 0) mapped.urls = finding.urls;
  return mapped;
}

function mapSection(
  section: ResearchData["sections"][number],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    [KIND_KEY]: "research_section",
    title: section.title,
    findings: section.findings.map(mapFinding),
  };
  if (typeof section.subtitle === "string" && section.subtitle.trim() !== "") {
    mapped.subtitle = section.subtitle.trim();
  }
  return mapped;
}

/**
 * Completed `<research>` region text → canonical research_report value, or
 * null when nothing recognizable parsed (the caller treats null as parse
 * failure: loud, legacy rendering untouched).
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags, the splitter's is inner-only. Framing is stripped before the
 * legacy parser runs (its own tag-strip regex misses attribute-carrying
 * opening tags). Identical values from both hosts → identical envelopes
 * (fingerprint hashes the value).
 */
export function researchLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const parsed = parseResearchMarkdown(inner);
  if (!parsed || parsed.parsingStats.recognizedSections === 0) return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "research_report",
    // The parser defaults a missing level-1 header to "Research Analysis" —
    // the family's established display default; schema requires a title.
    title: parsed.title,
    // Required by the kind schema; may legitimately be empty when the region
    // carried no findings section.
    sections: parsed.sections.map(mapSection),
  };

  setIfMeaningful(value, "overview", parsed.overview);
  setIfMeaningful(value, "researchScope", parsed.researchScope ?? "");
  setIfMeaningful(value, "keyFocusAreas", parsed.keyFocusAreas ?? "");
  setIfMeaningful(value, "analysisPeriod", parsed.analysisPeriod ?? "");
  setIfMeaningful(value, "executiveSummary", parsed.executiveSummary ?? "");
  setIfMeaningful(value, "introduction", parsed.introduction);
  if (parsed.researchQuestions.length > 0) {
    value.researchQuestions = parsed.researchQuestions;
  }
  setIfMeaningful(value, "conclusion", parsed.conclusion);
  if (parsed.keyTakeaways.length > 0) value.keyTakeaways = parsed.keyTakeaways;

  if (parsed.methodology) {
    const methodology: Record<string, unknown> = {};
    setIfMeaningful(methodology, "searchStrategy", parsed.methodology.searchStrategy);
    setIfMeaningful(methodology, "selectionCriteria", parsed.methodology.selectionCriteria);
    setIfMeaningful(methodology, "analysisFramework", parsed.methodology.analysisFramework);
    if (Object.keys(methodology).length > 0) value.methodology = methodology;
  }

  // DELIBERATELY never emitted here (the parser cannot produce them from
  // XML): convergentThemes, conflictingEvidence, shortTermOutlook,
  // mediumTermOutlook, longTermVision, challenges, recommendations,
  // limitations, sourceQuality, metadata. The JSON path owns those fields.

  return value;
}
