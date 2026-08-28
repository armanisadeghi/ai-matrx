/**
 * Tests for the unified JSON extraction system.
 *
 * Run with: npx tsx utils/json/__tests__/extract-json.script.ts
 * (Renamed from .test.ts so Jest does not glob it as a test file —
 * this script has no Jest blocks; it asserts via plain `console.assert`
 * + custom matchers and is meant to be run via tsx, not jest.)
 */

import {
  extractAllJson,
  extractFirstJson,
  extractFirstObject,
  containsJson,
} from "../extract-json";
import {
  findBalancedEnd,
  findAllFencedBlocks,
  computeClosingSequence,
} from "../json-structural";
import { StreamingJsonTracker } from "../streaming-json-tracker";

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

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// =============================================================================
// Layer 0: Structural Primitives
// =============================================================================

section("findBalancedEnd");

{
  const text = '{"a": {"b": 1}, "c": [1,2]}';
  const result = findBalancedEnd(text, 0, "{", "}");
  assert(result.isComplete === true, "finds balanced end of nested object");
  assert(result.endIndex === text.length - 1, "endIndex is correct");
}

{
  const text = '{"a": "val';
  const result = findBalancedEnd(text, 0, "{", "}");
  assert(result.isComplete === false, "incomplete object detected");
}

{
  const text = "[1, [2, 3], 4]";
  const result = findBalancedEnd(text, 0, "[", "]");
  assert(result.isComplete === true, "balanced array");
  assert(result.endIndex === text.length - 1, "array endIndex correct");
}

{
  const text = '{"key": "val with \\"quotes\\""}';
  const result = findBalancedEnd(text, 0, "{", "}");
  assert(result.isComplete === true, "handles escaped quotes in strings");
}

section("computeClosingSequence");

{
  assert(
    computeClosingSequence('{"a": [1, 2') === "]}",
    "closes open array then object",
  );
}

{
  assert(
    computeClosingSequence('{"a": 1}') === "",
    "nothing to close for complete json",
  );
}

{
  assert(
    computeClosingSequence('[{"a": 1}, {"b":') === "}]",
    "closes open object then array",
  );
}

section("findAllFencedBlocks");

{
  const text =
    'Some text\n```json\n{"a": 1}\n```\nMore text\n```json\n[1,2]\n```';
  const blocks = findAllFencedBlocks(text);
  assert(blocks.length === 2, "finds two fenced blocks");
  assert(blocks[0].language === "json", "first block language is json");
  assert(blocks[0].isComplete === true, "first block is complete");
  assert(blocks[1].content.trim() === "[1,2]", "second block content correct");
}

{
  const text = 'Start\n```json\n{"partial": true';
  const blocks = findAllFencedBlocks(text);
  assert(blocks.length === 1, "finds incomplete block");
  assert(blocks[0].isComplete === false, "marks as incomplete");
}

{
  const text = 'No fences at all, just text {"a": 1}';
  const blocks = findAllFencedBlocks(text);
  assert(blocks.length === 0, "no blocks when no fences");
}

// =============================================================================
// Layer 1: Core Extractor
// =============================================================================

section("extractAllJson — fenced blocks");

{
  const text = '```json\n{"name": "test", "count": 42}\n```';
  const results = extractAllJson(text);
  assert(results.length === 1, "extracts one result from single fenced block");
  assert(results[0].type === "object", "result is object type");
  assert(results[0].source === "fenced", "source is fenced");
  assert(results[0].isComplete === true, "is complete");
  assert((results[0].value as any).name === "test", "value is correct");
}

{
  const text = "```json\n[1, 2, 3]\n```";
  const results = extractAllJson(text);
  assert(results.length === 1, "extracts array from fenced block");
  assert(results[0].type === "array", "correctly identifies as array");
  assert(Array.isArray(results[0].value), "value is actually an array");
}

{
  const text =
    'Here is JSON:\n```json\n{"a": 1}\n```\nAnd more:\n```json\n{"b": 2}\n```';
  const results = extractAllJson(text);
  assert(results.length === 2, "extracts multiple fenced blocks");
  assert((results[0].value as any).a === 1, "first value correct");
  assert((results[1].value as any).b === 2, "second value correct");
}

section("extractAllJson — arrays not rejected");

{
  const text = '```json\n[{"id": 1}, {"id": 2}]\n```';
  const results = extractAllJson(text);
  assert(results.length === 1, "array is extracted");
  assert(results[0].type === "array", "correctly typed as array");
  assert((results[0].value as any).length === 2, "array has 2 elements");
}

