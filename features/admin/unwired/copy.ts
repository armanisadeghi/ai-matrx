import type { MatrxDataTableCopyConfig } from "@/components/official/matrx-data-table/types";
import {
  DETECTOR_TITLES,
  type UnwiredFinding,
  type UnwiredHistoryPoint,
  type UnwiredReport,
} from "@/scripts/unwired/types";
import { finishWiringPrompt } from "./fix-prompt";

export interface UnwiredCopyContext {
  report: UnwiredReport;
  prior: UnwiredHistoryPoint | null;
  problems: string[];
  scanAge: number | null;
}

export const UNWIRED_STALE_AFTER_DAYS = 7;

/** The finding as readable text — shared by the rendered row and copy paths. */
export function unwiredFindingContent(finding: UnwiredFinding): string {
  return [
    `${finding.file}:${finding.line} (${finding.repository})`,
    `Detector: ${DETECTOR_TITLES[finding.detector]}`,
    `Artifact: ${finding.symbol}`,
    `Size: ${finding.lines.toLocaleString()} lines`,
    `What remains: ${finding.remains}`,
  ].join("\n");
}

function sincePriorScan(
  report: UnwiredReport,
  prior: UnwiredHistoryPoint | null,
): string {
  if (!prior) return "First snapshot";
  const delta = report.totals.lines - prior.lines;
  return `${delta >= 0 ? "+" : ""}${delta.toLocaleString()} lines`;
}

function coverageWarnings({
  report,
  problems,
  scanAge,
}: UnwiredCopyContext): string[] {
  return [
    ...problems,
    ...report.partial.map((note) => `Partial scan: ${note}`),
    ...(scanAge !== null && scanAge > UNWIRED_STALE_AFTER_DAYS
      ? [
          `Snapshot is ${scanAge} days old. Refresh it with pnpm check:unwired:write.`,
        ]
      : []),
  ];
}

function pageContext(input: UnwiredCopyContext) {
  const { report, prior, scanAge } = input;
  const warnings = coverageWarnings(input);
  return {
    findings: report.totals.findings,
    implicated_lines: report.totals.lines,
    files: report.totals.filesWithFindings,
    frontend: report.totals.byRepository["matrx-frontend"],
    ai_dream: report.totals.byRepository.aidream,
    since_prior_scan: sincePriorScan(report, prior),
    generated_at: report.generatedAt,
    scan_age_days: scanAge,
    coverage_status:
      warnings.length > 0
        ? "This snapshot cannot be read as proof of complete coverage."
        : "No coverage warnings are currently shown.",
    coverage_warnings: warnings,
  };
}

export function buildUnwiredCopyConfig(
  input: UnwiredCopyContext,
): MatrxDataTableCopyConfig<UnwiredFinding> {
  const context = pageContext(input);
  const sharedAttributes = {
    findings: context.findings,
    implicated_lines: context.implicated_lines,
    files: context.files,
    frontend: context.frontend,
    ai_dream: context.ai_dream,
    since_prior_scan: context.since_prior_scan,
    coverage_status: context.coverage_status,
  };

  return {
    label: "Unwired finding",
    listLabel: "Unwired findings",
    location: "AI Matrx Admin — Unwired work (/administration/reporting/unwired)",
    rowKind: "unwired-finding",
    listKind: "unwired-findings",
    rowDescription: "One rendered unfinished-wiring finding and its page context.",
    listDescription: "The current filtered and sorted unfinished-wiring view.",
    humanRow: unwiredFindingContent,
    agentRow: (finding) => ({
      source: `${finding.file}:${finding.line}`,
      repository: finding.repository,
      unfinished_wiring: DETECTOR_TITLES[finding.detector],
      artifact: finding.symbol,
      size: `${finding.lines.toLocaleString()} lines`,
      what_remains: finding.remains,
      page_context: context,
    }),
    rowAttributes: (finding) => ({
      repository: finding.repository,
      detector: finding.detector,
      artifact: finding.symbol,
      implicated_lines_for_finding: finding.lines,
      ...sharedAttributes,
    }),
    listAttributes: () => sharedAttributes,
    listContext: () => ({
      generated_at: context.generated_at,
      scan_age_days: context.scan_age_days,
      coverage_status: context.coverage_status,
      coverage_warnings: context.coverage_warnings.join(" | ") || undefined,
    }),
    rowAiVariants: (finding) => [
      {
        id: "finish-wiring-brief",
        label: "Finish-the-wiring brief",
        hint: "Paste-ready instructions for finishing this artifact",
        build: () => finishWiringPrompt(finding),
      },
    ],
  };
}
