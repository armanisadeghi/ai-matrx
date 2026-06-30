#!/usr/bin/env tsx
/**
 * Strictness-wave BATCHER — pairs with wave-split.ts.
 *
 * wave-split.ts emits one task file PER source file (386 of them). That's too
 * granular to hand to agents. This batcher groups them into agent-sized units
 * so NO TWO AGENTS EVER TOUCH THE SAME FILE:
 *
 *   - Any file with > MAX_PER_BATCH errors becomes its OWN batch (one agent,
 *     one big file).
 *   - The remaining small files are bin-packed so each batch's combined error
 *     count is <= MAX_PER_BATCH.
 *
 * Reads  (produced by `pnpm wave:split <flag>`):
 *   type-errors/<flag>/_assignments.json   [{ idx, file, errors, task }]
 *   type-errors/<flag>.txt                  raw tsc output (for per-error lines)
 *
 * Writes (under type-errors/<flag>/batches/):
 *   batch-NNN.md     one self-contained, multi-file assignment per agent
 *   _index.md        human index of every batch + its files
 *   _batches.json    [{ batch, files: [{ file, errors }], totalErrors }]
 *
 * Usage:
 *   pnpm wave:batch strictNullChecks        # default MAX_PER_BATCH = 10
 *   pnpm wave:batch strictNullChecks 8      # custom cap
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOC_RE = /^(\S+?)\((\d+),(\d+)\):\s*error TS(\d+):\s*(.*)$/;

interface Assignment {
  idx: number;
  file: string;
  errors: number;
  task: string;
}

interface Batch {
  batch: number;
  files: { file: string; errors: number }[];
  totalErrors: number;
}

const FLAG_GUIDANCE: Record<string, { what: string; how: string[] }> = {
  strictNullChecks: {
    what: "`null` and `undefined` are no longer assignable to every type. Each error means a possibly-null/undefined value is used where a defined value is required.",
    how: [
      "Guard before use: `if (x) { ... }`, early-return, or optional chaining `x?.y`.",
      "Map Supabase `null` columns to `undefined` only when the target type wants `undefined` (e.g. `row.foo ?? undefined`); otherwise widen the target type to accept `null`.",
      "Only use `?? <fallback>` when the fallback is a correct default — never to paper over a genuine 'this should exist' bug (throw at the boundary instead).",
      "Do NOT use `!` non-null assertions or `as` / `as unknown as` casts to silence. Narrow honestly.",
    ],
  },
};

function flagGuidance(flag: string) {
  return (
    FLAG_GUIDANCE[flag] ?? {
      what: `Errors surfaced by enabling \`${flag}\`.`,
      how: [
        "Fix the underlying type issue properly — no `any`, `as`, `!`, or `@ts-*` comments.",
      ],
    }
  );
}

function parseByFile(raw: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const line of raw.split("\n")) {
    const m = LOC_RE.exec(line);
    if (!m) continue;
    const [, file, ln, col, code, msg] = m;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(`L${ln}:${col}  TS${code}  ${msg}`);
  }
  return byFile;
}

function packBatches(assignments: Assignment[], maxPer: number): Batch[] {
  const big = assignments.filter((a) => a.errors > maxPer);
  const small = assignments
    .filter((a) => a.errors <= maxPer)
    .sort((a, b) => b.errors - a.errors); // first-fit-decreasing

  const batches: Batch[] = [];

  // Each oversized file gets its own batch.
  for (const a of big) {
    batches.push({
      batch: 0,
      files: [{ file: a.file, errors: a.errors }],
      totalErrors: a.errors,
    });
  }

  // Bin-pack the rest (first-fit-decreasing) so each batch's total <= maxPer.
  const bins: Batch[] = [];
  for (const a of small) {
    let placed = false;
    for (const bin of bins) {
      if (bin.totalErrors + a.errors <= maxPer) {
        bin.files.push({ file: a.file, errors: a.errors });
        bin.totalErrors += a.errors;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({
        batch: 0,
        files: [{ file: a.file, errors: a.errors }],
        totalErrors: a.errors,
      });
    }
  }
  batches.push(...bins);

  // Renumber: big files first (most impactful), then packed bins.
  batches.forEach((b, i) => (b.batch = i + 1));
  return batches;
}

function batchMarkdown(
  flag: string,
  b: Batch,
  byFile: Map<string, string[]>,
): string {
  const g = flagGuidance(flag);
  const fileBlocks = b.files
    .map((f) => {
      const lines = byFile.get(f.file) ?? [
        "(no error lines found — re-run wave:split)",
      ];
      return `### \`${f.file}\`  (${f.errors} error${f.errors === 1 ? "" : "s"})\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
    })
    .join("\n\n");

  const fileList = b.files.map((f) => `\`${f.file}\``).join(", ");

  return `# Wave fix \`${flag}\` — batch ${String(b.batch).padStart(3, "0")} (${b.totalErrors} errors, ${b.files.length} file${b.files.length === 1 ? "" : "s"})

You are ONE of many agents running in parallel. You own EXACTLY these file(s) and NOTHING else:

${b.files.map((f) => `- \`${f.file}\``).join("\n")}

## HARD RULES (read first)
- **DO NOT run \`pnpm type-check\`, \`tsc\`, \`pnpm build\`, \`pnpm sync-types\`, or ANY type-check/build command.** Dozens of agents run at once; a single \`tsc\` balloons to 20+ min and stalls everyone. Work ONLY from the error list below — it is complete and authoritative for your files.
- Edit ONLY the file(s) listed above (${fileList}). Touch no other file. If a real fix truly requires changing a shared type in another file, DO NOT do it — instead note it clearly in your final report so the orchestrator can handle cross-file changes centrally.
- **No cheating:** no \`// @ts-ignore\`, no \`// @ts-expect-error\`, no \`as any\`, no \`as unknown as\`, no \`!\` non-null assertions, no widening to \`any\`. Fix the real issue.
- Preserve runtime behavior. These are correctness fixes, not refactors. Keep the diff minimal and targeted to each error.
- Read each file fully before editing so a single guard/narrowing can resolve clustered errors correctly.

## What \`${flag}\` means
${g.what}

## How to fix correctly
${g.how.map((h) => `- ${h}`).join("\n")}

## Errors to fix (grouped by file)
${fileBlocks}

## When done
Report, per file, one line per error: the location and the exact fix you applied. If an error location no longer exists (code moved/already fixed), say so. Do NOT run a type-check to confirm — the orchestrator verifies centrally after all agents finish.
`;
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flag = args[0] ?? "strictNullChecks";
  const maxPer = Number(args[1] ?? "10");

  const outDir = join(ROOT, "type-errors", flag);
  const assignPath = join(outDir, "_assignments.json");
  const rawPath = join(ROOT, "type-errors", `${flag}.txt`);

  if (!existsSync(assignPath)) {
    process.stderr.write(
      `No assignments at ${assignPath}. Run: pnpm wave:split ${flag}\n`,
    );
    process.exit(1);
  }

  const assignments: Assignment[] = JSON.parse(
    readFileSync(assignPath, "utf8"),
  );
  const byFile = existsSync(rawPath)
    ? parseByFile(readFileSync(rawPath, "utf8"))
    : new Map();

  const batches = packBatches(assignments, maxPer);
  const totalErrors = assignments.reduce((a, f) => a + f.errors, 0);

  const batchesDir = join(outDir, "batches");
  if (existsSync(batchesDir)) rmSync(batchesDir, { recursive: true });
  mkdirSync(batchesDir, { recursive: true });

  for (const b of batches) {
    const name = `batch-${String(b.batch).padStart(3, "0")}.md`;
    writeFileSync(join(batchesDir, name), batchMarkdown(flag, b, byFile));
  }

  writeFileSync(
    join(batchesDir, "_batches.json"),
    JSON.stringify(batches, null, 2) + "\n",
  );

  const index = [
    `# \`${flag}\` — ${totalErrors} errors → ${batches.length} batches (<= ${maxPer} errors each; oversized files solo)`,
    ``,
    `Each batch = one agent. No file appears in two batches.`,
    `Agents must NOT run a type-check — they fix blind from their batch file.`,
    ``,
    `| batch | errors | files |`,
    `|-------|--------|-------|`,
    ...batches.map(
      (b) =>
        `| ${String(b.batch).padStart(3, "0")} | ${b.totalErrors} | ${b.files
          .map((f) => `\`${f.file}\``)
          .join("<br>")} |`,
    ),
    ``,
  ].join("\n");
  writeFileSync(join(batchesDir, "_index.md"), index);

  process.stderr.write(
    `\n${totalErrors} errors → ${batches.length} batches (max ${maxPer}/batch) → ${batchesDir}\n` +
      `  index:   type-errors/${flag}/batches/_index.md\n` +
      `  batches: type-errors/${flag}/batches/_batches.json\n`,
  );
}

main();
