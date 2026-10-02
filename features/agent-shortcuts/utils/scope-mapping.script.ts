/**
 * Tests for `mapScopeToAgentVariables` — the agent-shortcut scope-to-variable
 * resolver. Ported from the legacy prompt-builtins execution tests plus extra
 * coverage for custom-scope merging and unknown-variable logging.
 *
 * Run with: npx tsx features/agent-shortcuts/utils/scope-mapping.script.ts
 * (Renamed from .test.ts so Jest does not glob it as a test file —
 * this script has no Jest blocks; it asserts via plain `console.assert`
 * and is meant to be run via tsx, not jest.)
 */

import {
  mapScopeToAgentVariables,
  type ScopeData,
  type ScopeMappingLogger,
} from "./scope-mapping";
import type { VariableDefinition } from "@ai-matrx/chat/agents/types/agent-definition.types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok =
    JSON.stringify(actual) === JSON.stringify(expected) || actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

function createLogger() {
  const calls: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger: ScopeMappingLogger = {
    warn: (message, meta) => {
      calls.push({ message, meta });
    },
  };
  return { logger, calls };
}

// Test fixtures ---------------------------------------------------------------

const baseDefs: VariableDefinition[] = [
  { name: "query", defaultValue: "" },
  { name: "document", defaultValue: null },
  { name: "tone", defaultValue: "professional" },
];

// =============================================================================
// 1. Straight pass-through (no mappings) returns seeded defaults only
// =============================================================================

section("no mappings → only defaults");

{
  const result = mapScopeToAgentVariables({}, null, baseDefs);
  assertEqual(
    result,
    { query: "", document: null, tone: "professional" },
    "null mappings seeds defaults from variable defs",
  );
}

{
  const result = mapScopeToAgentVariables({}, {}, baseDefs);
  assertEqual(
    result,
    { query: "", document: null, tone: "professional" },
    "empty mappings seeds defaults from variable defs",
  );
}

{
  // No defs, no mappings — the "true" empty case from the task spec.
  const result = mapScopeToAgentVariables({}, null, null);
  assertEqual(result, {}, "no defs + no mappings returns {}");
}

// =============================================================================
// 2. selection → query mapping populates the query variable
// =============================================================================

section("selection → query");

{
  const scope: ScopeData = { selection: "hello world" };
  const result = mapScopeToAgentVariables(
    scope,
    { selection: "query" },
    baseDefs,
  );
  assertEqual(result.query, "hello world", "selection overrides default");
  assertEqual(result.tone, "professional", "other defaults retained");
}

{
  // Mapping a complex content object
  const scope: ScopeData = { content: { title: "T", body: "B" } };
  const result = mapScopeToAgentVariables(
    scope,
    { content: "document" },
    baseDefs,
  );
  assertEqual(
    result.document,
    { title: "T", body: "B" },
    "content scope preserves object shape",
  );
}

// =============================================================================
// 3. Missing source data → variable is absent (not undefined-stringified)
// =============================================================================

section("missing source → default / absent, not 'undefined' string");

{
  // Selection mapped but NOT present in scope data — must fall through to default.
  const result = mapScopeToAgentVariables(
    {},
    { selection: "query" },
    baseDefs,
  );
  assertEqual(result.query, "", "missing selection falls through to default");
  assert(
    !("query" in result && result.query === undefined),
    "query is not the literal undefined",
  );
  assert(
    typeof result.query !== "string" || result.query !== "undefined",
    "query is not the string 'undefined'",
  );
}

{
  // Selection mapped and EXPLICITLY null — must not overwrite default.
  const result = mapScopeToAgentVariables(
    { selection: null },
    { selection: "query" },
    baseDefs,
  );
  assertEqual(result.query, "", "explicit null selection does not overwrite");
}

{
  // No defs — missing source means the variable key is absent entirely.
  const result = mapScopeToAgentVariables({}, { selection: "query" }, null);
  assert(!("query" in result), "query is absent when no default + no source");
}

// =============================================================================
// 4. Missing agent variable definition → skipped with logger call
// =============================================================================

section("unknown target variable → skip + warn");

{
  const { logger, calls } = createLogger();
  const scope: ScopeData = { selection: "pasted text" };
  const result = mapScopeToAgentVariables(
    scope,
    { selection: "nonexistent_var" },
    baseDefs,
    logger,
  );
  assert(
    !("nonexistent_var" in result),
    "unknown target variable is not written",
  );
  assertEqual(
    result.query,
    "",
    "known variables still get their defaults seeded",
  );
  assertEqual(calls.length, 1, "logger.warn called exactly once");
  assert(
    calls[0].message.includes("nonexistent_var"),
    "warn message mentions the missing variable name",
  );
  assertEqual(
    calls[0].meta,
    { scopeKey: "selection", targetName: "nonexistent_var" },
    "warn meta carries scopeKey + targetName",
  );
}

