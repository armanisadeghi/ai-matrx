#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  automationUpdateSpecs,
  PATROL_PATHS,
  PATROLS,
  registryScheduleTable,
} from "./manifest";

interface ParsedAutomation {
  [key: string]: string | string[] | undefined;
}

function parseTomlLineValue(raw: string): string | string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as string | string[];
  }
  return trimmed;
}

export function parseAutomationToml(contents: string): ParsedAutomation {
  const parsed: ParsedAutomation = {};
  for (const line of contents.split("\n")) {
    const match = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    parsed[match[1]] = parseTomlLineValue(match[2]);
  }
  const target = /target\s*=\s*\{[^}]*project_id\s*=\s*"([^"]+)"/.exec(
    contents,
  );
  if (target) parsed.project_id = target[1];
  return parsed;
}

function validateManifest(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const automationIds = new Set<string>();
  for (const patrol of PATROLS) {
    if (ids.has(patrol.patrolId))
      problems.push(`duplicate patrol id ${patrol.patrolId}`);
    if (automationIds.has(patrol.automationId)) {
      problems.push(`duplicate automation id ${patrol.automationId}`);
    }
    ids.add(patrol.patrolId);
    automationIds.add(patrol.automationId);
    if (!existsSync(join(PATROL_PATHS.repoRoot, patrol.recipePath))) {
      problems.push(
        `${patrol.patrolId} recipe does not exist: ${patrol.recipePath}`,
      );
    }
  }
  if (PATROLS.length !== 10)
    problems.push(`expected 10 product patrols, found ${PATROLS.length}`);

  for (const spec of automationUpdateSpecs()) {
    for (const contract of [
      "WORKTREE ISOLATION",
      "BASELINE-DELTA CERTIFICATION CONTRACT",
      "ENFORCED PREVIEW LEASE",
      "FAST INTEGRATION CONTRACT",
      "SERIALIZED RELEASE LANE",
      "RESUME UNFINISHED WORK",
      "LOUD FAILURE CONTRACT",
      "HUMAN EXCEPTION CONTRACT",
      "PROFESSIONAL IMPROVEMENT AUTHORITY",
    ]) {
      if (
        spec.executionEnvironment === "worktree" &&
        !spec.prompt.includes(contract)
      ) {
        problems.push(`${spec.id} generated prompt is missing ${contract}`);
      }
    }
    for (const forbidden of [
      "branch protection",
      "MUST NOT move origin/main",
      "never integrates to `origin/main`",
      "direct patrol integration as a critical",
    ]) {
      if (spec.prompt.toLowerCase().includes(forbidden.toLowerCase())) {
        problems.push(
          `${spec.id} generated prompt contains obsolete delivery rule: ${forbidden}`,
        );
      }
    }
  }
  return problems;
}

function validateRegistry(): string[] {
  const registryPath = join(PATROL_PATHS.commonDocsRoot, "PATROL_REGISTRY.md");
  if (!existsSync(registryPath)) return [`registry missing: ${registryPath}`];
  const registry = readFileSync(registryPath, "utf8");
  const expected = registryScheduleTable();
  return registry.includes(expected)
    ? []
    : ["PATROL_REGISTRY.md generated schedule table is stale"];
}

function validateLiveAutomations(): string[] {
  const problems: string[] = [];
  for (const expected of automationUpdateSpecs()) {
    const path = join(
      PATROL_PATHS.automationRoot,
      expected.id,
      "automation.toml",
    );
    if (!existsSync(path)) {
      problems.push(`${expected.id} live automation is missing`);
      continue;
    }
    const actual = parseAutomationToml(readFileSync(path, "utf8"));
    const comparisons: Array<[string, string | string[]]> = [
      ["id", expected.id],
      ["name", expected.name],
      ["prompt", expected.prompt],
      ["rrule", expected.rrule],
      ["status", expected.status],
      ["model", expected.model],
      ["reasoning_effort", expected.reasoningEffort],
      ["execution_environment", expected.executionEnvironment],
      ["project_id", expected.projectId],
      ["cwds", [PATROL_PATHS.repoRoot]],
    ];
    for (const [key, value] of comparisons) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
        problems.push(`${expected.id} ${key} drift`);
      }
    }
  }
  return problems;
}

function main(): void {
  if (process.argv.includes("--automation-json")) {
    process.stdout.write(`${JSON.stringify(automationUpdateSpecs())}\n`);
    return;
  }
  if (process.argv.includes("--registry")) {
    process.stdout.write(`${registryScheduleTable()}\n`);
    return;
  }
  const repoOnly = process.argv.includes("--repo-only");
  const problems = [...validateManifest(), ...validateRegistry()];
  if (!repoOnly) problems.push(...validateLiveAutomations());
  if (problems.length > 0) {
    console.error("Pattern Patrol manifest drift:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Pattern Patrol manifest OK: ${PATROLS.length} product patrols${repoOnly ? " (repository contracts)" : " + live automations"}.`,
  );
}

if (process.env.NODE_ENV !== "test") main();
