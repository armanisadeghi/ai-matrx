#!/usr/bin/env node
/**
 * check-owner-words.mjs — protect the words Arman wrote himself (Pattern Patrol P14).
 *
 * WHY (Arman, 2026-09-30): "the few custom-written texts that I wrote will get removed because
 * ai is really bad at gauging real value … anything written by ai will always sound 'better'
 * than the real, human guidance that is actually useful." Round 1 proved it: a placeholder
 * carrying his own expert ruling ("CRT and TV are consumer signals; enterprise is where the money
 * is…") was shortened by an agent and had to be restored. Git authorship cannot find his words —
 * agents commit everything under his name — so this checks the text against what he actually
 * TYPED (Claude Code transcripts) and his own documents (common-docs inbox + VISION docs).
 *
 * Every unit whose text overlaps his words is marked `owner_words`. Review never fixes such a unit:
 * it decides only whether the overlap is his guidance (→ keep.json) or text he
 * pasted to complain about (→ normal sweep, citing the message).
 *
 * Usage:
 *   node scripts/interface-text/check-owner-words.mjs <units.json> [-o marked.json]
 *   node scripts/interface-text/check-owner-words.mjs --refresh     rebuild the corpus cache now
 *   node scripts/interface-text/check-owner-words.mjs --self-test
 * Corpus cache: ~/.cache/matrx/owner-words.txt (rebuilt when older than 12 hours). Needs this Mac's
 * transcripts — a run without them says so loudly and marks nothing as safe.
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const CACHE_DIR = join(homedir(), ".cache", "matrx");
const CACHE = join(CACHE_DIR, "owner-words.txt");
const TRANSCRIPTS = join(homedir(), ".claude", "projects");
const EXTRACTOR = resolve(HERE, "../../../common-docs/meta/scripts/transcript_user_messages.py");
const OWNER_DOCS = [resolve(HERE, "../../../common-docs/inbox")];
const VISION_ROOT = resolve(HERE, "../../../common-docs/systems");
const SINCE = "2026-06-01";
const MAX_AGE_MS = 12 * 3600 * 1000;

export const norm = (t) => String(t).normalize("NFKC").toLowerCase()
  .replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const shingles = (t) => { const w = norm(t.replace(/…/g, " ")).split(" "); const out = []; for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(" ")); return out; };

/** Overlap of `text` with the corpus: null, or {frac, hits, context}. Needs ≥2 shared 5-word runs covering ≥20%. */
export function ownerOverlap(text, corpus) {
  const sh = shingles(text);
  if (sh.length === 0) return null;
  const hit = sh.filter((s) => corpus.includes(s));
  const frac = hit.length / sh.length;
  if (hit.length < 2 || frac < 0.2) return null;
  const i = corpus.indexOf(hit[0]);
  return { frac: Math.round(frac * 100) / 100, hits: hit.length, context: corpus.slice(Math.max(0, i - 220), i + 260) };
}

function walk(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out); else if (pred(p)) out.push(p);
  }
  return out;
}

function buildCorpus() {
  if (!existsSync(TRANSCRIPTS) || !existsSync(EXTRACTOR)) {
    console.error(`owner-words: transcripts (${TRANSCRIPTS}) or extractor (${EXTRACTOR}) missing — cannot protect Arman's words on this machine. Treat every finding as unprotected and route deletions to his review page.`);
    process.exit(2);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const since = new Date(SINCE).getTime();
  const files = walk(TRANSCRIPTS, (p) => p.endsWith(".jsonl") && !p.includes("/subagents/") && statSync(p).mtimeMs >= since);
  let text = "";
  for (let i = 0; i < files.length; i += 300) {
    const out = join(CACHE_DIR, `owner-words-part.md`);
    try {
      execFileSync("python3", [EXTRACTOR, ...files.slice(i, i + 300), "--since", SINCE, "-o", out, "--force"], { stdio: "ignore", maxBuffer: 1 << 26 });
      text += " " + readFileSync(out, "utf8");
    } catch { /* a chunk with no person-typed turns writes nothing */ }
  }
  for (const f of [...OWNER_DOCS.flatMap((d) => walk(d, (p) => p.endsWith(".md"))), ...walk(VISION_ROOT, (p) => p.endsWith("/VISION.md"))]) {
    try { text += " " + readFileSync(f, "utf8"); } catch { /* unreadable doc */ }
  }
  writeFileSync(CACHE, norm(text));
  console.error(`owner-words: corpus rebuilt from ${files.length} transcripts + owner docs → ${CACHE}`);
}

function corpus() {
  if (ARGS.includes("--refresh") || !existsSync(CACHE) || Date.now() - statSync(CACHE).mtimeMs > MAX_AGE_MS) buildCorpus();
  return readFileSync(CACHE, "utf8");
}

function selfTest() {
  const c = norm("he said: crt and tv are consumer signals enterprise is where the money is and the word free massively reduces value");
  const mine = ownerOverlap("CRT and TV are consumer signals; enterprise is where the money is. The word free massively reduces value…", c);
  const other = ownerOverlap("Every system agent the platform runs, with its bindings and versions.", c);
  if (!mine || other) { console.error(`self-test FAILED — his words ${mine ? "found" : "MISSED"}, unrelated text ${other ? "WRONGLY matched" : "clean"}`); process.exit(3); }
  console.log("self-test passed — the 2026-09-30 restored placeholder is recognised as his; unrelated text is not.");
}

if (process.argv[1] && process.argv[1].endsWith("check-owner-words.mjs")) {
  if (ARGS.includes("--self-test")) { selfTest(); process.exit(0); }
  const C = corpus();
  if (ARGS.includes("--refresh") && !ARGS.some((a) => a.endsWith(".json"))) process.exit(0);
  const inPath = ARGS.find((a) => a.endsWith(".json") && !a.startsWith("-"));
  const oi = ARGS.indexOf("-o");
  if (!inPath) { console.error("usage: check-owner-words.mjs <units.json> [-o marked.json]"); process.exit(2); }
  const data = JSON.parse(readFileSync(inPath, "utf8"));
  const units = data.units ?? data;
  let n = 0;
  for (const u of units) {
    const o = ownerOverlap(u.text ?? u.before ?? "", C);
    if (o) { u.owner_words = o; n++; console.log(`OWNER WORDS  ${u.id ?? u.file}  (${o.frac})\n   "${(u.text ?? u.before).slice(0, 140)}"\n   …${o.context.slice(0, 220)}…`); }
  }
  if (oi >= 0) writeFileSync(ARGS[oi + 1], JSON.stringify(data.units ? data : units, null, 1));
  console.log(`\nowner-words: ${n} of ${units.length} unit(s) overlap Arman's own words — Review routes these to him, never to a fixer.`);
}
