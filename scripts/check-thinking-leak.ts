#!/usr/bin/env npx tsx
/**
 * check:thinking-leak — find surfaces that render a LIVE model stream
 * outside the canonical pipeline, where chain-of-thought can print as content.
 *
 * 🚨 THE RULE (Arman, 2026-09-11): "ensure that at this point it's impossible
 * for thinking tokens to ever show up anywhere … all streaming goes through a
 * single source, and all processing is done centrally."
 *
 * The wire convention is fixed and single: every provider fences its
 * chain-of-thought as `<reasoning>…</reasoning>` INSIDE the chunk channel
 * (aidream: matrx_ai/providers/reasoning.py). The canonical pipeline —
 * MarkdownStream → StreamAwareChatMarkdown → EnhancedChatMarkdown — splits
 * those fences into collapsible thinking blocks. Anything that renders live
 * chunk text through a plain markdown component (BasicMarkdownContent /
 * ConfigurableMarkdownContent with `isStreamActive`) sees the fences as prose.
 * That is exactly how the Vision Interview LiveTurnCard and CollabCallCard
 * printed thinking as the specialist's words.
 *
 * WHAT THIS FLAGS: a `.tsx` file outside `components/mardown-display/` that
 * renders `<BasicMarkdownContent` or `<ConfigurableMarkdownContent` with an
 * `isStreamActive` prop and does NOT import `stripThinkingStreaming` (the
 * util that removes closed fences and truncates an open one).
 *
 * BLOCKING BY DESIGN — this is a class the owner ruled must be impossible.
 * Exit 1 on any finding. `--self-test` proves the check can fail.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SELF_TEST = process.argv.includes("--self-test");

const SCAN_DIRS = ["features", "components", "app"];
const CANONICAL_PIPELINE = /^components\/mardown-display\//;
const PLAIN_MARKDOWN = /<(BasicMarkdownContent|ConfigurableMarkdownContent)\b/;
// `isStreamActive={false}` is a SETTLED render (the live stream lives in a
// LiveRunDisplay beside it) — only a live-capable prop counts.
const LIVE = /\bisStreamActive\b(?!=\{false\})/;
const STRIPS = /stripThinkingStreaming/;

export interface Finding {
  file: string;
  reason: string;
}

export function checkSource(file: string, source: string): Finding | null {
  if (CANONICAL_PIPELINE.test(file)) return null;
  if (!PLAIN_MARKDOWN.test(source) || !LIVE.test(source)) return null;
  if (STRIPS.test(source)) return null;
  return {
    file,
    reason:
      "renders a live stream through a plain markdown component without stripThinkingStreaming — <reasoning> fences would print as content. Route it through MarkdownStream, or strip with stripThinkingStreaming (components/content-refine/utils/stripThinking.ts).",
  };
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

function selfTest(): void {
  const leak = checkSource(
    "features/example/LiveCard.tsx",
    `<BasicMarkdownContent content={stream.text} isStreamActive />`,
  );
  const stripped = checkSource(
    "features/example/LiveCard.tsx",
    `import { stripThinkingStreaming } from "x";\n<BasicMarkdownContent content={visible} isStreamActive />`,
  );
  const settled = checkSource(
    "features/example/Card.tsx",
    `<BasicMarkdownContent content={text} />`,
  );
  const pipeline = checkSource(
    "components/mardown-display/chat-markdown/X.tsx",
    `<BasicMarkdownContent content={t} isStreamActive />`,
  );
  const ok = leak !== null && stripped === null && settled === null && pipeline === null;
  console.log(
    ok
      ? "check:thinking-leak self-test PASSED — the check can fail on a planted leak and stays quiet on the lawful shapes."
      : "check:thinking-leak self-test FAILED — the check no longer distinguishes a leak from lawful code.",
  );
  process.exit(ok ? 0 : 1);
}

function main(): void {
  if (SELF_TEST) return selfTest();
  const findings: Finding[] = [];
  for (const dir of SCAN_DIRS) {
    for (const full of walk(join(ROOT, dir))) {
      const file = relative(ROOT, full);
      const f = checkSource(file, readFileSync(full, "utf8"));
      if (f) findings.push(f);
    }
  }
  if (findings.length === 0) {
    console.log("check:thinking-leak — no live stream renders outside the canonical pipeline.");
    return;
  }
  console.error(`check:thinking-leak — ${findings.length} surface(s) can print chain-of-thought as content:\n`);
  for (const f of findings) console.error(`  ${f.file}\n    ${f.reason}\n`);
  process.exit(1);
}

main();
