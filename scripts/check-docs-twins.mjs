#!/usr/bin/env node
/**
 * check-docs-twins — docs must not TEACH what the code guard forbids.
 *
 * `check-package-twins` refuses a local re-definition of a collapsed
 * @ai-matrx export in source. Twice on 2026-09-07 a doc or skill was found
 * still showing the hand-rolled recipe (`supabase.channel(...)`, a
 * `formatDuration` body) as the thing to copy — so the next agent re-creates
 * the twin the code guard then has to catch. This scans every Markdown file
 * and skill/command body for FENCED CODE that defines a collapsed export or
 * hand-wires a Supabase realtime channel, and fails loudly with the package
 * that owns it. Prose mentions are fine; only fenced code counts.
 *
 *   node scripts/check-docs-twins.mjs            # strict
 *   node scripts/check-docs-twins.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = path.join(ROOT, "scripts", "package-twins.json");

const HAND_WIRED = [
  { re: /\bsupabase(?:\(\))?\s*\.\s*channel\s*\(/, owner: "@ai-matrx/realtime (declare a namespace + useChannel / manager.open)" },
  { re: /\.on\(\s*["']postgres_changes["']/, owner: "@ai-matrx/realtime (pg-changes binding with onBackfill)" },
  { re: /\bcreate(?:Browser|Server)Client\s*\(/, owner: "@ai-matrx/data/next (createNextSupabase)" },
];

function collapsedNames() {
  const reg = JSON.parse(fs.readFileSync(REGISTER, "utf8"));
  const names = Array.isArray(reg) ? reg.map((r) => (typeof r === "string" ? r : r.name)) : Object.keys(reg.exports ?? reg);
  return names.filter(Boolean);
}

function docFiles() {
  const out = execFileSync("git", ["ls-files", "*.md", ".claude/skills/**/*.md", ".claude/commands/*"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(out.split("\n").filter(Boolean))].filter((f) => !f.includes("node_modules/") && !f.startsWith("CHANGELOG"));
}

function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(```|~~~)/.exec(lines[i]);
    if (m && !open) open = { fence: m[1], start: i + 1, body: [] };
    else if (m && open && lines[i].trim().startsWith(open.fence)) { blocks.push(open); open = null; }
    else if (open) open.body.push({ n: i + 1, s: lines[i] });
  }
  return blocks;
}

function scan(files, names) {
  const defRe = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var)\\s+(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const b of fencedBlocks(text)) {
      for (const { n, s } of b.body) {
        const d = defRe.exec(s);
        if (d) hits.push({ f, n, s: s.trim(), owner: `a collapsed @ai-matrx export (${d[1]}) — import it, never re-define it in a recipe` });
        for (const h of HAND_WIRED) if (h.re.test(s)) hits.push({ f, n, s: s.trim(), owner: h.owner });
      }
    }
  }
  return hits;
}

const names = collapsedNames();
if (process.argv.includes("--self-test")) {
  const planted = `# t\n\n\`\`\`ts\nconst ch = supabase.channel("x").on("postgres_changes", {}, () => {});\nexport function ${names[0] ?? "formatDuration"}() {}\n\`\`\`\n`;
  const tmp = path.join(ROOT, "scripts", ".docs-twins-selftest.md");
  fs.writeFileSync(tmp, planted);
  try {
    const hits = scan([path.relative(ROOT, tmp)], names);
    if (hits.length < 2) { console.error("check-docs-twins self-test FAILED — planted recipe was not caught"); process.exit(1); }
    console.log(`check-docs-twins self-test PASSED (it can fail) — ${hits.length} planted hit(s) caught.`);
  } finally { fs.rmSync(tmp, { force: true }); }
  process.exit(0);
}

const files = docFiles();
const hits = scan(files, names);
if (hits.length) {
  console.error(`check-docs-twins: ${hits.length} doc recipe(s) teach a pattern the package owns:\n`);
  for (const h of hits) console.error(`  ${h.f}:${h.n}  ${h.s.slice(0, 100)}\n      → ${h.owner}`);
  console.error("\nRewrite the snippet to the package API (read its README) or replace it with a pointer to the package doc.");
  process.exit(1);
}
console.log(`check-docs-twins OK — ${files.length} doc file(s) scanned, no fenced recipe re-defines a collapsed export or hand-wires a Supabase channel.`);