section("extractAllJson — repair");

{
  const text = '```json\n{"a": 1, "b": 2,}\n```';
  const results = extractAllJson(text);
  assert(results.length === 1, "trailing comma repaired");
  assert(results[0].repairApplied === true, "repair flagged");
}

{
  const text = '```json\n{"active": True, "value": None}\n```';
  const results = extractAllJson(text);
  assert(results.length === 1, "Python syntax repaired");
  assert((results[0].value as any).active === true, "True -> true");
  assert((results[0].value as any).value === null, "None -> null");
}

{
  const text =
    "```json\n{name: 'Agent helper', goals: ['research',], /* generated note */}\n```";
  const results = extractAllJson(text);
  assert(results.length === 1, "JSON5 model output repaired");
  assert(results[0].repairApplied === true, "JSON5 repair flagged");
  assert(
    (results[0].value as any).name === "Agent helper",
    "JSON5 object value preserved",
  );
}

section("extractAllJson — streaming mode");

{
  const text = '```json\n{"name": "test", "desc';
  const results = extractAllJson(text, { isStreaming: true });
  assert(results.length === 1, "streaming extracts incomplete fenced block");
  assert(results[0].isComplete === false, "flagged as incomplete");
  assert(results[0].type === "object", "is object");
  assert(
    (results[0].value as any).name === "test",
    "complete field is readable",
  );
}

{
  const text = '```json\n[{"id": 1}, {"id": 2';
  const results = extractAllJson(text, { isStreaming: true });
  assert(results.length === 1, "streaming extracts incomplete array");
  assert(results[0].isComplete === false, "flagged as incomplete");
  assert(results[0].type === "array", "is array");
}

section("extractAllJson — bare blocks (fuzzy)");

{
  const text = 'Here is the data: {"name": "John", "age": 30} and more text';
  const results = extractAllJson(text, { allowFuzzy: true });
  assert(results.length === 1, "finds bare JSON block");
  assert(results[0].source === "bare-block", "source is bare-block");
  assert((results[0].value as any).name === "John", "value correct");
}

{
  const text = '{"name": "John"}';
  const noFuzzy = extractAllJson(text);
  const fuzzy = extractAllJson(text, { allowFuzzy: true });
  assert(
    noFuzzy.length === 0 || noFuzzy[0]?.source === "bare-block",
    "non-fuzzy can still find bare blocks when no fenced blocks exist",
  );
  assert(fuzzy.length >= 1, "fuzzy finds it");
}

section("extractAllJson — whole-string (fuzzy last resort)");

{
  const text = '  {"name": "standalone"} ';
  const results = extractAllJson(text, { allowFuzzy: true });
  assert(results.length >= 1, "whole-string fallback works");
}

section("extractAllJson — no false positives");

{
  const text = "This is just regular text with no JSON whatsoever.";
  const results = extractAllJson(text);
  assert(results.length === 0, "no results for plain text");
}

{
  const text = "This is just regular text with no JSON whatsoever.";
  const results = extractAllJson(text, { isStreaming: true });
  assert(results.length === 0, "no results for plain text in streaming mode");
}

section("extractAllJson — maxResults");

{
  const text =
    '```json\n{"a":1}\n```\n```json\n{"b":2}\n```\n```json\n{"c":3}\n```';
  const results = extractAllJson(text, { maxResults: 2 });
  assert(results.length === 2, "maxResults limits output");
}

section("extractFirstJson / extractFirstObject / containsJson");

{
  const text = '```json\n[1,2,3]\n```\n```json\n{"obj": true}\n```';
  const first = extractFirstJson(text);
  assert(
    first !== null && first.type === "array",
    "extractFirstJson returns first (array)",
  );

  const firstObj = extractFirstObject(text);
  assert(
    firstObj !== null && firstObj.type === "object",
    "extractFirstObject skips array",
  );
  assert(
    (firstObj!.value as any).obj === true,
    "extractFirstObject value correct",
  );

  assert(containsJson(text) === true, "containsJson returns true");
  assert(
    containsJson("no json here") === false,
    "containsJson returns false for plain text",
  );
}

// =============================================================================
// Layer 3: Streaming Tracker
// =============================================================================

section("StreamingJsonTracker");

