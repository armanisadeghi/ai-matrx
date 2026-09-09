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
const AGENT_CANONICAL_IMPORT = "@ai-matrx/agents/catalog/react";
const MODEL_EXEMPTION = /canonical-model-picker-exempt:\s*(.{12,})/;
const AGENT_EXEMPTION = /canonical-agent-picker-exempt:\s*(.{12,})/;

/**
 * 🚨 THE SUBSTRING HOLE (fixed 2026-09-08, review of P7). The canonical-import
 * test used to be `text.includes("@ai-matrx/agents/catalog/react")`, so ANY
 * mention of the path whitelisted the WHOLE file — a tombstone comment, a doc
 * line, a string. A file could name the package in a comment (or import it for
 * one purpose) and hand-roll a second picker underneath it, green. Two changes
 * close it, and they are byte-identical in all four copies of this guard
 * (matrx-frontend, matrx-extend, matrx-local/desktop,
 * aidream/apps/workflow-studio):
 *
 *  1. Every scan runs over a COMMENT-STRIPPED copy of the file (offsets and
 *     therefore reported line numbers are preserved), so nothing in a comment
 *     can whitelist — or trip — the guard.
 *  2. The import test matches a real `import … from "<path>"` /
 *     `export … from "<path>"` / `require("<path>")` / `import("<path>")`
 *     statement, never a substring.
 */
function stripComments(text: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + " ".repeat(match.length - lead.length),
    );
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importSignals(modulePath: string): RegExp[] {
  const quoted = `['"\`]${escapeForRegExp(modulePath)}['"\`]`;
  return [
    // `import X from "p"`, `import { X } from "p"` (multi-line included), `import "p"`
    new RegExp(`\\bimport\\s+(?:[^;'"\`]*?\\bfrom\\s*)?${quoted}`),
    // `export { X } from "p"`, `export * from "p"`
    new RegExp(`\\bexport\\s+[^;'"\`]*?\\bfrom\\s*${quoted}`),
    new RegExp(`\\brequire\\s*\\(\\s*${quoted}`),
    new RegExp(`\\bimport\\s*\\(\\s*${quoted}`),
  ];
}

const AGENT_IMPORT_SIGNALS = importSignals(AGENT_CANONICAL_IMPORT);
const MODEL_IMPORT_SIGNALS = importSignals(MODEL_CANONICAL_IMPORT);

/**
 * WHAT A CANONICAL IMPORT EXCUSES: rendering the package's own components, and
 * nothing else. A file that imports the package is STILL scanned. A
 * hand-rolled `Agent(Picker|Selector|Select|Dropdown)` definition is excused
 * only when the file actually renders `AgentListDropdown` /
 * `AgentListInlinePicker` (the thin-wrapper shape — a wrapper named
 * `AgentPicker.tsx` that renders the package component is fine). A hand-built
 * roster (`agentOptions|availableAgents|displayAgents`.map, a native `<select>`
 * of agents) is a finding EITHER WAY: rendering the package once does not buy
 * the right to fork a second list beneath it.
 */
const AGENT_PACKAGE_RENDER = /<\s*(?:AgentListDropdown|AgentListInlinePicker)\b/;
const MODEL_PACKAGE_RENDER = /<\s*ModelListDropdown\b/;

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

function nameSignals(domain: "Agent" | "Model"): RegExp[] {
  return [
    new RegExp(
      `(?:export\\s+)?function\\s+${NAME_PREFIX}${domain}(?:Picker|Selector|Select|Dropdown)\\b`,
    ),
    new RegExp(
      `const\\s+${NAME_PREFIX}${domain}(?:Picker|Selector|Select|Dropdown)\\b\\s*=\\s*(?:\\([^)]*\\)|[^=])*=>`,
    ),
  ];
}

