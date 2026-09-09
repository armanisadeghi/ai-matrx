#!/usr/bin/env npx tsx
/**
 * check:canonical-pickers — stop agent/model picker forks at source.
 *
 * Platform agent choice is rendered by `AgentListDropdown` or
 * `AgentListInlinePicker` from `@ai-matrx/agents/catalog/react` — the ONE
 * picker, package-owned. Platform ai.model_definition choice is rendered by
 * ModelListDropdown. Callers may configure/wrap those components, but may not
 * build another roster from Select, native select, buttons, or local option
 * maps. Provider wire-contract enums are a different identity domain and must
 * carry a reasoned `canonical-model-picker-exempt:` comment at the control.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MODEL_CANONICAL_IMPORT =
  "@/features/ai-models/components/lab/ModelListDropdown";
// 🚨 THE ONE AGENT PICKER LIVES IN THE PACKAGE (2026-09-08, ruling D1).
// `@ai-matrx/agents/catalog/react` ships `AgentListDropdown` and
// `AgentListInlinePicker` and every piece of their logic; matrx-frontend's
// copies were deleted, not adapted. A host renders the package component and
// receives `onSelect(agentId)`.
const AGENT_CANONICAL_IMPORTS = ["@ai-matrx/agents/catalog/react"] as const;
const MODEL_EXEMPTION = /canonical-model-picker-exempt:\s*(.{12,})/;
const AGENT_EXEMPTION = /canonical-agent-picker-exempt:\s*(.{12,})/;

/**
 * 🚨 THE NAME-PREFIX GAP (fixed 2026-09-08, P7). These patterns used to read
 * `[A-Z]\w*Agent(?:Picker|…)`, which REQUIRES a character before "Agent" — so a
 * component named exactly `AgentPicker`, which is what matrx-local shipped for
 * months, walked straight through the guard. The prefix is now optional. It is
 * still a NAMED prefix class rather than a bare `\w*`, because `\w*` also
 * matches the handler names every one of these surfaces has
 * (`handleAgentSelect`, `onAgentSelect`) and flagged four innocent files.
 */
const NAME_PREFIX = "(?:[A-Z]\\w*|use|fetch|get|load|build|create)?";