{
  const tracker = new StreamingJsonTracker();

  const s1 = tracker.append('Here is the response:\n```json\n{"na');
  assert(s1.revision === 1, "revision bumps on first extraction");
  assert(s1.results.length === 1, "finds partial json");
  assert(s1.results[0].isComplete === false, "partial is incomplete");
  assert(s1.hasOpenFence === true, "has open fence");

  const s2 = tracker.append('me": "Test", "count": 42}\n```');
  assert(s2.revision > s1.revision, "revision bumps when content changes");
  assert(s2.results[0].isComplete === true, "now complete");
  assert(s2.isAllComplete === true, "all complete");
  assert(s2.hasOpenFence === false, "no open fence anymore");

  const s3 = tracker.finalize();
  assert(s3.results.length === 1, "finalize keeps results");
  assert((s3.results[0].value as any).name === "Test", "value preserved");
}

{
  const tracker = new StreamingJsonTracker();
  tracker.append("No JSON here, just text about things.");
  const state = tracker.finalize();
  assert(state.results.length === 0, "no results for non-JSON text");
  assert(state.isAllComplete === true, "isAllComplete true when no results");
}

{
  const tracker = new StreamingJsonTracker();

  tracker.append("```json\n[");
  tracker.append('  {"id": 1, "name": "Alpha"},');
  tracker.append('  {"id": 2, "name": "Beta"}');
  const s = tracker.append("\n]\n```");

  assert(s.results.length === 1, "array extraction works across chunks");
  assert(s.results[0].type === "array", "is array");
  assert((s.results[0].value as any).length === 2, "two elements");
}

{
  const tracker = new StreamingJsonTracker();
  tracker.append(
    'Some text before\n```json\n{"a": 1}\n```\nSome text\n```json\n{"b": 2}\n```',
  );
  const state = tracker.finalize();
  assert(state.results.length === 2, "multiple JSONs across fences");
}

// =============================================================================
// Edge Cases
// =============================================================================

section("Edge cases");

{
  const text = '```json\n{"key": "value with ```backticks``` inside"}\n```';
  const results = extractAllJson(text);
  assert(
    results.length >= 0,
    "handles backticks inside strings without crashing",
  );
}

{
  const text = '```json\n{"emoji": "🎉", "nested": {"deep": true}}\n```';
  const results = extractAllJson(text);
  assert(results.length === 1, "handles unicode/emoji");
  assert((results[0].value as any).emoji === "🎉", "emoji preserved");
}

{
  const results = extractAllJson("");
  assert(results.length === 0, "empty string returns empty");
}

{
  const results = extractAllJson(null as any);
  assert(results.length === 0, "null input returns empty");
}

{
  const text =
    '```json\n{"a": 1}\n```\n```python\nprint("hello")\n```\n```json\n{"b": 2}\n```';
  const results = extractAllJson(text);
  assert(results.length === 2, "skips non-json fenced blocks");
}

// Real-world scenario: LLM response with explanation + JSON
{
  const text = `Here is the agent configuration I've created:

\`\`\`json
{
  "name": "Research Assistant",
  "description": "An AI assistant specialized in research tasks",
  "messages": [
    {
      "role": "system",
      "content": "You are a research assistant."
    }
  ],
  "settings": {
    "temperature": 0.7,
    "max_tokens": 4096
  }
}
\`\`\`

You can customize the temperature and max_tokens as needed.`;

  const results = extractAllJson(text);
  assert(results.length === 1, "real-world LLM response: extracts JSON");
  assert(
    (results[0].value as any).name === "Research Assistant",
    "real-world: correct name",
  );
  assert(
    (results[0].value as any).messages.length === 1,
    "real-world: has messages array",
  );
}

// Streaming simulation of real-world response
{
  const tracker = new StreamingJsonTracker();
  const chunks = [
    "Here is the config:\n```json\n{",
    '\n  "name": "Test',
    ' Agent",\n  "description": "A test',
    ' agent for validation",\n  "settings": {',
    '\n    "temperature": 0.8,\n    "max_tokens": 2048',
    "\n  }\n}\n```\n\nDone!",
  ];

  for (const chunk of chunks) {
    tracker.append(chunk);
  }
  const final = tracker.finalize();

  assert(final.results.length === 1, "streaming simulation: one result");
  assert(
    final.results[0].isComplete === true,
    "streaming simulation: complete",
  );
  assert(
    (final.results[0].value as any).name === "Test Agent",
    "streaming simulation: correct value",
  );
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
