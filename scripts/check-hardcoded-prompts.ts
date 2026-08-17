#!/usr/bin/env npx tsx
/**
 * check:hardcoded-prompts — find AI agent DEFINITIONS living in this repo.
 *
 * 🚨 THE RULE (Arman, 2026-08-16, delivered in anger about this exact class):
 *
 *   "The only approved concept is to use our actual agents that are dynamically
 *   bound and controlled from the database entry and not the code base. The
 *   code base is nothing more than the connection, but not the definition and
 *   the details and can never be those things."
 *
 * The code may hold the CONNECTION — which mandate to run, how to build its
 * variables, how to render the result. It may never hold the agent's identity
 * or its rules. A prompt in code is worse than merely redundant: it drifts
 * silently from the agent that actually runs, and every copy found in the
 * 2026-08-16 purge had already diverged or was dead while reading as
 * authoritative.
 *
 * WHAT THIS FLAGS: a module-scope template-literal constant under the scanned
 * dirs whose NAME looks prompt-shaped (SYSTEM / PROMPT / INSTRUCTION /
 * PERSONA / systemContent / systemMessage) and whose BODY reads like agent
 * instructions (second-person role framing, or a prompt-ish section heading),
 * over MIN_CHARS. Also flags an inline multi-line template literal passed
 * straight into a `system:` / `instructions:` / `systemPrompt:` property, which
 * is the same violation spelled differently.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG:
 *   - short strings, single-line labels, and non-prompt-shaped names;
 *   - anything under a demo route (`app/(dev)/`) — sample code is not an agent;
 *   - test fixtures (`__tests__`, `*.test.ts`);
 *   - an allowlisted entry (see ALLOWLIST_FILE).
 *
 * TRIAGE — not every hit is the violation. Judge honestly:
 *   • an AI agent's instructions .............. VIOLATION → convert to a mandate
 *   • a starter template the USER then edits .. seed content → allowlist it
 *   • a brief copied to the clipboard for the
 *     user's own external coding agent ....... not our agent → allowlist it
 *
 * HOW TO FIX A REAL ONE: create the agent in the DB via aidream's agent-service
 * builder, declare a mandate in aidream `services/agent_slots/client_slots.py`,
 * then resolve it here (`useMandate` / `resolveMandate` /
 * `useAgentLauncher().launchMandate` / `launchAgentExecution({mandateKey})`) and
 * DELETE the constant. A "fallback prompt if the mandate is missing" is the same
 * violation in disguise — an unseeded mandate must throw.
 *
 * THE ALLOWLIST IS A RATCHET. Every entry needs a real reason. The count only
 * goes DOWN: adding an entry to silence a NEW prompt is the thing this script
 * exists to prevent. Refresh with --write only after genuinely converting or
 * genuinely triaging something.
 *
 * A reason beginning `UNRESOLVED:` means "this IS an agent definition, but its
 * removal needs a decision I do not have" — it is printed in its own loud
 * section on every run so it can never quietly become permanent. That is the
 * only honest home for a prompt that is neither converted nor exonerated.
 *
 * Loud, ADVISORY, never blocking (exit 0 always, per the repo's scream-never-
 * block rule) — except `--strict`, which exits 1 on any UNALLOWLISTED finding
 * so a deliberate gate can use it.
 *
 *   pnpm check:hardcoded-prompts
 *   pnpm check:hardcoded-prompts --json
 *   pnpm check:hardcoded-prompts --write    # refresh the allowlist (ratchet)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = join(ROOT, "scripts", "hardcoded-prompts-allowlist.json");
const SCAN_DIRS = ["features", "lib"];
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|\.git)(\/|$)/;
/** Demo sample code is not an agent definition. */
const SKIP_FILE = /(\.test\.tsx?$|\.spec\.tsx?$)/;

/** Below this, it is a label or a fragment, not a persona. */
const MIN_CHARS = 240;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

interface Finding {
  file: string;
  line: number;
  name: string;
  chars: number;
  why: string;
}

interface AllowEntry {
  file: string;
  name: string;
  reason: string;
}

// ── Shape tests ─────────────────────────────────────────────────────────────

