/**
 * The readable report: one row per scenario — state id, browser, PASS / FAIL / ENV, time taken,
 * observation source, and the first line of evidence (the failed expectation, which already
 * carries what the person saw). Written to THIS run's own directory
 * (.cache/meet-scenarios/runs/<run-id>/report.md + report.json), so concurrent runs never collide.
 *
 * Classification (one rule, no regex over error text):
 *   PASS — the scenario's expectations held.
 *   UNPROVEN — the scenario itself declared its product verdict cannot be produced (its precondition
 *          is unreachable; thrown with the "UNPROVEN:" prefix). Neither pass nor fail; the reason is the evidence.
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
import { formatDurationMs } from "@ai-matrx/kit/format";
import { expectedIds } from "./catalog";
import { SKINS } from "./skins";
import { baseURL, meetServer, PROD_API_ORIGIN, REPO_ROOT, runDir, runId, UNPROVEN_PREFIX, ENV_SETUP_PREFIX } from "./env";

const ENV_WINDOW_MS = 3 * 60_000;

function meetVersion(): string {
  try {
    return (JSON.parse(readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/meet/package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

interface Loaded { who: string; scripts: number; driverLike: string[]; dev: boolean; prod: boolean; queryDocs: string[] }

interface Evidence {
  skin?: string;
  loaded?: Loaded[];
  envEvents: { at: number; what: string; who: string; fatal?: boolean }[];
  levers: { who: string; seat: string; levers: string[] }[];
  sources: Record<string, number>;
  progressAt?: number;
}

interface Row {
  id: string;
  project: string;
  status: string;
  durationMs: number;
  evidence: string;
  skin: string;
  loaded: Loaded[];
  envProof: string;
  sources: string;
  levers: string[];
  annotations: string[];
  cleanupFailures: string[];
  timeline: string;
}

function firstEvidence(result: TestResult): string {
  const err = result.errors[0] ?? result.error;
  if (!err) return "";
  const msg = (err.message ?? String(err.value ?? "")).replace(/\u001b\[[0-9;]*m/g, "");
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lines[0] ?? "").replace(/\|/g, "/").slice(0, 400);
}

/**
 * What the pages actually loaded, per run — never an asserted absence. Reports only what the
 * recorded evidence shows: script files loaded, any whose name looks like a test driver / jsdom /
 * mock, the build mode the served scripts reveal, and query strings on page loads.
 */
function loadedLine(rows: Row[]): string {
  const all = rows.flatMap((r) => r.loaded);
  if (all.length === 0) return "Page-load evidence: none recorded (no page was loaded), so nothing is claimed about drivers, build mode or flags.";
  const scripts = all.reduce((n, l) => n + l.scripts, 0);
  const driver = [...new Set(all.flatMap((l) => l.driverLike))];
  const dev = all.filter((l) => l.dev).length;
  const prod = all.filter((l) => l.prod).length;
  const queries = [...new Set(all.flatMap((l) => l.queryDocs))];
  const build = dev && !prod ? "development (dev-server scripts: HMR client / React development build)" : prod && !dev ? "production" : dev && prod ? "mixed signals" : "undetermined from the scripts served";
  return `Page-load evidence (${all.length} browser sessions, ${scripts} script loads from the app): test-driver/jsdom/mock-named scripts: ${driver.length ? driver.join(", ") : "none seen"}; build mode seen: ${build}; page loads carrying a query string: ${queries.length ? queries.join(", ") : "none"}. A real browser engine drove every page (browsers above); anything not listed here was not checked.`;
}

export default class MeetReport implements Reporter {
  private rows: Row[] = [];
  private missing: string[] = [];

