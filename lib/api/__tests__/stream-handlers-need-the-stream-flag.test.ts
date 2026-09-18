/**
 * A STREAM HANDLER WITHOUT `stream: true` IS A HANDLER THAT NEVER RUNS.
 *
 * `callApi` branches on `config.stream` (call-api.ts, "const result =
 * config.stream ? await executeStreamingRequest(...)"). Only that branch parses
 * NDJSON and calls `onStreamEvent`. A call that passes a handler and forgets
 * the flag therefore does the request, pays for it, buffers the body, throws
 * every event away, and hands the caller its "nothing came back" path.
 *
 * FOUND LIVE, TWICE, ON 2026-09-15:
 *
 *  * The Triad game's deal: the server streamed a full deck of ten cards and
 *    the screen said "The cards didn't come back."
 *  * The chat-import AI shortlist, which had carried the same omission since it
 *    shipped: the server streamed its picks and the dialog told the Expert
 *    "No standout conversations found — pick the ones you know matter."
 *
 * Both are the same defect, and the second is worse than the first because it
 * reads as an ANSWER rather than a failure. So this is a census, not a fix: it
 * reads every call site in the repo and fails naming any that pairs a stream
 * handler with a missing or false flag.
 *
 * PLANT THE BUG: delete `stream: true` from
 * `features/masterwork/triad/service.ts` and this test names that file.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Every tracked source file that mentions a stream handler. */
function candidateFiles(): string[] {
  const out = execFileSync(
    "git",
    ["grep", "-l", "-E", "onStreamEvent|consumeStream", "--", "*.ts", "*.tsx"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

/**
 * The `callApi({ ... })` object literals in one file, as source text.
 *
 * Deliberately a brace-counting scan rather than a regex: a nested object in a
 * body (which every one of these has) ends the match early for anything
 * cheaper, and a census that silently matches half a call site is worse than
 * no census at all.
 */
function callApiLiterals(source: string): string[] {
  const literals: string[] = [];
  const opener = /callApi(?:<[^>]*>)?\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    let depth = 1;
    let index = opener.lastIndex;
    while (index < source.length && depth > 0) {
      const ch = source[index];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      index += 1;
    }
    literals.push(source.slice(opener.lastIndex, index));
  }
  return literals;
}

/** Keys of THIS literal, ignoring anything nested inside it. */
function topLevelKeys(literal: string): Set<string> {
  const keys = new Set<string>();
  let depth = 0;
  const key = /(^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g;
  // Walk once, tracking depth, and only take keys at depth 0 of the literal.
  let index = 0;
  while (index < literal.length) {
    const ch = literal[index];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (depth === 0) {
      key.lastIndex = index;
      const hit = key.exec(literal);
      if (hit && hit.index === index) {
        keys.add(hit[2]);
        index = key.lastIndex;
        continue;
      }
    }
    index += 1;
  }
  return keys;
}

describe("every callApi that handles stream events asks for the stream", () => {
  it("names any call site that pairs a handler with a missing stream flag", () => {
    const offenders: string[] = [];
    for (const file of candidateFiles()) {
      if (file.startsWith("lib/api/")) continue; // callApi's own source + tests
      const source = readFileSync(join(process.cwd(), file), "utf8");
      for (const literal of callApiLiterals(source)) {
        const keys = topLevelKeys(literal);
        const handles = keys.has("onStreamEvent") || keys.has("consumeStream");
        if (!handles) continue;
        if (!keys.has("stream")) {
          offenders.push(`${file}: a stream handler with no \`stream\` key`);
          continue;
        }
        if (/(^|[,{\s])stream\s*:\s*false/.test(literal)) {
          offenders.push(`${file}: a stream handler with \`stream: false\``);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("can fail — a handler without the flag is caught", () => {
    // The self-test: the same predicate over a literal that carries the defect.
    const literal = `
      path: "/masterworks/triads",
      method: "POST",
      body: { rulebook_id: id, seen_prompts: [] },
      onStreamEvent: (event) => { read(event); },
    `;
    const keys = topLevelKeys(literal);
    expect(keys.has("onStreamEvent")).toBe(true);
    expect(keys.has("stream")).toBe(false);
  });
});
