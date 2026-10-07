/**
 * Stress tests for json-parse-utils: preprocessJsonContent and safeJsonParse.
 * Run: npx tsx scripts/test-json-parse-utils.ts
 *
 * Contract: preprocessJsonContent never throws and always returns a string.
 *           safeJsonParse never throws and returns parsed value or null.
 */

import {
  preprocessJsonContent,
  safeJsonParse,
} from "@ai-matrx/rich-content/display/chat-markdown/block-registry/json-parse-utils";

const cases: { name: string; input: string }[] = [
  { name: "empty string", input: "" },
  { name: "whitespace only", input: "   \n\t  " },
  { name: "single quote", input: "'" },
  { name: "double quote", input: '"' },
  { name: "backslash only", input: "\\" },
  { name: "invalid JSON - no quotes", input: "foo" },
  { name: "invalid JSON - unclosed brace", input: '{"a":1' },
  { name: "invalid JSON - trailing comma", input: '{"a":1,}' },
  { name: "valid minimal object", input: "{}" },
  { name: "valid empty array", input: "[]" },
  { name: "null literal", input: "null" },
  { name: "number", input: "42" },
  { name: "string with newline", input: '"a\nb"' },
  { name: "string with tab", input: '"a\tb"' },
  { name: "string with unicode escape", input: '"\\u0041"' },
  { name: "string with null byte", input: '"\\u0000"' },
  { name: "string with line separator", input: '"\\u2028"' },
  { name: "string with paragraph separator", input: '"\\u2029"' },
  { name: "malformed unicode escape", input: '"\\u00"' },
  { name: "many backslashes", input: '"\\\\\\\\\\\\"' },
  { name: "quote inside string escaped", input: '"hello \\" world"' },
  { name: "LaTeX in string (single backslash)", input: '{"latex":"\\frac{1}{2}"}' },
  { name: "LaTeX already escaped", input: '{"latex":"\\\\frac{1}{2}"}' },
  { name: "mixed content with backslash", input: '{"x":"a\\\\b\\\\c"}' },
  { name: "very long string", input: '"' + "x".repeat(100_000) + '"' },
  { name: "nested objects", input: '{"a":{"b":{"c":1}}}' },
  { name: "array of strings", input: '["\\alpha","\\beta"]' },
  { name: "real number", input: "3.14e-10" },
  { name: "boolean true", input: "true" },
  { name: "boolean false", input: "false" },
  { name: "control chars in string", input: '"\\x00\\x01"' },
  { name: "regex-like content", input: '{"p":"(?:[^"]*)"}' },
  { name: "backslash at end", input: '"text\\"' },
  { name: "only backslash in quotes", input: '"\\\\"' },
  { name: "surrogate pair", input: '"\\uD834\\uDD1E"' },
  { name: "invalid surrogate (unpaired)", input: '"\\uD834"' },
  { name: "deeply nested", input: JSON.stringify({ a: { b: { c: { d: "\\delta" } } } }) },
  { name: "empty key", input: '{"":"v"}' },
  { name: "key with spaces", input: '{" a ":1}' },
  { name: "string with slash", input: '{"url":"https://example.com"}' },
  { name: "ReDoS candidate - many alternations", input: '"' + "a".repeat(500) + '\\"' },
  { name: "many quoted segments", input: Array(200).fill('"x"').join(",") },
  { name: "object with in key", input: '{"in":"\\in"}' },
  { name: "minus in LaTeX", input: '{"expr":"a \\pm b"}' },
  // Adversarial: many backslash-quote pairs (regex backtracking)
  { name: "many backslash-quote pairs", input: '"' + "\\'".repeat(500) + '"' },
  { name: "alternating backslash quote", input: '"' + "\\\"".repeat(300) + '"' },
  // Non-string coercion (util guards with typeof)
  { name: "object with all LaTeX commands", input: '{"t":"' + ["\\alpha", "\\beta", "\\gamma", "\\delta"].join(" ") + '"}' },
  { name: "string with only open quote", input: '"unclosed' },
  { name: "high unicode", input: '"\\uFFFF"' },
  { name: "tab and newline in key", input: '{"\t\n":1}' },
  { name: "circular-like", input: '{"a":"\\\\alpha\\\\beta"}' },
];

// Type coercion tests (call with non-string to ensure util guards)
const coercionTests: { name: string; getInput: () => unknown }[] = [
  { name: "undefined", getInput: () => undefined },
  { name: "null", getInput: () => null },
  { name: "number", getInput: () => 42 },
  { name: "object", getInput: () => ({}) },
];

function runOne(name: string, input: string): { ok: boolean; error?: string } {
  try {
    const out = preprocessJsonContent(input);
    if (typeof out !== "string") {
      return { ok: false, error: `preprocessJsonContent returned non-string: ${typeof out}` };
    }
  } catch (e) {
    return { ok: false, error: `preprocessJsonContent threw: ${e}` };
  }
  try {
    safeJsonParse(input);
  } catch (e) {
    return { ok: false, error: `safeJsonParse threw: ${e}` };
  }
  return { ok: true };
}

function main() {
  let failed = 0;
  for (const { name, input } of cases) {
    const result = runOne(name, input);
    if (!result.ok) {
      console.error(`FAIL [${name}]: ${result.error}`);
      console.error("  input length:", input.length, "first 80 chars:", JSON.stringify(input.slice(0, 80)));
      failed++;
    } else {
      console.log(`OK   [${name}]`);
    }
  }
  for (const { name, getInput } of coercionTests) {
    try {
      const input = getInput() as string;
      const out = preprocessJsonContent(input);
      if (typeof out !== "string") {
        console.error(`FAIL [${name}]: preprocessJsonContent returned ${typeof out}`);
        failed++;
      } else {
        safeJsonParse(input);
        console.log(`OK   [coercion ${name}]`);
      }
    } catch (e) {
      console.error(`FAIL [coercion ${name}]: ${e}`);
      failed++;
    }
  }
  const total = cases.length + coercionTests.length;
  console.log("\nTotal:", total, "Passed:", total - failed, "Failed:", failed);
  process.exit(failed > 0 ? 1 : 0);
}

main();