{
  // Omitting the logger must not throw — it no-ops.
  const result = mapScopeToAgentVariables(
    { selection: "x" },
    { selection: "missing" },
    baseDefs,
  );
  assert(
    !("missing" in result),
    "unknown target skipped silently with default logger",
  );
}

// =============================================================================
// 5. Custom map merges with named scopes, custom wins
// =============================================================================

section("custom overrides named scopes");

{
  const scope: ScopeData = {
    selection: "from-named",
    custom: { selection: "from-custom" },
  };
  const result = mapScopeToAgentVariables(
    scope,
    { selection: "query" },
    baseDefs,
  );
  assertEqual(
    result.query,
    "from-custom",
    "custom.selection wins over scope.selection",
  );
}

{
  // Custom-only scope key (not on the top-level) still resolves.
  const defs: VariableDefinition[] = [
    { name: "filename", defaultValue: "untitled" },
  ];
  const scope: ScopeData = { custom: { active_file: "main.ts" } };
  const result = mapScopeToAgentVariables(
    scope,
    { active_file: "filename" },
    defs,
  );
  assertEqual(
    result.filename,
    "main.ts",
    "custom-only scope key resolves to variable",
  );
}

{
  // Custom + named mix — each mapping resolves independently.
  const defs: VariableDefinition[] = [
    { name: "query", defaultValue: "" },
    { name: "context", defaultValue: "" },
  ];
  const scope: ScopeData = {
    selection: "sel",
    custom: { surrounding: "ctx" },
  };
  const result = mapScopeToAgentVariables(
    scope,
    { selection: "query", surrounding: "context" },
    defs,
  );
  assertEqual(result.query, "sel", "named scope resolves normally");
  assertEqual(result.context, "ctx", "custom key resolves alongside");
}

{
  // Explicit null in custom DOES win (conscious erasure), and because null is
  // skipped by the resolver it leaves the default in place.
  const scope: ScopeData = {
    selection: "real",
    custom: { selection: null },
  };
  const result = mapScopeToAgentVariables(
    scope,
    { selection: "query" },
    baseDefs,
  );
  assertEqual(
    result.query,
    "",
    "custom null beats named scope and falls through to default",
  );
}

// =============================================================================
// 6. Arbitrary extra scope keys (multi-scope bag from the UI)
// =============================================================================

section("arbitrary top-level scope keys");

{
  const defs: VariableDefinition[] = [
    { name: "language", defaultValue: "typescript" },
    { name: "errors", defaultValue: [] },
  ];
  const scope: ScopeData = {
    languageId: "python",
    diagnostics: [{ line: 3, msg: "oops" }],
  };
  const result = mapScopeToAgentVariables(
    scope,
    { languageId: "language", diagnostics: "errors" },
    defs,
  );
  assertEqual(
    result.language,
    "python",
    "custom top-level scope key resolves",
  );
  assertEqual(
    result.errors,
    [{ line: 3, msg: "oops" }],
    "array source is preserved as-is",
  );
}

// =============================================================================
// 7. Semantic parity spot-checks against the legacy mapper
// =============================================================================

section("legacy mapScopeToVariables parity");

{
  // Legacy example: selection only, no defaults.
  const result = mapScopeToAgentVariables(
    { selection: "my selection", content: null, custom: null } as ScopeData,
    { selection: "user_query" },
    [{ name: "user_query", defaultValue: "" }],
  );
  assertEqual(
    result,
    { user_query: "my selection" },
    "single selection mapping matches legacy behavior",
  );
}

{
  // Legacy example: empty string is a valid value (not null/undefined), so it
  // DOES overwrite — matching the original `!== null` check.
  const result = mapScopeToAgentVariables(
    { selection: "" } as ScopeData,
    { selection: "user_query" },
    [{ name: "user_query", defaultValue: "default" }],
  );
  assertEqual(
    result.user_query,
    "",
    "empty string overwrites default (legacy semantics)",
  );
}

{
  // Falsy-but-present values: 0, false preserved.
  const defs: VariableDefinition[] = [
    { name: "count", defaultValue: 99 },
    { name: "flag", defaultValue: true },
  ];
  const result = mapScopeToAgentVariables(
    { amount: 0, enabled: false } as ScopeData,
    { amount: "count", enabled: "flag" },
    defs,
  );
  assertEqual(result.count, 0, "zero overwrites default");
  assertEqual(result.flag, false, "false overwrites default");
}

// =============================================================================
// Summary
// =============================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