/** A constant name that claims to be a prompt. */
const PROMPT_NAME_RE =
  /^(?:[A-Za-z_$]*(?:SYSTEM|PROMPT|INSTRUCTION|INSTRUCTIONS|PERSONA)[A-Za-z_$]*|systemContent|systemMessage|systemPrompt|instructions)$/;

/**
 * Body signals that this text is addressed TO a model as its identity or its
 * rules — the thing that makes it a definition rather than data.
 */
const BODY_SIGNALS: Array<{ re: RegExp; why: string }> = [
  {
    re: /\byou are (?:an?|the) \w/i,
    why: "second-person role framing (\"You are a/an/the …\")",
  },
  { re: /\byour (?:role|job|task|responsibilities)\b/i, why: "assigns the model a role/job" },
  { re: /^#{1,3} +(?:base )?instructions\b/im, why: "an \"Instructions\" section heading" },
  { re: /^#{1,3} +(?:core )?behaviou?rs?\b/im, why: "a \"Behaviors\" section heading" },
  { re: /^#{1,3} +(?:communication )?style\b/im, why: "a \"Style\" section heading" },
  { re: /^#{1,3} +persona\b/im, why: "a \"Persona\" section heading" },
  { re: /\bignore all previous instructions\b/i, why: "a prompt-injection preamble" },
  { re: /\bnever (?:reveal|disclose|say) (?:that )?you(?:'re| are)\b/i, why: "an identity-concealment rule" },
];

function bodyLooksLikeAgentInstructions(body: string): string | null {
  for (const { re, why } of BODY_SIGNALS) if (re.test(body)) return why;
  return null;
}

// ── Scanning ────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (SKIP_DIR.test(rel)) continue;
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !SKIP_FILE.test(entry)) out.push(full);
  }
}

/** Read a template literal starting at `open` (the backtick index). Returns its body + end index. */
function readTemplate(src: string, open: number): { body: string; end: number } | null {
  let i = open + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return { body: src.slice(open + 1, i), end: i };
    i++;
  }
  return null;
}

const DECL_RE =
  /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=\n]+)?=\s*`/g;
const PROP_RE =
  /(?:^|[\s{,(])(system|instructions|systemPrompt|system_prompt|systemInstruction|systemMessage)\s*:\s*`/g;

function scanFile(file: string): Finding[] {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const found: Finding[] = [];
  const lineOf = (idx: number) => src.slice(0, idx).split("\n").length;

  DECL_RE.lastIndex = 0;
  for (let m = DECL_RE.exec(src); m; m = DECL_RE.exec(src)) {
    const name = m[1];
    if (!PROMPT_NAME_RE.test(name)) continue;
    const open = m.index + m[0].length - 1;
    const tpl = readTemplate(src, open);
    if (!tpl || tpl.body.length < MIN_CHARS) continue;
    const why = bodyLooksLikeAgentInstructions(tpl.body);
    if (!why) continue;
    found.push({ file: rel, line: lineOf(open), name, chars: tpl.body.length, why });
  }

  PROP_RE.lastIndex = 0;
  for (let m = PROP_RE.exec(src); m; m = PROP_RE.exec(src)) {
    const open = m.index + m[0].length - 1;
    const tpl = readTemplate(src, open);
    if (!tpl || tpl.body.length < MIN_CHARS) continue;
    const why = bodyLooksLikeAgentInstructions(tpl.body);
    if (!why) continue;
    found.push({
      file: rel,
      line: lineOf(open),
      name: `${m[1]}: (inline)`,
      chars: tpl.body.length,
      why,
    });
  }

  return found;
}

// ── Allowlist ───────────────────────────────────────────────────────────────

function loadAllowlist(): AllowEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AllowEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as AllowEntry).file === "string" &&
        typeof (e as AllowEntry).name === "string" &&
        typeof (e as AllowEntry).reason === "string" &&
        (e as AllowEntry).reason.trim().length > 0,
    );
  } catch {
    return [];
  }
}

