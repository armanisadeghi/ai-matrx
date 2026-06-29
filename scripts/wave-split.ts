#!/usr/bin/env tsx
/**
 * Strictness-wave error splitter — see docs/upgrades/README.md (TS strictness waves).
 *
 * For a single strict flag, measures the errors it surfaces (flag OFF in the real
 * tsconfig — measured via a temp config) and SPLITS them into one self-contained
 * task file PER source file, so each can be handed to its own fix agent. The
 * agents work BLIND from the list — they must NOT run a type-check (parallel
 * `tsc` runs balloon to 20+ min and stall everyone), which is the whole reason
 * the per-file lists exist.
 *
 * Writes (all under the gitignored type-errors/<flag>/):
 *   tasks/NNN__<sanitized-path>.md   one self-contained assignment per file
 *   _manifest.md                     human index (files sorted by error count)
 *   _assignments.json                { file, errors, task } records (for batching)
 *
 * Usage:
 *   pnpm wave:split                       # default flag: noImplicitReturns
 *   pnpm wave:split noImplicitReturns
 *   pnpm wave:split strictFunctionTypes
 *
 * Mutates nothing tracked: temp tsconfig is gitignored + removed on exit;
 * type-errors/ is gitignored.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TMP_CONFIG = join(ROOT, ".tsconfig.measure.tmp.json");
const ERROR_RE = /error TS(\d+):/;
const LOC_RE = /^(\S+?)\((\d+),(\d+)\):\s*error TS(\d+):\s*(.*)$/;

// Per-flag guidance injected into every task file. Keep each entry tight — it's
// the agent's entire briefing on the rule.
const FLAG_GUIDANCE: Record<string, { what: string; how: string[] }> = {
  noImplicitReturns: {
    what: 'A function whose return type is non-void must return a value on EVERY code path. TS7030 ("Not all code paths return a value") means some branch falls through without returning.',
    how: [
      "Add the missing `return <value>` on the branch(es) that fall through, returning the correct value for that path.",
      "For `switch`: make sure `default:` returns (or every `case` returns).",
      "If a path legitimately yields nothing, return what the contract expects (e.g. `return null;` / `return undefined;`) ONLY if that matches the declared return type — otherwise fix the logic so all paths return.",
      "Do NOT widen the return type to `void`/`any` to dodge the rule. Preserve behavior — these are correctness fixes, not refactors.",
    ],
  },
  strictFunctionTypes: {
    what: "Function parameter types are checked contravariantly. Errors mean a function is assigned where its parameter types aren't compatible (usually an over-narrow or mismatched callback/handler signature).",
    how: [
      "Align the function/callback signature with what the consumer expects — fix the parameter types, don't cast.",
      "Prefer widening the IMPLEMENTATION's parameter to match the expected signature over narrowing the expected type.",
      "Do NOT use `as any` / `as unknown as` to force-assign. Model the real signature.",
    ],
  },
  strictNullChecks: {
    what: "`null` and `undefined` are no longer assignable to every type. Errors mean a possibly-null/undefined value is used where a defined value is required.",
    how: [
      "Guard before use: `if (x) { ... }`, early-return, or optional chaining `x?.y`.",
      "Only use `?? <fallback>` when the fallback is a correct default — never to paper over a genuine 'this should exist' bug (throw at the boundary instead).",
      "Do NOT use `!` non-null assertions or `as` casts to silence. Narrow honestly.",
    ],
  },
  noImplicitAny: {
    what: "A parameter/variable whose type can't be inferred falls back to `any`, which is now an error. TS7006/TS7005/TS7031 etc.",
    how: [
      "Add an explicit type annotation that reflects the real shape.",
      "For callbacks, type the parameter from the API/signature it's passed to.",
      "Do NOT annotate with `any` to silence — model the type (use @/types/json's JsonObject/JsonValue for genuinely open JSON).",
    ],
  },
};

function flagGuidance(flag: string): { what: string; how: string[] } {
  return (
    FLAG_GUIDANCE[flag] ?? {
      what: `Errors surfaced by enabling \`${flag}\`.`,
      how: [
        "Fix the underlying type issue properly — do NOT use `any`, `as`, `!`, or `@ts-*` comments to silence it.",
      ],
    }
  );
}

interface FileErrors {
  file: string;
  lines: string[]; // formatted "L<line>:<col>  TSxxxx  message"
  count: number;
}

function runTsc(flag: string): string {
  writeFileSync(
    TMP_CONFIG,
    JSON.stringify(
      {
        extends: "./tsconfig.typecheck.json",
        compilerOptions: { incremental: false, [flag]: true },
      },
      null,
      2,
    ),
  );
  let raw = "";
  try {
    raw = execSync(
      `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p ${TMP_CONFIG}`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: ROOT,
        maxBuffer: 1024 * 1024 * 256,
      },
    );
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    raw = (err.stdout ?? "") + (err.stderr ?? "");
  } finally {
    if (existsSync(TMP_CONFIG)) rmSync(TMP_CONFIG);
  }
  return raw;
}

function parseByFile(raw: string): Map<string, FileErrors> {
  const byFile = new Map<string, FileErrors>();
  for (const line of raw.split("\n")) {
    const m = LOC_RE.exec(line);
    if (!m) continue;
    const [, file, ln, col, code, msg] = m;
    if (!byFile.has(file)) byFile.set(file, { file, lines: [], count: 0 });
    const fe = byFile.get(file)!;
    fe.lines.push(`L${ln}:${col}  TS${code}  ${msg}`);
    fe.count++;
  }
  return byFile;
}

function sanitize(file: string): string {
  return file.replace(/^\.\//, "").replace(/[\/]/g, "__");
}

function taskMarkdown(flag: string, fe: FileErrors): string {
  const g = flagGuidance(flag);
  return `# Fix \`${flag}\` — \`${fe.file}\`

You are ONE of many agents running in parallel. You own EXACTLY this one file:

\`${fe.file}\`

## ⛔ HARD RULES (read first)
- **DO NOT run \`pnpm type-check\`, \`tsc\`, \`pnpm build\`, or any type-checking / build command.** Dozens of agents run at once; a single \`tsc\` balloons to 20+ minutes and stalls everyone. Work ONLY from the error list below — it is complete for this file.
- Edit ONLY \`${fe.file}\`. Do not touch any other file.
- **No cheating** (TYPESCRIPT_STANDARDS.md §3): no \`// @ts-ignore\`, no \`// @ts-expect-error\`, no \`as any\`, no \`as unknown as\`, no \`!\` non-null assertions, no widening to \`any\` to silence the compiler. Fix the real issue.
- Preserve runtime behavior. These are correctness fixes, not refactors. Keep the diff minimal.

## What \`${flag}\` means
${g.what}

## How to fix correctly
${g.how.map((h) => `- ${h}`).join("\n")}

## The ${fe.count} error${fe.count === 1 ? "" : "s"} in this file
\`\`\`
${fe.lines.join("\n")}
\`\`\`

## When done
Report one line per error: the location and the exact fix you applied. If an error location no longer exists (code moved), say so. Do not run a type-check to confirm — the orchestrator verifies centrally after all agents finish.
`;
}

function main(): void {
  const flag =
    process.argv.slice(2).find((a) => !a.startsWith("--")) ??
    "noImplicitReturns";
  const outDir = join(ROOT, "type-errors", flag);
  const tasksDir = join(outDir, "tasks");

  process.stderr.write(
    `Measuring \`${flag}\` (this runs one tsc pass — be patient)…\n`,
  );
  const raw = runTsc(flag);
  writeFileSync(join(ROOT, "type-errors", `${flag}.txt`), raw);

  const byFile = parseByFile(raw);
  const sorted = [...byFile.values()].sort((a, b) => b.count - a.count);
  const totalErrors = sorted.reduce((a, f) => a + f.count, 0);

  if (sorted.length === 0) {
    process.stderr.write(`No errors for ${flag}. (Already clean?)\n`);
    return;
  }

  mkdirSync(tasksDir, { recursive: true });

  const assignments: {
    idx: number;
    file: string;
    errors: number;
    task: string;
  }[] = [];
  sorted.forEach((fe, i) => {
    const idx = i + 1;
    const taskName = `${String(idx).padStart(3, "0")}__${sanitize(fe.file)}.md`;
    writeFileSync(join(tasksDir, taskName), taskMarkdown(flag, fe));
    assignments.push({
      idx,
      file: fe.file,
      errors: fe.count,
      task: `tasks/${taskName}`,
    });
  });

  writeFileSync(
    join(outDir, "_assignments.json"),
    JSON.stringify(assignments, null, 2) + "\n",
  );

  const manifest = [
    `# \`${flag}\` — ${totalErrors} errors across ${sorted.length} files`,
    ``,
    `One task file per source file under \`tasks/\`. Assign one (or a batch) per agent.`,
    `Agents must NOT run a type-check — they fix blind from their task file's list.`,
    ``,
    `| # | errors | file | task |`,
    `|---|--------|------|------|`,
    ...assignments.map(
      (a) => `| ${a.idx} | ${a.errors} | \`${a.file}\` | \`${a.task}\` |`,
    ),
    ``,
  ].join("\n");
  writeFileSync(join(outDir, "_manifest.md"), manifest);

  process.stderr.write(
    `\n${totalErrors} errors across ${sorted.length} files → ${tasksDir}\n` +
      `  manifest:    type-errors/${flag}/_manifest.md\n` +
      `  assignments: type-errors/${flag}/_assignments.json\n`,
  );
}

main();
