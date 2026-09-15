#!/usr/bin/env tsx
/**
 * A CLOSE ALWAYS CLOSES — guard for durable-run dialogs.
 *
 * THE BUG (live, 2026-09-15, Masterwork Rulebook): four ingest dialogs each
 * wrote `onOpenChange={(next) => { if (running) return; ... }}`. Radix routes
 * the X button, Escape and an outside click all through `onOpenChange`, so one
 * line made every exit inert — and `running` is true for `"rejoining"` too,
 * which is precisely the state of a user staring at "Lost the live view …
 * Reconnecting…". A real non-technical user could not close the dialog at all,
 * across a full page reload. A control that looks live and does nothing is the
 * defect: a screen is absent or honest, never dead.
 *
 * The guard also protected nothing — a durable run is server-owned, and
 * closing its dialog never stopped it.
 *
 * THE RULE: in any file that drives a durable run, an `onOpenChange` handler
 * may not early-return on a running/pending/busy/in-flight condition. Closing
 * is `durableRunDialogOnOpenChange` (lib/durable-run/durableRunDialogClose.ts),
 * which always closes and says what happened to the run.
 *
 * Modes:
 *   pnpm check:durable-run-dialog-close             scan features/ + components/ + app/
 *   pnpm check:durable-run-dialog-close <paths...>  scan just those
 *   pnpm check:durable-run-dialog-close --self-test prove the guard can fail
 */
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(__dirname, "..");
const DEFAULT_ROOTS = ["app", "features", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git"]);

/** A file only matters here if it actually drives a durable run. */
const DURABLE_RUN_MARKERS = [
  "useDurableRun",
  "useMasterworkRun",
  "useSeoCommandRun",
  "useBuildRun",
  "useCheckupRun",
  "useTriageRun",
  "useCleanCorpusRun",
];

/** The shapes that swallow a close. */
const BLOCKING_CONDITION = /\b(running|busy|pending|inFlight|isRunning|submitting|uploading)\b/i;

type Finding = { file: string; line: number; snippet: string };

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
}

export function findBlockedCloses(file: string, text: string): Finding[] {
  if (!DURABLE_RUN_MARKERS.some((m) => text.includes(m))) return [];
  const findings: Finding[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/onOpenChange\s*=\s*\{?\s*\(/.test(lines[i])) continue;
    // Look at the handler body — a short window is enough for the early-return
    // shape, which is always the first statement.
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      const line = lines[j];
      if (/^\s*\}/.test(line)) break;
      const early = /^\s*if\s*\(([^)]*)\)\s*return\s*;?\s*$/.exec(line);
      if (early && BLOCKING_CONDITION.test(early[1])) {
        findings.push({
          file: relative(ROOT, file),
          line: j + 1,
          snippet: line.trim(),
        });
        break;
      }
    }
  }
  return findings;
}

function scan(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    findings.push(...findBlockedCloses(file, text));
  }
  return findings;
}

function selfTest(): never {
  const dir = mkdtempSync(join(tmpdir(), "durable-close-guard-"));
  const bad = join(dir, "Bad.tsx");
  writeFileSync(
    bad,
    [
      'import { useMasterworkRun } from "x";',
      "export function Bad({ open, onOpenChange, running, reset }: any) {",
      "  return (",
      "    <Dialog",
      "      open={open}",
      "      onOpenChange={(next) => {",
      "        if (running) return;",
      "        if (!next) reset();",
      "        onOpenChange(next);",
      "      }}",
      "    />",
      "  );",
      "}",
      "",
    ].join("\n"),
  );
  const good = join(dir, "Good.tsx");
  writeFileSync(
    good,
    [
      'import { useMasterworkRun } from "x";',
      'import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";',
      "export function Good({ open, onOpenChange, running, reset }: any) {",
      "  return (",
      "    <Dialog",
      "      open={open}",
      "      onOpenChange={durableRunDialogOnOpenChange({",
      "        running,",
      "        reset,",
      "        onOpenChange,",
      '        runLabel: "Reading your source",',
      "      })}",
      "    />",
      "  );",
      "}",
      "",
    ].join("\n"),
  );
  const badFindings = scan([bad]);
  const goodFindings = scan([good]);
  rmSync(dir, { recursive: true, force: true });

  const failures: string[] = [];
  if (badFindings.length !== 1) {
    failures.push(`expected the planted blocked close to be caught, got ${badFindings.length}`);
  }
  if (goodFindings.length !== 0) {
    failures.push(`expected the honest close to pass, got ${goodFindings.length}`);
  }
  if (failures.length) {
    console.error("check:durable-run-dialog-close --self-test FAILED");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "check:durable-run-dialog-close --self-test PASSED — the guard catches a planted `if (running) return;` and clears the honest handler.",
  );
  process.exit(0);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();

  const targets = args.filter((a) => !a.startsWith("--"));
  const files: string[] = [];
  for (const entry of targets.length ? targets : DEFAULT_ROOTS) {
    const full = resolve(ROOT, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, files);
    else if (full.endsWith(".tsx")) files.push(full);
  }

  const findings = scan(files);
  if (!findings.length) {
    console.log(
      `check:durable-run-dialog-close OK — ${files.length} .tsx files, every durable-run dialog can be closed.`,
    );
    return;
  }
  console.error(
    `check:durable-run-dialog-close FAILED — ${findings.length} dialog(s) swallow their own close while a run is in flight. The X, Escape and an outside click all route through onOpenChange, so this makes every exit dead while looking live.\n`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.snippet}`);
  console.error(
    "\nRemedy: onOpenChange={durableRunDialogOnOpenChange({ running, reset, onOpenChange, runLabel })} — it always closes and tells the user the run is still going on the server.",
  );
  process.exit(1);
}

main();