const MODEL_SIGNALS: readonly RegExp[] = [
  new RegExp(
    `(?:export\\s+)?function\\s+${NAME_PREFIX}Model(?:Picker|Selector|Select|Dropdown)\\b`,
  ),
  new RegExp(
    `const\\s+${NAME_PREFIX}Model(?:Picker|Selector|Select|Dropdown)\\b\\s*=\\s*(?:\\([^)]*\\)|[^=])*=>`,
  ),
  /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*model/i,
  /<select\b[^>]*aria-label\s*=\s*["'][^"']*model/i,
  /(?:<Label[^>]*>\s*Model\s*<\/Label>|<label[^>]*>\s*Model|<Field[^>]*label\s*=\s*["']Model["'])\s*<select\b/i,
  /<SettingsTextInput\b[\s\S]{0,500}label\s*=\s*["'][^"']*model/i,
  /\b(?:modelOptions|availableModels|MEMORY_MODELS)\.map\s*\(/,
];

const AGENT_SIGNALS: readonly RegExp[] = [
  new RegExp(
    `(?:export\\s+)?function\\s+${NAME_PREFIX}Agent(?:Picker|Selector|Select|Dropdown)\\b`,
  ),
  new RegExp(
    `const\\s+${NAME_PREFIX}Agent(?:Picker|Selector|Select|Dropdown)\\b\\s*=\\s*(?:\\([^)]*\\)|[^=])*=>`,
  ),
  /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*agent/i,
  /<select\b[^>]*aria-label\s*=\s*["'][^"']*agent/i,
  /\b(?:agentOptions|availableAgents|displayAgents)\.map\s*\(/,
];

interface Finding {
  file: string;
  line: number;
  reason: string;
}

function sourceFiles(): string[] {
  const out = execSync(
    "git ls-files --cached --others --exclude-standard '*.ts' '*.tsx'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) =>
      /^(app|components|features|hooks|lib|utils)\//.test(file),
    );
}

function lineFor(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

function firstMatch(
  text: string,
  patterns: readonly RegExp[],
): { index: number; source: string } | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { index: match.index, source: pattern.source };
  }
  return null;
}

/**
 * `--self-test` — a guard you cannot demonstrate failing is not a guard.
 * Fixture 1 is the exact shape that walked through this script until
 * 2026-09-08: a component named EXACTLY `AgentPicker` rendering its own
 * `<select>` of agents. Fixture 2 is a surface that DOES render the package
 * picker, and fixture 3 is the handler-name false positive that a bare `\w*`
 * prefix reintroduces. All three assertions must hold.
 */
const SELF_TEST_RED = `
import { useState } from "react";
export function AgentPicker({ agents }) {
  const [value, setValue] = useState("");
  return (
    <select value={value} onChange={(e) => setValue(e.target.value)}>
      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
`;

const SELF_TEST_GREEN = `
import { AgentListDropdown } from "${AGENT_CANONICAL_IMPORTS[0]}";
export function Surface() {
  return <AgentListDropdown consumerId="x" onSelect={() => {}} />;
}
`;

const SELF_TEST_HANDLER = `
export function SomeChatSurface() {
  const handleAgentSelect = useCallback((agent) => push(agent.id), []);
  return <button onClick={() => handleAgentSelect({ id: "1" })}>Pick</button>;
}
`;

function selfTest(): void {
  const failures: string[] = [];
  if (!firstMatch(SELF_TEST_RED, AGENT_SIGNALS)) {
    failures.push(
      "the detector did NOT flag a component named exactly `AgentPicker` that " +
        "builds its own <select> — the 2026-09-08 name-prefix gap is back.",
    );
  }
  if (firstMatch(SELF_TEST_GREEN, AGENT_SIGNALS)) {
    failures.push(
      "the detector flagged a surface that DOES render the package picker — it " +
        "would block correct adoption.",
    );
  }
  if (firstMatch(SELF_TEST_HANDLER, AGENT_SIGNALS)) {
    failures.push(
      "the detector flagged a plain `handleAgentSelect` callback — a false " +
        "positive that makes agents delete the guard instead of the fork.",
    );
  }
  if (failures.length > 0) {
    console.error("\n🚨 check:canonical-pickers SELF-TEST FAILED\n");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error(
      "\nFix scripts/check-canonical-pickers.ts before trusting a green run.\n",
    );
    process.exit(1);
  }
  console.log(
    "✅ self-test: RED on a bare `AgentPicker` fork, GREEN on the package " +
      "picker,\n   and silent on a `handleAgentSelect` handler.",
  );
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const findings: Finding[] = [];

  for (const file of sourceFiles()) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    const hasModelCanonical = text.includes(MODEL_CANONICAL_IMPORT);
    const hasAgentCanonical = AGENT_CANONICAL_IMPORTS.some((importPath) =>
      text.includes(importPath),
    );

    const retiredModelPicker = text.indexOf("SmartModelSelect");
    if (retiredModelPicker >= 0) {
      findings.push({
        file,
        line: lineFor(text, retiredModelPicker),
        reason: "retired SmartModelSelect reference",
      });
    }

    if (!hasModelCanonical && !MODEL_EXEMPTION.test(text)) {
      const modelSignal = firstMatch(text, MODEL_SIGNALS);
      if (modelSignal) {
        findings.push({
          file,
          line: lineFor(text, modelSignal.index),
          reason: "model-selection UI does not render ModelListDropdown",
        });
      }
    }

    if (!hasAgentCanonical && !AGENT_EXEMPTION.test(text)) {
      const agentSignal = firstMatch(text, AGENT_SIGNALS);
      if (agentSignal) {
        findings.push({
          file,
          line: lineFor(text, agentSignal.index),
          reason:
            "agent-selection UI does not render the package picker (@ai-matrx/agents/catalog/react)",
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      "✅ Canonical pickers hold: no alternate platform agent/model selectors found.",
    );
    return;
  }

  console.error("\n🚨 ALTERNATE AGENT / MODEL PICKERS FOUND\n");
  for (const finding of findings) {
    console.error(`  ✗ ${finding.file}:${finding.line} — ${finding.reason}`);
  }
  console.error(
    "\nUse the canonical picker and add configuration props there when a surface needs\n" +
      "different sizing, filtering, default/null choices, or write behavior. A provider\n" +
      "wire-model enum that is not an ai.model_definition identity must carry a nearby\n" +
      "`canonical-model-picker-exempt: <reason>` comment (12+ reason characters). A\n" +
      "non-choice agent filter may analogously declare `canonical-agent-picker-exempt:`.\n",
  );
  process.exit(1);
}

main();