const MODEL_NAME_SIGNALS = nameSignals("Model");
const MODEL_ROSTER_SIGNALS: readonly RegExp[] = [
  /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*model/i,
  /<select\b[^>]*aria-label\s*=\s*["'][^"']*model/i,
  /(?:<Label[^>]*>\s*Model\s*<\/Label>|<label[^>]*>\s*Model|<Field[^>]*label\s*=\s*["']Model["'])\s*<select\b/i,
  /<SettingsTextInput\b[\s\S]{0,500}label\s*=\s*["'][^"']*model/i,
  /\b(?:modelOptions|availableModels|MEMORY_MODELS)\.map\s*\(/,
];

const AGENT_NAME_SIGNALS = nameSignals("Agent");
const AGENT_ROSTER_SIGNALS: readonly RegExp[] = [
  /<SelectValue\b[^>]*placeholder\s*=\s*["'][^"']*(?:select|choose|pick)[^"']*agent/i,
  /<select\b[^>]*aria-label\s*=\s*["'][^"']*agent/i,
  /\b(?:agentOptions|availableAgents|displayAgents)\.map\s*\(/,
];

/** A file as written (`raw`) and with comments blanked out (`code`). */
interface FileText {
  raw: string;
  code: string;
}

function readFileText(absolutePath: string): FileText {
  const raw = readFileSync(absolutePath, "utf8");
  return { raw, code: stripComments(raw) };
}

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

interface DomainSpec {
  label: string;
  canonical: string;
  importSignals: readonly RegExp[];
  packageRender: RegExp;
  nameSignals: readonly RegExp[];
  rosterSignals: readonly RegExp[];
  exemption: RegExp;
}

const AGENT_DOMAIN: DomainSpec = {
  label: "agent",
  canonical: AGENT_CANONICAL_IMPORT,
  importSignals: AGENT_IMPORT_SIGNALS,
  packageRender: AGENT_PACKAGE_RENDER,
  nameSignals: AGENT_NAME_SIGNALS,
  rosterSignals: AGENT_ROSTER_SIGNALS,
  exemption: AGENT_EXEMPTION,
};

const MODEL_DOMAIN: DomainSpec = {
  label: "model",
  canonical: MODEL_CANONICAL_IMPORT,
  importSignals: MODEL_IMPORT_SIGNALS,
  packageRender: MODEL_PACKAGE_RENDER,
  nameSignals: MODEL_NAME_SIGNALS,
  rosterSignals: MODEL_ROSTER_SIGNALS,
  exemption: MODEL_EXEMPTION,
};

/**
 * Findings for one file in one identity domain. `raw` is the file as written and
 * is used ONLY for the exemption test — an exemption IS a comment, so it must be
 * read before comments are stripped. Every detection runs on `code`, the
 * comment-stripped copy.
 */
function scanDomain(
  { raw, code }: FileText,
  spec: DomainSpec,
): { line: number; reason: string }[] {
  if (spec.exemption.test(raw)) return [];
  const canonical = spec.importSignals.some((pattern) => pattern.test(code));
  const wrapsCanonical = canonical && spec.packageRender.test(code);

  const findings: { line: number; reason: string }[] = [];
  const named = firstMatch(code, spec.nameSignals);
  if (named && !wrapsCanonical) {
    findings.push({
      line: lineFor(code, named.index),
      reason: canonical
        ? `defines its own ${spec.label} picker beside the canonical import without rendering the canonical component`
        : `${spec.label}-selection UI does not render the canonical picker (${spec.canonical})`,
    });
  }
  const roster = firstMatch(code, spec.rosterSignals);
  if (roster) {
    findings.push({
      line: lineFor(code, roster.index),
      reason: canonical
        ? `builds its own ${spec.label} roster beside the canonical import (importing the package excuses rendering its components, nothing else)`
        : `${spec.label}-selection UI does not render the canonical picker (${spec.canonical})`,
    });
  }
  return findings;
}

/**
 * `--self-test` — a guard you cannot demonstrate failing is not a guard.
 * RED 1 is the shape that walked through this script until 2026-09-08 morning:
 * a component named EXACTLY `AgentPicker` rendering its own `<select>`.
 * RED 2 and RED 3 are the substring hole the P7 review found: a file whose only
 * mention of the package is a COMMENT, and a file that imports the package for
 * one purpose and forks a second picker beneath it.
 * GREEN 1 is a surface that renders the package picker; GREEN 2 is a thin
 * wrapper NAMED `AgentPicker` that renders it (legitimate — the name is not the
 * defect, the second roster is); the handler case is the `handleAgentSelect`
 * false positive a bare `\w*` prefix reintroduces.
 */
const SELF_TEST_RED_BARE_FORK = `
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

const SELF_TEST_RED_COMMENT_MENTION = `
import { useState } from "react";
// The platform picker lives in ${AGENT_CANONICAL_IMPORT} and we should adopt it
// some day; AgentListDropdown does most of this already.
export function ChooseAgent({ agents }) {
  const [value, setValue] = useState("");
  return (
    <select aria-label="Select agent" value={value}>
      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
`;

const SELF_TEST_RED_IMPORT_AND_FORK = `
import { AgentListDropdown } from "${AGENT_CANONICAL_IMPORT}";
export function AgentSurface() {
  return <AgentListDropdown consumerId="x" onSelect={() => {}} />;
}
export function AgentPicker({ availableAgents, onPick }) {
  return (
    <select onChange={(e) => onPick(e.target.value)}>
      {availableAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
`;

const SELF_TEST_GREEN = `
import { AgentListDropdown } from "${AGENT_CANONICAL_IMPORT}";
export function Surface() {
  return <AgentListDropdown consumerId="x" onSelect={() => {}} />;
}
`;

const SELF_TEST_GREEN_WRAPPER = `
import { AgentListInlinePicker } from "${AGENT_CANONICAL_IMPORT}";
export function AgentPicker({ onSelect }) {
  return <AgentListInlinePicker consumerId="chat" onSelect={onSelect} />;
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
  const agentScan = (fixture: string) =>
    scanDomain({ raw: fixture, code: stripComments(fixture) }, AGENT_DOMAIN);

  if (agentScan(SELF_TEST_RED_BARE_FORK).length === 0) {
    failures.push(
      "RED 1: the detector did NOT flag a component named exactly `AgentPicker` that " +
        "builds its own <select> — the 2026-09-08 name-prefix gap is back.",
    );
  }
  if (agentScan(SELF_TEST_RED_COMMENT_MENTION).length === 0) {
    failures.push(
      "RED 2: the detector did NOT flag a hand-rolled <select> picker in a file whose " +
        "ONLY mention of the package is a comment — the substring hole is back.",
    );
  }
  if (agentScan(SELF_TEST_RED_IMPORT_AND_FORK).length === 0) {
    failures.push(
      "RED 3: the detector did NOT flag a file that imports the package AND forks its " +
        "own `AgentPicker` beneath it — a canonical import excuses rendering the " +
        "package's components, nothing else.",
    );
  }
  if (agentScan(SELF_TEST_GREEN).length > 0) {
    failures.push(
      "GREEN 1: the detector flagged a surface that DOES render the package picker — it " +
        "would block correct adoption.",
    );
  }
  if (agentScan(SELF_TEST_GREEN_WRAPPER).length > 0) {
    failures.push(
      "GREEN 2: the detector flagged a thin wrapper named `AgentPicker` that renders " +
        "AgentListInlinePicker — the name is not the defect, a second roster is.",
    );
  }
  if (agentScan(SELF_TEST_HANDLER).length > 0) {
    failures.push(
      "HANDLER: the detector flagged a plain `handleAgentSelect` callback — a false " +
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
    "✅ self-test: RED on a bare `AgentPicker` fork, RED on a comment-only package\n" +
      "   mention beside a <select> picker, RED on a canonical import with a fork\n" +
      "   beneath it; GREEN on the package picker and on a thin `AgentPicker` wrapper,\n" +
      "   and silent on a `handleAgentSelect` handler.",
  );
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const findings: Finding[] = [];

  for (const file of sourceFiles()) {
    const text = readFileText(path.join(ROOT, file));

    const retiredModelPicker = text.code.indexOf("SmartModelSelect");
    if (retiredModelPicker >= 0) {
      findings.push({
        file,
        line: lineFor(text.code, retiredModelPicker),
        reason: "retired SmartModelSelect reference",
      });
    }

    for (const spec of [MODEL_DOMAIN, AGENT_DOMAIN]) {
      for (const finding of scanDomain(text, spec)) {
        findings.push({ file, ...finding });
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