const key = (f: { file: string; name: string }) => `${f.file}::${f.name}`;

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = new Set(process.argv.slice(2));
  const asJson = args.has("--json");
  const strict = args.has("--strict");
  const write = args.has("--write");

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const findings = files.flatMap(scanFile).sort((a, b) => a.file.localeCompare(b.file));
  const allow = loadAllowlist();
  const allowed = new Map(allow.map((e) => [key(e), e]));

  const unallowed = findings.filter((f) => !allowed.has(key(f)));
  const matchedKeys = new Set(findings.map(key));
  const stale = allow.filter((e) => !matchedKeys.has(key(e)));

  if (write) {
    // RATCHET: keep only entries that still match something, and never invent
    // reasons — a newly-appearing finding must be triaged by a human/agent.
    const kept = allow.filter((e) => matchedKeys.has(key(e)));
    writeFileSync(ALLOWLIST_FILE, `${JSON.stringify(kept, null, 2)}\n`);
    console.log(
      `${C.green}✓${C.reset} allowlist rewritten: ${kept.length} entries (${stale.length} stale removed).`,
    );
    if (unallowed.length > 0) {
      console.log(
        `${C.yellow}!${C.reset} ${unallowed.length} finding(s) remain UNALLOWLISTED — --write never adds entries. Convert them, or add an entry with a real reason by hand.`,
      );
    }
    return;
  }

  if (asJson) {
    console.log(
      JSON.stringify({ findings, unallowed, allowlisted: findings.length - unallowed.length, stale }, null, 2),
    );
    return;
  }

  console.log(
    `\n${C.bold}${C.white}HARDCODED AGENT DEFINITIONS${C.reset} ${C.dim}(check:hardcoded-prompts)${C.reset}`,
  );
  console.log(
    `${C.dim}The code is the CONNECTION, never the definition. Scanned ${files.length} files in ${SCAN_DIRS.join(", ")}.${C.reset}\n`,
  );

  if (unallowed.length === 0) {
    console.log(
      `${C.green}✓ No unallowlisted agent definitions in code.${C.reset} ${C.dim}(${allow.length} allowlisted, triaged as not-an-agent-definition.)${C.reset}`,
    );
  } else {
    console.log(
      `${C.red}${C.bold}✗ ${unallowed.length} prompt-shaped constant(s) with no allowlist entry${C.reset}\n`,
    );
    for (const f of unallowed) {
      console.log(`  ${C.cyan}${f.file}:${f.line}${C.reset}`);
      console.log(
        `    ${C.bold}${f.name}${C.reset} ${C.dim}— ${f.chars} chars; ${f.why}${C.reset}`,
      );
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} put the agent in the DB, declare a mandate in aidream`,
    );
    console.log(
      `  ${C.dim}services/agent_slots/client_slots.py, resolve it here (useMandate /${C.reset}`,
    );
    console.log(
      `  ${C.dim}launchMandate / launchAgentExecution({mandateKey})), and DELETE the constant.${C.reset}`,
    );
    console.log(
      `  ${C.dim}Genuinely not an agent definition (user-editable seed content, a brief for${C.reset}`,
    );
    console.log(
      `  ${C.dim}the user's own external agent)? Add it to ${relative(ROOT, ALLOWLIST_FILE)} WITH a reason.${C.reset}`,
    );
  }

  const unresolved = findings.filter((f) =>
    allowed.get(key(f))?.reason.startsWith("UNRESOLVED:"),
  );
  if (unresolved.length > 0) {
    console.log(
      `\n${C.yellow}${C.bold}${unresolved.length} agent definition(s) still in code, awaiting a decision${C.reset}`,
    );
    console.log(
      `${C.dim}Allowlisted as UNRESOLVED — a real violation whose removal needs a ruling, NOT an exoneration.${C.reset}\n`,
    );
    for (const f of unresolved) {
      console.log(`  ${C.cyan}${f.file}:${f.line}${C.reset} ${C.bold}${f.name}${C.reset}`);
      console.log(
        `    ${C.dim}${allowed.get(key(f))!.reason.replace(/^UNRESOLVED:\s*/, "")}${C.reset}`,
      );
    }
  }

  if (stale.length > 0) {
    console.log(
      `\n${C.yellow}${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"}${C.reset} ${C.dim}(no longer match anything — the ratchet moved). Run --write to drop them.${C.reset}`,
    );
    for (const e of stale) console.log(`  ${C.dim}${e.file} :: ${e.name}${C.reset}`);
  }

  console.log("");
  process.exit(strict && unallowed.length > 0 ? 1 : 0);
}

main();