  /** The catalog is the spec: every state in the run's set (MEET_SET) must have exactly one scenario. */
  onBegin(_config: FullConfig, suite: Suite): void {
    const titles = new Set(suite.allTests().map((t) => t.title));
    this.missing = expectedIds().filter((id) => !titles.has(id));
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
    const proof = ev.envEvents.filter((e) => end - e.at <= ENV_WINDOW_MS && e.at <= end + 5000 && e.at >= (ev.progressAt ?? 0))
      // A park that took a live call away makes the whole run environment, whenever it struck.
      .concat(ev.envEvents.filter((e) => e.fatal && !(end - e.at <= ENV_WINDOW_MS && e.at <= end + 5000 && e.at >= (ev.progressAt ?? 0))));
    const unprovenReason = firstEvidence(result).startsWith(UNPROVEN_PREFIX);
    const setupFailed = result.status !== "passed" && firstEvidence(result).includes(ENV_SETUP_PREFIX);
    const status =
      result.status === "passed" ? "PASS" : result.status === "skipped" ? "SKIP" : proof.length > 0 || setupFailed ? "ENV" : unprovenReason ? "UNPROVEN" : "FAIL";
    const annotations = [...test.annotations, ...((result as { annotations?: { type: string; description?: string }[] }).annotations ?? [])]
      .filter((a) => a.type === "cleanup" || a.type === "cleanup-failure" || a.type === "persona")
      .map((a) => `${a.type}: ${a.description ?? ""}`);
    this.rows.push({
      id: test.title,
      project: test.parent.project()?.name ?? "",
      status,
      durationMs: result.duration,
      evidence: firstEvidence(result),
      skin: ev.skin ?? (test.parent.project()?.metadata as { skin?: string } | undefined)?.skin ?? "meet",
      loaded: ev.loaded ?? [],
      envProof: setupFailed ? "run-start check: the test host's profile is not the default" : proof.map((e) => `${new Date(e.at).toISOString().slice(11, 19)} [${e.who}] ${e.what}`).join("; "),
      sources: Object.entries(ev.sources).map(([k, v]) => `${k}:${v}`).join(" ") || "none",
      levers: [...new Set(ev.levers.flatMap((l) => l.levers.map((x) => `${l.who}: ${x}`)))],
      annotations: [...new Set(annotations)],
      cleanupFailures: annotations.filter((a) => a.startsWith("cleanup-failure:")),
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
    const srv = meetServer();
    const oracle = [
      srv.mode === "local"
        ? `API SERVER: LOCAL aidream ${srv.origin} running git ${srv.sha} (NOT production; browser calls to ${PROD_API_ORIGIN} were routed there; LiveKit webhooks and deadline jobs still fired against PRODUCTION). Not production proof.`
        : `API SERVER: PRODUCTION ${PROD_API_ORIGIN} (whatever is deployed).`,
      `Run \`${runId()}\` — real browsers (${browsers.join("; ") || "none launched"}), the shared dev server ${baseURL()}, real LiveKit Cloud, @ai-matrx/meet ${meetVersion()}.`,
      `Observation source: contract in ${sourceRows("contract")} of ${this.rows.length} rows, visible-text fallback in ${sourceRows("fallback")} (per row below).`,
      `Fake devices: ${fakes.join("; ") || "none"}. Init scripts: ${initScripts.length ? initScripts.join("; ") : "none"}. Permission overrides: ${perms.join("; ") || "none"}.`,
      loadedLine(this.rows),
    ];
    const table = [
      `# Meet state scenarios — ${new Date().toISOString()} — ${count("PASS")} pass, ${count("FAIL")} fail, ${count("UNPROVEN")} unproven (no product verdict), ${count("ENV")} environment (${result.status})${this.rows.some((r) => r.cleanupFailures.length) ? ` — ${this.rows.reduce((n, r) => n + r.cleanupFailures.length, 0)} CLEANUP FAILURE(S)` : ""}`,
      "",
      `States expected (MEET_SET=${process.env.MEET_SET || "all"}): ${expectedIds().length}; with no scenario in this run: ${this.missing.length ? this.missing.join(", ") : "none"}; skins run: ${[...new Set(this.rows.map((r) => r.skin))].join(", ") || "none"} (registered: ${Object.keys(SKINS).join(", ")})`,
      "",
      ...oracle.map((l) => `- ${l}`),
      "",
      "| State | Skin | Browser | Result | Took | Source | Evidence |",
      "|---|---|---|---|---|---|---|",
      ...this.rows.map((r) => `| ${r.id} | ${r.skin} | ${r.project} | ${r.status} | ${formatDurationMs(r.durationMs, { style: "compact" })} | ${r.sources} | ${r.status === "ENV" ? `ENV proof: ${r.envProof}. ` : ""}${r.evidence || "-"} |`),
      "",
      ...(this.rows.some((r) => r.cleanupFailures.length)
        ? ["## CLEANUP FAILURES (meetings this run left open)", ...this.rows.flatMap((r) => r.cleanupFailures.map((f) => `- ${r.id} (${r.project}): ${f}`)), ""]
        : []),
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
