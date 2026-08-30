import { buildRowAgentInput, buildViewAgentInput } from "@/components/official/matrx-data-table/tableCopy";
import type { UnwiredFinding, UnwiredReport } from "@/scripts/unwired/types";
import { buildUnwiredCopyConfig } from "./copy";

const FINDING: UnwiredFinding = {
  repository: "matrx-frontend",
  detector: "react-component-unmounted",
  file: "features/example/UnusedPanel.tsx",
  line: 12,
  column: 1,
  symbol: "UnusedPanel",
  lines: 88,
  title: "Unused panel",
  evidence: "No JSX mounter found",
  intent: "Show the example panel",
  remains: "Mount it from the canonical host",
  feature: "example",
};

const REPORT: UnwiredReport = {
  generatedAt: "2026-08-20T00:00:00.000Z",
  commit: "abc",
  aidreamCommit: "def",
  totals: {
    findings: 9,
    lines: 420,
    filesWithFindings: 7,
    filesScanned: 100,
    suppressed: 0,
    byDetector: {
      "react-component-unmounted": 4,
      "export-unimported": 1,
      "router-unmounted": 1,
      "host-installer-unset": 1,
      "scheduler-handler-unregistered": 1,
      "python-module-unreached": 1,
    },
    byRepository: { "matrx-frontend": 6, aidream: 3 },
  },
  partial: ["aidream scan unavailable"],
  worstFiles: [],
  findings: [FINDING],
  allowlist: [],
};

describe("Unwired copy config", () => {
  const config = buildUnwiredCopyConfig({
    report: REPORT,
    prior: {
      generatedAt: "2026-08-19T00:00:00.000Z",
      commit: "older",
      findings: 8,
      lines: 400,
      filesWithFindings: 6,
    },
    problems: ["Snapshot schema mismatch"],
    scanAge: 10,
  });

  it("copies the rendered row plus leading KPIs and exact coverage warnings", () => {
    expect(buildRowAgentInput(config, FINDING)).toMatchObject({
      data: {
        source: "features/example/UnusedPanel.tsx:12",
        unfinished_wiring: "React components with no JSX mounter",
        artifact: "UnusedPanel",
        size: "88 lines",
        what_remains: "Mount it from the canonical host",
        page_context: {
          findings: 9,
          implicated_lines: 420,
          files: 7,
          frontend: 6,
          ai_dream: 3,
          since_prior_scan: "+20 lines",
          coverage_status: "This snapshot cannot be read as proof of complete coverage.",
          coverage_warnings: [
            "Snapshot schema mismatch",
            "Partial scan: aidream scan unavailable",
            "Snapshot is 10 days old. Refresh it with pnpm check:unwired:write.",
          ],
        },
      },
      attributes: {
        findings: 9,
        implicated_lines: 420,
        files: 7,
        frontend: 6,
        ai_dream: 3,
      },
    });
  });

  it("keeps coverage context when the current view has no rows", () => {
    expect(buildViewAgentInput(config, [], REPORT.findings)).toMatchObject({
      data: [],
      attributes: {
        visible_count: 0,
        total_count: 1,
        findings: 9,
      },
      context: {
        scan_age_days: 10,
        coverage_status: "This snapshot cannot be read as proof of complete coverage.",
      },
    });
  });

  it("folds the finish brief into the row AI variants", async () => {
    const variants = config.rowAiVariants?.(FINDING) ?? [];
    expect(variants.map((variant) => variant.label)).toEqual([
      "Finish-the-wiring brief",
    ]);
    expect(await variants[0]?.build?.()).toContain(
      "Finish this purpose-built but unwired artifact",
    );
  });
});
