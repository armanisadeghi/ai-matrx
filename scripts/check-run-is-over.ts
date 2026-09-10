#!/usr/bin/env npx tsx
/**
 * check:run-is-over — ONE predicate answers "is this workflow run over?"
 *
 * THE CLASS (2026-09-09). `TERMINAL_RUN_STATUSES` is GENERATED from the engine
 * and deliberately excludes `errored`: it answers the ENGINE's question
 * ("finished forever — no resume, no recovery"). A WATCHING surface has a
 * different question, and `errored` answers it the same way as `failed` — a run
 * the engine records as `errored` never moves again. A viewer that waits for
 * one of the three generated statuses waits forever: the clock keeps running,
 * no failure is explained, and nothing settles the screen.
 *
 * `TryMasterworkBox` shipped that defect. The census then found ~17 sibling
 * sites, each carrying its own `TERMINAL_RUN_STATUSES.has(s) || s === "errored"`
 * or a private `new Set(["completed", "failed", "cancelled", "errored"])`. Every
 * copy is a place the NEXT status the engine adds gets missed.
 *
 * The one expression is `runIsOver(status)` in
 * `features/workflow-runtime/types.ts`. This guard fails when a new hand-rolled
 * variant appears.
 *
 * Run:  pnpm check:run-is-over
 * Prove it can fail:  pnpm check:run-is-over:self-test
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Where the ONE predicate lives, and the generated set it wraps. */
const CANONICAL = "features/workflow-runtime/types.ts";
const GENERATED = "types/python-generated/workflow-events.ts";

/**
 * THE ENGINE ALLOWLIST — the only places allowed to ask the generated set.
 *
 * Each entry answers an ENGINE question, not a viewer question, and each is
 * pinned by its own test or comment. Adding a line here is a decision, not a
 * convenience: say which engine question the site asks.
 */
const ENGINE_SITES: Record<string, string> = {
  "features/workflow-runtime/components/run/run-controls.ts":
    "verb availability — Stop/Cancel stay ENABLED on an errored run (pinned by run-controls.test.ts)",
  "features/workflow-runtime/redux/workflow-runs.slice.ts":
    "row-vs-replay reconciliation — 'did the engine stamp a final status on the row?'",
  "features/workflow-runtime/redux/adopt-workflow-run.thunk.ts":
    "transport adoption — 'is there provably nothing left to follow?'",
};

interface Finding {
  file: string;
  line: number;
  reason: string;
}

/** Comments never whitelist and never trip the guard; offsets are preserved. */
function stripComments(text: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + " ".repeat(match.length - lead.length),
    );
}

function lineFor(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

/**
 * A private run-status terminal set: a Set/array literal that lists the run
 * statuses. Matched on the STATUS MEMBERS, not on a name — the four sites this
 * class was found in called it `TERMINAL`, `TERMINAL_STATUSES` and
 * `TERMINAL_RUN_STATUSES`, so a name test would have caught none of them.
 */
const PRIVATE_SET =
  /(?:new\s+Set\s*\(\s*)?\[[^\]]*["']completed["'][^\]]*["']failed["'][^\]]*["']cancelled["'][^\]]*\]/g;

