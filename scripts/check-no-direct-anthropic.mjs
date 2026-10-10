#!/usr/bin/env node
// Guard: the frontend never calls Anthropic itself and never holds an Anthropic key.
//
// Why (2026-10-09): matrx-frontend's .env.local carried its own Anthropic key and next.config.js
// inlined ANTHROPIC_API_KEY into the build `env`. A call made with it reaches the provider without
// passing aidream, so it is billed and never recorded (an Admin API reconciliation found ~$3 on
// 2026-10-09 against that key with no execution row). Every Claude call goes through aidream.
//
//   node scripts/check-no-direct-anthropic.mjs            # scan tracked files
//   node scripts/check-no-direct-anthropic.mjs --self-test
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RULES = [
  [/from\s+["']@anthropic-ai\/sdk["']|require\(\s*["']@anthropic-ai\/sdk["']\s*\)/, "imports the Anthropic SDK"],
  [/from\s+["']@ai-sdk\/anthropic["']/, "imports the AI SDK Anthropic provider"],
  [/api\.anthropic\.com\/v1\//, "calls an Anthropic endpoint directly"],
  [/process\.env\.(NEXT_PUBLIC_)?ANTHROPIC_API_KEY/, "reads an Anthropic key"],
];
const SELF = "scripts/check-no-direct-anthropic.mjs";

export function findings(path, text) {
  if (path === SELF) return [];
  const out = [];
  text.split("\n").forEach((line, i) => {
    for (const [re, why] of RULES) if (re.test(line)) out.push(`${path}:${i + 1}: ${why}`);
  });
  return out;
}

function selfTest() {
  const bad = findings("app/api/x/route.ts", 'import Anthropic from "@anthropic-ai/sdk";\nconst k = process.env.ANTHROPIC_API_KEY;');
  const good = findings("app/api/x/route.ts", 'await fetch(`${SERVER}/ai/agents/${id}`);');
  const ok = bad.length === 2 && good.length === 0;
  console.log(`self-test: ${ok ? "PASS" : "FAIL"}`);
  return ok ? 0 : 1;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs", ":!node_modules", ":!.scratch"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\n").filter((f) => f && !f.includes("node_modules/"));
  const all = files.flatMap((f) => { try { return findings(f, readFileSync(f, "utf8")); } catch { return []; } });
  for (const f of all) console.log(`FAIL ${f}`);
  console.log(all.length ? `${all.length} direct Anthropic use(s) — route the call through aidream` : "PASS: no direct Anthropic use in the frontend");
  return all.length ? 1 : 0;
}
process.exit(main());
