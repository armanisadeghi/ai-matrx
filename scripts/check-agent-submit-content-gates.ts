#!/usr/bin/env npx tsx
/**
 * Agent execution readiness is structural, never content-based. Typed
 * user_input is optional; variables, context, tools, attachments, or the
 * agent definition itself may be the complete request.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PRODUCTION_ROOTS = ["features/agents/", "features/agent-comparison/"];

const FORBIDDEN = [
  "requireTextForSubmit",
  "selectModelHasDraftContent",
  "shouldSubmitColumn",
  "SubmitAllPreflightDialog",
  "Nothing to launch — every column is empty",
  "Add a message, variable value, or attachment before submitting",
  "Add a user message in the Locked input section before submitting",
  "Add a test message before submitting",
  "isExecuting && !inputText.trim()",
  "if (!lockedSetup.userMessage.trim())",
] as const;

interface Finding {
  file: string;
  line: number;
  token: string;
}

function productionFiles(): string[] {
  const output = execSync("git ls-files '*.ts' '*.tsx'", {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output
    .split("\n")
    .filter(Boolean)
    .filter((file) => PRODUCTION_ROOTS.some((root) => file.startsWith(root)))
    .filter((file) => existsSync(path.join(ROOT, file)))
    .filter((file) => !file.includes("/__tests__/") && !/\.test\.tsx?$/.test(file));
}

function main(): void {
  const findings: Finding[] = [];
  for (const file of productionFiles()) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    for (const token of FORBIDDEN) {
      let offset = source.indexOf(token);
      while (offset >= 0) {
        findings.push({
          file,
          line: source.slice(0, offset).split("\n").length,
          token,
        });
        offset = source.indexOf(token, offset + token.length);
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      "✅ Agent submit controls do not require typed user_input content.",
    );
    return;
  }

  console.error("\n🚨 AGENT SUBMISSION IS GATED ON TYPED USER INPUT\n");
  for (const finding of findings) {
    console.error(
      `  ✗ ${finding.file}:${finding.line}  forbidden: ${finding.token}`,
    );
  }
  console.error(
    "\nRemove the content test. Submit eligibility may enforce agent/instance " +
      "identity and unresolved uploads, but never typed message presence.\n",
  );
  process.exit(1);
}

main();
