/**
 * The readable report: one row per scenario — state id, browser, PASS/FAIL,
 * seconds, and the first line of evidence (the failed expectation, which
 * already carries what the person saw). Written to .cache/meet-scenarios/
 * report.md + report.json and printed at the end of the run.
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { P0_IDS } from "./catalog";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Row {
  id: string;
  project: string;
  status: string;
  seconds: number;
  evidence: string;
  cleanup: string;
  timeline: string;
}

function firstEvidence(result: TestResult): string {
  const err = result.errors[0] ?? result.error;
  if (!err) return "";
  const msg = (err.message ?? String(err.value ?? "")).replace(/\u001b\[[0-9;]*m/g, "");
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  const head = lines[0] ?? "";
  return head.replace(/\|/g, "/").slice(0, 400);
}

export default class MeetReport implements Reporter {
  private rows: Row[] = [];
  private missing: string[] = [];

  /** The catalog is the spec: every P0 state must have exactly one scenario. */
  onBegin(_config: FullConfig, suite: Suite): void {
    const titles = new Set(suite.allTests().map((t) => t.title));
    this.missing = P0_IDS.filter((id) => !titles.has(id));
    if (this.missing.length > 0 && !process.argv.some((a) => a === "-g" || a.startsWith("--grep"))) {
      console.log(`P0 states with NO scenario: ${this.missing.join(", ")}`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const timeline = result.attachments.find((a) => a.name === "timeline");
    this.rows.push({
      id: test.title,
      project: test.parent.project()?.name ?? "",
      status:
        result.status === "passed"
          ? "PASS"
          : result.status === "skipped"
            ? "SKIP"
            : /page\.goto|net::ERR|chrome-error|ERR_HTTP_RESPONSE_CODE_FAILURE|__dev-walk|evicted preview|Resume this preview/.test(firstEvidence(result))
              ? "ENV"
              : "FAIL",
      seconds: Math.round(result.duration / 1000),
      evidence: firstEvidence(result),
      cleanup: test.annotations.find((a) => a.type === "cleanup")?.description ?? "",
      timeline: timeline?.body ? timeline.body.toString("utf8") : "",
    });
  }

  onEnd(result: FullResult): void {
    const dir = path.resolve(__dirname, "..", "..", "..", ".cache", "meet-scenarios");
    mkdirSync(dir, { recursive: true });
    this.rows.sort((a, b) => a.id.localeCompare(b.id) || a.project.localeCompare(b.project));
    const pass = this.rows.filter((r) => r.status === "PASS").length;
    const fail = this.rows.filter((r) => r.status === "FAIL").length;
    const env = this.rows.filter((r) => r.status === "ENV").length;
    const table = [
      `# Meet state scenarios — ${new Date().toISOString()} — ${pass} pass, ${fail} fail, ${env} environment (${result.status})`,
      "",
      `P0 states in catalog: ${P0_IDS.length}; with no scenario in this run: ${this.missing.length ? this.missing.join(", ") : "none"}`,
      "",
      "| State | Browser | Result | s | Evidence |",
      "|---|---|---|---|---|",
      ...this.rows.map((r) => `| ${r.id} | ${r.project} | ${r.status} | ${r.seconds} | ${r.evidence || "-"} |`),
      "",
      "## Timelines",
      ...this.rows.flatMap((r) => ["", `### ${r.id} (${r.project}) ${r.status}`, r.cleanup ? `cleanup: ${r.cleanup}` : "", "```", r.timeline, "```"]),
    ].join("\n");
    writeFileSync(path.join(dir, "report.md"), table);
    writeFileSync(path.join(dir, "report.json"), JSON.stringify(this.rows, null, 2));
    console.log(`\n${table.split("## Timelines")[0]}\nfull report: ${path.join(dir, "report.md")}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
