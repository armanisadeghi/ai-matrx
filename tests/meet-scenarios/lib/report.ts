/**
 * The readable report: one row per scenario — state id, browser, PASS / FAIL / ENV, seconds,
 * observation source, and the first line of evidence (the failed expectation, which already
 * carries what the person saw). Written to THIS run's own directory
 * (.cache/meet-scenarios/runs/<run-id>/report.md + report.json), so concurrent runs never collide.
 *
 * Classification (one rule, no regex over error text):
 *   PASS — the scenario's expectations held.
 *   ENV  — it failed AND this run's evidence proves the environment struck after the scenario's
 *          last progress and within ENV_WINDOW_MS of the failure: a walk-cap park, or the dev server failing to serve (HTTP 5xx on a page, chunk
 *          or the sign-in door) or showing a compile error. Recorded by lib/actor.ts as it happens.
 *   FAIL — every other failure: a product timeout, a hung page, a crashed page, the app's error page.
 *
 * The done-oracle line is COMPUTED from each row's recorded levers (browser + version, launch args,
 * fake devices, init scripts, permission overrides, proxy) and observation sources — never a string.
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { P0_IDS } from "./catalog";
import { baseURL, REPO_ROOT, runDir, runId } from "./env";

const ENV_WINDOW_MS = 3 * 60_000;

function meetVersion(): string {
  try {
    return (JSON.parse(readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/meet/package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

interface Evidence {
  envEvents: { at: number; what: string; who: string }[];
  levers: { who: string; seat: string; levers: string[] }[];
  sources: Record<string, number>;
  progressAt?: number;
}

interface Row {
  id: string;
  project: string;
  status: string;
  seconds: number;
  evidence: string;
  envProof: string;
  sources: string;
  levers: string[];
  annotations: string[];
  timeline: string;
}

function firstEvidence(result: TestResult): string {
  const err = result.errors[0] ?? result.error;
  if (!err) return "";
  const msg = (err.message ?? String(err.value ?? "")).replace(/\u001b\[[0-9;]*m/g, "");
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lines[0] ?? "").replace(/\|/g, "/").slice(0, 400);
}

export default class MeetReport implements Reporter {
  private rows: Row[] = [];
  private missing: string[] = [];

  /** The catalog is the spec: every P0 state must have exactly one scenario. */
  onBegin(_config: FullConfig, suite: Suite): void {
    const titles = new Set(suite.allTests().map((t) => t.title));
    this.missing = P0_IDS.filter((id) => !titles.has(id));
    console.log(`meet scenarios run ${runId()} -> ${runDir()}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const att = (name: string) => result.attachments.find((a) => a.name === name)?.body?.toString("utf8") ?? "";
    let ev: Evidence = { envEvents: [], levers: [], sources: {} };
    try {
      ev = { ...ev, ...(JSON.parse(att("evidence") || "{}") as Partial<Evidence>) };
    } catch {
      /* no evidence attachment (the fixture never ran) */
    }
    const end = result.startTime.getTime() + result.duration;
    // The environment explains a failure only if it struck AFTER the scenario's last progress
    // (it stopped the walk); a park the run recovered from and moved past proves nothing.
    const proof = ev.envEvents.filter((e) => end - e.at <= ENV_WINDOW_MS && e.at <= end + 5000 && e.at >= (ev.progressAt ?? 0));
    const status =
      result.status === "passed" ? "PASS" : result.status === "skipped" ? "SKIP" : proof.length > 0 ? "ENV" : "FAIL";
    const annotations = [...test.annotations, ...((result as { annotations?: { type: string; description?: string }[] }).annotations ?? [])]
      .filter((a) => a.type === "cleanup" || a.type === "persona")
      .map((a) => `${a.type}: ${a.description ?? ""}`);
    this.rows.push({
      id: test.title,
      project: test.parent.project()?.name ?? "",
      status,
      seconds: Math.round(result.duration / 1000),
      evidence: firstEvidence(result),
      envProof: proof.map((e) => `${new Date(e.at).toISOString().slice(11, 19)} [${e.who}] ${e.what}`).join("; "),
      sources: Object.entries(ev.sources).map(([k, v]) => `${k}:${v}`).join(" ") || "none",
      levers: [...new Set(ev.levers.flatMap((l) => l.levers.map((x) => `${l.who}: ${x}`)))],
      annotations: [...new Set(annotations)],
      timeline: att("timeline"),
    });
  }

  onEnd(result: FullResult): void {
    const dir = runDir();
    mkdirSync(dir, { recursive: true });
    this.rows.sort((a, b) => a.id.localeCompare(b.id) || a.project.localeCompare(b.project));
    const count = (s: string) => this.rows.filter((r) => r.status === s).length;
    const allLevers = new Set(this.rows.flatMap((r) => r.levers.map((l) => l.split(": ").slice(1).join(": "))));
    const browsers = [...allLevers].filter((l) => l.startsWith("browser ") && !l.startsWith("browser permission"));
    const initScripts = [...allLevers].filter((l) => l.startsWith("init script"));
    const fakes = [...allLevers].filter((l) => l.startsWith("fake "));
    const perms = [...allLevers].filter((l) => l.startsWith("permission") || l.startsWith("browser permission"));
    const sourceRows = (s: string) => this.rows.filter((r) => r.sources.includes(`${s}:`)).length;
    const oracle = [
      `Run \`${runId()}\` — real browsers (${browsers.join("; ") || "none launched"}), the shared dev server ${baseURL()}, real LiveKit Cloud, @ai-matrx/meet ${meetVersion()}.`,
      `Observation source: contract in ${sourceRows("contract")} of ${this.rows.length} rows, visible-text fallback in ${sourceRows("fallback")} (per row below).`,
      `Fake devices: ${fakes.join("; ") || "none"}. Init scripts: ${initScripts.length ? initScripts.join("; ") : "none"}. Permission overrides: ${perms.join("; ") || "none"}.`,
      "Not used by the harness: a fake meeting driver, jsdom, a test-only build, a harness-only product flag (it sets none: no product env, cookie or query flag).",
    ];
    const table = [
      `# Meet state scenarios — ${new Date().toISOString()} — ${count("PASS")} pass, ${count("FAIL")} fail, ${count("ENV")} environment (${result.status})`,
      "",
      `P0 states in catalog: ${P0_IDS.length}; with no scenario in this run: ${this.missing.length ? this.missing.join(", ") : "none"}`,
      "",
      ...oracle.map((l) => `- ${l}`),
      "",
      "| State | Browser | Result | s | Source | Evidence |",
      "|---|---|---|---|---|---|",
      ...this.rows.map((r) => `| ${r.id} | ${r.project} | ${r.status} | ${r.seconds} | ${r.sources} | ${r.status === "ENV" ? `ENV proof: ${r.envProof}. ` : ""}${r.evidence || "-"} |`),
      "",
      "## Timelines",
      ...this.rows.flatMap((r) => [
        "",
        `### ${r.id} (${r.project}) ${r.status}`,
        ...r.annotations,
        `levers: ${r.levers.join(" · ")}`,
        "```",
        r.timeline,
        "```",
      ]),
    ].join("\n");
    writeFileSync(path.join(dir, "report.md"), table);
    writeFileSync(path.join(dir, "report.json"), JSON.stringify({ run: runId(), rows: this.rows }, null, 2));
    console.log(`\n${table.split("## Timelines")[0]}\nfull report: ${path.join(dir, "report.md")}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
