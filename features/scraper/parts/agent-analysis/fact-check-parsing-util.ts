/**
 * Reads the `scraper.fact_check` agent's answer into the Fact Check tab's parts.
 *
 * THE CONTRACT (agent rebuilt 2026-09): exactly three Markdown sections —
 *   `## Fact-check verdict`  → the Summary tab
 *   `## Facts & Citations`   → the Claims tab's fallback (see below)
 *   `## Warning`             → the Warning tab
 * plus ONE fenced ```json block holding a `fact_check_report` kind
 * ({ __kind, verdict, summary, claims[], warning }). The kind is the
 * structured truth: the Claims tab renders it through its registered kind
 * component, and the stat row counts its claims per status.
 *
 * 🚨 THE ARTIFACT FIRST (ruling 2026-09-29). The report is taken from the
 * platform's EXTRACTED object for the run (`selectFirstExtractedObject`),
 * never by re-parsing a string: the answer text a run resolves with has the
 * fenced block already lifted into a structured block, so the string does not
 * carry it. Parsing the fence out of the text is the ANNOUNCED fallback only —
 * `reportSource: "answer_text"` — for a run with no artifact.
 *
 * The retired agent's headings (FACT CHECK SUMMARY … OVERALL RATING n/10) are
 * gone from this file on purpose — no second format is read.
 */

import type { FactCheckReport } from "@/features/content-ir/kinds/generated/kinds.generated";

export type FactCheckVerdict = FactCheckReport["verdict"];
export type FactCheckClaimStatus = FactCheckReport["claims"][number]["status"];

export const FACT_CHECK_VERDICTS: readonly FactCheckVerdict[] = [
  "safe",
  "risky",
  "blocked_by_claims",
];

export const FACT_CHECK_STATUSES: readonly FactCheckClaimStatus[] = [
  "verified",
  "disputed",
  "unverifiable",
  "missing_source",
];

export type FactCheckStatusCounts = Record<FactCheckClaimStatus, number>;

export interface ParsedFactCheck {
  /** Body of `## Fact-check verdict`. */
  summary: string;
  /** Body of `## Facts & Citations`. */
  factsAndCitations: string;
  /** Body of `## Warning`, with the trailing JSON block removed. */
  warning: string;
  /** The `fact_check_report` kind, `__kind` intact — null when neither source has it. */
  report: FactCheckReport | null;
  /** Where `report` came from: the run's extracted artifact, the text fallback, or nowhere. */
  reportSource: "artifact" | "answer_text" | null;
  /** From the kind; else from the `Verdict:` line of the verdict section; else null. */
  verdict: FactCheckVerdict | null;
  /** Claims per status, from the kind — null when the kind is absent. */
  statusCounts: FactCheckStatusCounts | null;
}

const FENCED_JSON = /```json[^\n]*\n([\s\S]*?)```/gi;

/** Heading text → comparison key ("Facts & Citations" → "factscitations"). */
function headingKey(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z]/g, "");
}

const SECTION_KEYS = {
  verdict: "factcheckverdict",
  facts: "factscitations",
  warning: "warning",
} as const;

/** Every `## ` section of the answer, keyed by its normalized heading. */
function splitSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const text = content.replace(/\r\n/g, "\n");
  const headings = [...text.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)];
  headings.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[i + 1]?.index ?? text.length;
    const key = headingKey(match[1]);
    if (!sections.has(key)) sections.set(key, text.slice(start, end));
  });
  return sections;
}

/** Trim, and drop the `---` rules the agent puts between sections. */
function cleanSection(body: string | undefined): string {
  if (!body) return "";
  return body
    .trim()
    .replace(/^(?:-{3,}\s*)+/, "")
    .replace(/(?:\s*-{3,})+$/, "")
    .trim();
}

function isReport(value: unknown): value is FactCheckReport {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.__kind === "fact_check_report" &&
    typeof v.verdict === "string" &&
    (FACT_CHECK_VERDICTS as readonly string[]).includes(v.verdict) &&
    Array.isArray(v.claims)
  );
}

/** The first fenced JSON block that parses to a `fact_check_report`. */
export function extractFactCheckReport(content: string): FactCheckReport | null {
  for (const match of content.matchAll(FENCED_JSON)) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (isReport(parsed)) return parsed;
    } catch {
      // A block that does not parse is not the report; keep looking.
    }
  }
  return null;
}

/** `**Verdict: BLOCKED BY CLAIMS**` → "blocked_by_claims". */
function verdictFromLine(summary: string): FactCheckVerdict | null {
  const line = summary.match(/verdict\s*[:\-–—]\s*\**\s*([a-z _-]+)/i);
  if (!line) return null;
  const key = line[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (FACT_CHECK_VERDICTS as readonly string[]).includes(key)
    ? (key as FactCheckVerdict)
    : null;
}

function countStatuses(report: FactCheckReport): FactCheckStatusCounts {
  const counts: FactCheckStatusCounts = {
    verified: 0,
    disputed: 0,
    unverifiable: 0,
    missing_source: 0,
  };
  for (const claim of report.claims) {
    if (claim && claim.status in counts) counts[claim.status] += 1;
  }
  return counts;
}

/**
 * @param content  the answer prose — the three sections come from here.
 * @param artifact the run's extracted structured object, when the platform
 *                 produced one; used whenever it is a `fact_check_report`.
 */
export function parseFactCheck(
  content: string,
  artifact?: unknown,
): ParsedFactCheck {
  const sections = splitSections(content);
  const fromArtifact = isReport(artifact) ? artifact : null;
  const fromText = fromArtifact ? null : extractFactCheckReport(content);
  const report = fromArtifact ?? fromText;
  const reportSource = fromArtifact ? "artifact" : fromText ? "answer_text" : null;
  const summary = cleanSection(sections.get(SECTION_KEYS.verdict));
  const warning = cleanSection(
    sections.get(SECTION_KEYS.warning)?.replace(FENCED_JSON, ""),
  );
  return {
    summary,
    factsAndCitations: cleanSection(sections.get(SECTION_KEYS.facts)),
    warning,
    report,
    reportSource,
    verdict: report?.verdict ?? verdictFromLine(summary),
    statusCounts: report ? countStatuses(report) : null,
  };
}

/** Words a person reads — never the snake_case wire value. */
export const VERDICT_LABEL: Record<FactCheckVerdict, string> = {
  safe: "Safe",
  risky: "Risky",
  blocked_by_claims: "Blocked by claims",
};

export const STATUS_LABEL: Record<FactCheckClaimStatus, string> = {
  verified: "Verified",
  disputed: "Disputed",
  unverifiable: "Unverifiable",
  missing_source: "Missing source",
};

/** The fenced block the canonical markdown pipeline routes to the kind component. */
export function reportAsKindBlock(report: FactCheckReport): string {
  return "```json\n" + JSON.stringify(report, null, 2) + "\n```";
}
