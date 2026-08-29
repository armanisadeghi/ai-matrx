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
const SHARED_BATTLE_MODES = [
  "model",
  "settings",
  "system-prompt",
  "tools",
  "tuning",
  "variations",
] as const;

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

function lineOf(source: string, token: string): number {
  const offset = source.indexOf(token);
  return offset < 0 ? 1 : source.slice(0, offset).split("\n").length;
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
    .filter(
      (file) => !file.includes("/__tests__/") && !/\.test\.tsx?$/.test(file),
    );
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

  for (const mode of SHARED_BATTLE_MODES) {
    const component = `features/agent-comparison/modes/${mode}/components/LockedInputSection.tsx`;
    const componentSource = readFileSync(path.join(ROOT, component), "utf8");
    if (!componentSource.includes("<SharedBattleInput")) {
      findings.push({
        file: component,
        line: 1,
        token: "missing canonical <SharedBattleInput",
      });
    }
    if (componentSource.includes("<textarea")) {
      findings.push({
        file: component,
        line: lineOf(componentSource, "<textarea"),
        token: "hand-built Battle request textarea",
      });
    }

    const thunks = `features/agent-comparison/modes/${mode}/redux/thunks.ts`;
    const thunkSource = readFileSync(path.join(ROOT, thunks), "utf8");
    if (!thunkSource.includes("copyInstanceRequestDraft")) {
      findings.push({
        file: thunks,
        line: 1,
        token: "missing complete request-draft fan-out",
      });
    }
  }

  if (findings.length === 0) {
    console.log(
      "✅ Agent submit controls are content-optional and every shared Battle request uses the canonical multimodal input path.",
    );
    return;
  }

  console.error("\n🚨 AGENT INPUT OR SUBMISSION CONTRACT REGRESSION\n");
  for (const finding of findings) {
    console.error(
      `  ✗ ${finding.file}:${finding.line}  forbidden: ${finding.token}`,
    );
  }
  console.error(
    "\nRemove content tests and hand-built Battle composers. Submit eligibility " +
      "may enforce agent/instance identity and unresolved uploads, but never " +
      "typed message presence; shared Battle requests must fan out the complete " +
      "Smart Agent Input draft.\n",
  );
  process.exit(1);
}

main();
