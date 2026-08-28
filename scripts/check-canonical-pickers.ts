#!/usr/bin/env npx tsx
/**
 * check:canonical-pickers — stop agent/model picker forks at source.
 *
 * Platform agent choice is rendered by AgentListDropdown or
 * AgentListInlinePicker. Platform ai.model_definition choice is rendered by
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
const AGENT_CANONICAL_IMPORTS = [
  "@/features/agents/components/agent-listings/AgentListDropdown",
  "@/features/agents/components/agent-listings/AgentListInlinePicker",
] as const;
const MODEL_EXEMPTION = /canonical-model-picker-exempt:\s*(.{12,})/;
const AGENT_EXEMPTION = /canonical-agent-picker-exempt:\s*(.{12,})/;

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

function main(): void {
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
      const modelSignal = firstMatch(text, [
        /function\s+[A-Z]\w*Model(?:Picker|Selector|Select|Dropdown)\b/,
        /const\s+[A-Z]\w*Model(?:Picker|Selector|Select|Dropdown)\b\s*=\s*(?:\([^)]*\)|[^=])*=>/,
        /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*model/i,
        /<select\b[^>]*aria-label\s*=\s*["'][^"']*model/i,
        /(?:<Label[^>]*>\s*Model\s*<\/Label>|<label[^>]*>\s*Model|<Field[^>]*label\s*=\s*["']Model["'])\s*<select\b/i,
        /<SettingsTextInput\b[\s\S]{0,500}label\s*=\s*["'][^"']*model/i,
        /\b(?:modelOptions|availableModels|MEMORY_MODELS)\.map\s*\(/,
      ]);
      if (modelSignal) {
        findings.push({
          file,
          line: lineFor(text, modelSignal.index),
          reason: "model-selection UI does not render ModelListDropdown",
        });
      }
    }

    if (!hasAgentCanonical && !AGENT_EXEMPTION.test(text)) {
      const agentSignal = firstMatch(text, [
        /(?:export\s+)?function\s+[A-Z]\w*Agent(?:Picker|Selector|Select|Dropdown)\b/,
        /const\s+[A-Z]\w*Agent(?:Picker|Selector|Select|Dropdown)\b\s*=\s*(?:\([^)]*\)|[^=])*=>/,
        /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*agent/i,
        /\b(?:agentOptions|availableAgents|displayAgents)\.map\s*\(/,
      ]);
      if (agentSignal) {
        findings.push({
          file,
          line: lineFor(text, agentSignal.index),
          reason:
            "agent-selection UI does not render AgentListDropdown or AgentListInlinePicker",
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
