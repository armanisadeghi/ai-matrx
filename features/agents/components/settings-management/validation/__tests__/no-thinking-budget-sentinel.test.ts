/**
 * Guard: nothing in this repo writes `thinking_budget = -1` any more.
 *
 * The retired sentinel meant five different things by target (OpenAI off,
 * Anthropic "think at 1024", Gemini 2.5 dynamic thinking — settings-
 * translation R1 §3). Hiding thoughts is `include_thoughts: false`; thinking
 * off is `reasoning_effort: "none"`; not set is an absent key.
 *
 * Part 1 scans every shipped source root for a writer. Part 2 proves the
 * scanner goes RED on a planted writer (in a temp directory — never by
 * mutating a real file) and stays green on the legitimate shapes.
 * Part 3 proves the validation fix for a stored -1 removes it.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateConfig } from "../engine";
import { resolveConfig } from "../resolve-config";
import { applyAllFixableIssues, canFixIssue } from "../apply-fix";
import type { FeLlmParams } from "@ai-matrx/chat/agents/types/agent-api-types";

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");
const SOURCE_ROOTS = [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "../aidream/apps/shared/chat/src",
  "utils",
];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** A negative thinking budget assigned, passed, or keyed — any spelling. */
const WRITER_PATTERNS: RegExp[] = [
  // thinking_budget: -1 / "thinking_budget": -1 / thinking_budget = -1 / ["thinking_budget"] = -1
  /\bthinking_?[bB]udget["'\]]*\s*[:=]\s*-\s*\d/,
  // setKey(settings, "thinking_budget", -1) / { key: "thinking_budget", value: -1 }
  /["']thinking_budget["']\s*,\s*(?:value\s*:\s*)?-\s*\d/,
];

export function findSentinelWriters(
  root: string,
  dirs: string[],
): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!EXTENSIONS.has(path.extname(entry.name))) continue;
      if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((text, i) => {
        const code = text.replace(/\/\/.*$/, ""); // a comment is not a writer
        if (WRITER_PATTERNS.some((re) => re.test(code))) {
          hits.push({ file: path.relative(root, full), line: i + 1, text: text.trim() });
        }
      });
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return hits;
}

describe("no thinking_budget -1 writer remains", () => {
  it("the shipped source has zero writers", () => {
    const hits = findSentinelWriters(REPO_ROOT, SOURCE_ROOTS);
    expect(hits).toEqual([]);
  });

  it("goes red on a planted writer and green on legitimate shapes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-guard-"));
    try {
      fs.mkdirSync(path.join(tmp, "features"));
      const planted = [
        'return setKey(settings, "thinking_budget", -1);',
        "const next = { ...s, thinking_budget: -1 };",
        'settings["thinking_budget"] = -1;',
        "const thinkingBudget = -1;",
      ];
      fs.writeFileSync(path.join(tmp, "features", "planted.ts"), planted.join("\n"));
      fs.writeFileSync(
        path.join(tmp, "features", "fine.ts"),
        [
          "const next = { ...s, include_thoughts: false };",
          'const off = { ...s, reasoning_effort: "none" };',
          "const budget = { thinking_budget: 1024 };",
          "if (thinkingBudget >= 0) run();",
          "// thinking_budget: -1 used to mean hidden thoughts",
        ].join("\n"),
      );
      const hits = findSentinelWriters(tmp, ["features"]);
      expect(hits.map((h) => h.line).sort()).toEqual([1, 2, 3, 4]);
      expect(hits.every((h) => h.file === path.join("features", "planted.ts"))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("a stored -1 is flagged and the fix returns it to not set", () => {
  const controls = {
    thinking_budget: { type: "integer", min: 1024, max: 32000 },
    include_thoughts: { type: "boolean" },
    rawControls: {},
    unmappedControls: {},
  } as never;

  it("include_thoughts:false alone raises nothing and writes nothing", () => {
    const settings = { include_thoughts: false, thinking_budget: 8000 } as unknown as FeLlmParams;
    const result = validateConfig(resolveConfig(settings, "m", controls, null));
    expect(result.issues.filter((i) => i.key === "thinking_budget")).toEqual([]);
    const fixed = applyAllFixableIssues(result.issues, settings, controls);
    expect(fixed).toEqual({ include_thoughts: false, thinking_budget: 8000 });
  });

  it("a stored -1 is removed (absent), never rewritten to another number", () => {
    const settings = { include_thoughts: false, thinking_budget: -1 } as unknown as FeLlmParams;
    const result = validateConfig(resolveConfig(settings, "m", controls, null));
    const sentinel = result.issues.find(
      (i) => i.ruleId === "thinking-budget-retired-sentinel",
    );
    expect(sentinel).toBeDefined();
    expect(canFixIssue(sentinel!, controls)).toBe(true);
    const fixed = applyAllFixableIssues([sentinel!], settings, controls) as Record<string, unknown>;
    expect("thinking_budget" in fixed).toBe(false);
    expect(fixed.include_thoughts).toBe(false);
  });
});