/** The hand-rolled union, in either operand order and across line breaks. */
const HAND_ROLLED_OR = [
  /TERMINAL[A-Z_]*\s*\.\s*has\s*\([^)]*\)\s*\|\|\s*[\w.]+\s*===\s*["']errored["']/g,
  /[\w.]+\s*===\s*["']errored["']\s*\|\|\s*TERMINAL[A-Z_]*\s*\.\s*has\s*\(/g,
  // The spelled-out union, in ONE expression — `[^;]` keeps a separate
  // `const completed = status === "completed";` beside a `failed || errored ||
  // cancelled` outcome test (a different question) out of the net.
  /===\s*["']completed["'][^;]{0,160}?===\s*["']errored["']/g,
  /===\s*["']errored["'][^;]{0,160}?===\s*["']completed["']/g,
];

const GENERATED_SET = /\bTERMINAL_RUN_STATUSES\b/g;

/** A literal naming any of these is a status vocabulary, not a terminal set. */
const LIVE_STATUS = /["'](?:running|pending|interrupted|awaiting_input|paused|pausing|cancelling)["']/;

/**
 * Only files that actually deal with WORKFLOW RUN status are in scope — the
 * platform has other things with a `completed` status (outreach members, PR
 * story angles, headless agent runs) and they are a different vocabulary.
 */
const RUN_SCOPED =
  /(?:WorkflowRunStatus|selectRunStatus|workflow-runs\.selectors|workflow-events|runStatus|workflow-runtime)/;

function scan(file: string, raw: string): Finding[] {
  const code = stripComments(raw);
  const findings: Finding[] = [];
  const inScope = RUN_SCOPED.test(code);

  for (const match of code.matchAll(GENERATED_SET)) {
    if (ENGINE_SITES[file]) continue;
    findings.push({
      file,
      line: lineFor(code, match.index ?? 0),
      reason:
        "asks the GENERATED TERMINAL_RUN_STATUSES — it excludes `errored`. Use runIsOver(status)",
    });
    break;
  }

  if (!inScope) return findings;

  for (const match of code.matchAll(PRIVATE_SET)) {
    // A list that also names LIVE statuses is a status VOCABULARY (a filter
    // dropdown, a label map), not a terminal set — RunsList has one.
    if (LIVE_STATUS.test(match[0])) continue;
    findings.push({
      file,
      line: lineFor(code, match.index ?? 0),
      reason:
        "private run-status terminal set — delete it and import runIsOver(status)",
    });
    break;
  }

  for (const pattern of HAND_ROLLED_OR) {
    const match = pattern.exec(code);
    if (!match) continue;
    findings.push({
      file,
      line: lineFor(code, match.index),
      reason:
        "hand-rolled \"is this run over?\" union — that expression is runIsOver(status)",
    });
    break;
  }

  return findings;
}

function sourceFiles(): string[] {
  const out = execSync(
    "git ls-files --cached --others --exclude-standard '*.ts' '*.tsx'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => /^(app|components|features|hooks|lib|utils)\//.test(file))
    .filter((file) => file !== CANONICAL && file !== GENERATED)
    // A test may name the defect it guards against.
    .filter((file) => !/\.(test|spec)\.tsx?$/.test(file));
}

/** PROVE IT CAN FAIL — a guard you cannot demonstrate failing is not a guard. */
function selfTest(): void {
  const cases: Array<{ name: string; file: string; text: string; red: boolean }> = [
    {
      name: "hand-rolled union",
      file: "features/x/RunThing.tsx",
      red: true,
      text: `import { TERMINAL_RUN_STATUSES } from "../types";
const runStatus = useAppSelector(selectRunStatus(runId));
const over = runStatus !== null && (TERMINAL_RUN_STATUSES.has(runStatus) || runStatus === "errored");`,
    },
    {
      name: "private terminal set",
      file: "features/x/RunHero.tsx",
      red: true,
      text: `const runStatus = useAppSelector(selectRunStatus(runId));
const TERMINAL = new Set(["completed", "failed", "cancelled", "errored"]);
const terminal = runStatus !== null && TERMINAL.has(runStatus);`,
    },
    {
      name: "renamed private set (name test would miss it)",
      file: "features/x/Floating.tsx",
      red: true,
      text: `import type { WorkflowRunStatus } from "@/types/python-generated/workflow-events";
const OVER = ["completed", "failed", "cancelled", "errored"];`,
    },
    {
      name: "spelled-out union",
      file: "features/x/Marquee.tsx",
      red: true,
      text: `const runStatus: WorkflowRunStatus | null = props.status;
const terminal = runStatus === "completed" || runStatus === "failed" || runStatus === "errored" || runStatus === "cancelled";`,
    },
    {
      name: "a status FILTER vocabulary, not a terminal set",
      file: "features/workflow-runtime/discovery/components/RunsList.tsx",
      red: false,
      text: `const STATUS_FILTER_OPTIONS = ["running", "completed", "failed", "errored", "interrupted", "awaiting_input", "paused", "cancelled", "pending"].map((value) => ({ value, label: runStatusLabel(value) }));`,
    },
    {
      name: "an OUTCOME test beside a separate completed check",
      file: "features/workflow-runtime/bakeoff/sharp-2/RunOutcomeBanner.tsx",
      red: false,
      text: `const status = useAppSelector(selectRunStatus(runId));
const failed = status === "failed" || status === "errored" || status === "cancelled";
const completed = status === "completed";`,
    },
    {
      name: "the canonical call",
      file: "features/x/Good.tsx",
      red: false,
      text: `import { runIsOver } from "../types";
const runStatus = useAppSelector(selectRunStatus(runId));
const over = runIsOver(runStatus);`,
    },
    {
      name: "a comment describing the defect",
      file: "features/x/Commented.tsx",
      red: false,
      text: `import { runIsOver } from "../types";
// Not TERMINAL_RUN_STATUSES.has(s) || s === "errored" — that is runIsOver.
const runStatus = useAppSelector(selectRunStatus(runId));
const over = runIsOver(runStatus);`,
    },
    {
      name: "a different domain's terminal set",
      file: "features/crm/outreach-lists/types.ts",
      red: false,
      text: `export const TERMINAL_STATUSES: readonly MemberStatus[] = ["completed", "failed", "cancelled"];`,
    },
    {
      name: "an allowlisted engine site",
      file: "features/workflow-runtime/components/run/run-controls.ts",
      red: false,
      text: `import { TERMINAL_RUN_STATUSES } from "@/types/python-generated/workflow-events";
function isTerminal(status: WorkflowRunStatus | null) {
  return status !== null && TERMINAL_RUN_STATUSES.has(status);
}`,
    },
  ];

  let broken = false;
  for (const c of cases) {
    const got = scan(c.file, c.text).length > 0;
    const ok = got === c.red;
    if (!ok) broken = true;
    console.log(
      `  ${ok ? "✓" : "✗"} ${c.red ? "RED " : "GREEN"} expected — ${c.name}${ok ? "" : `  (got ${got ? "RED" : "GREEN"})`}`,
    );
  }
  if (broken) {
    console.error(
      "\n🚨 self-test FAILED — fix scripts/check-run-is-over.ts before trusting a green run.\n",
    );
    process.exit(1);
  }
  console.log(
    "\n✅ self-test: RED on the hand-rolled union, on a private terminal set under any\n" +
      "   name, and on the spelled-out four-way union; GREEN on runIsOver(), on a comment\n" +
      "   naming the defect, on another domain's statuses, and on an allowlisted engine site.",
  );
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const findings: Finding[] = [];
  for (const file of sourceFiles()) {
    findings.push(...scan(file, readFileSync(path.join(ROOT, file), "utf8")));
  }

  if (findings.length === 0) {
    console.log(
      "✅ ONE predicate holds: every run-watching surface asks runIsOver(status).",
    );
    console.log(
      `   ${Object.keys(ENGINE_SITES).length} allowlisted engine sites ask the generated set on purpose.`,
    );
    return;
  }

  console.error('\n🚨 HAND-ROLLED "IS THIS RUN OVER?" FOUND\n');
  for (const finding of findings) {
    console.error(`  ✗ ${finding.file}:${finding.line} — ${finding.reason}`);
  }
  console.error(
    "\nThe ONE expression is `runIsOver(status)` from\n" +
      "`features/workflow-runtime/types.ts`. Import it and delete the local copy.\n" +
      "The generated `TERMINAL_RUN_STATUSES` excludes `errored` because it answers the\n" +
      "ENGINE's question ('can this be resumed?'), not a viewer's ('may I stop\n" +
      "waiting?'). A surface that asks the generated set never settles an errored run.\n" +
      "\nIf your site genuinely asks the ENGINE's question, add it to ENGINE_SITES in\n" +
      "scripts/check-run-is-over.ts WITH the question it asks — not as a silencer.\n",
  );
  process.exit(1);
}

main();
