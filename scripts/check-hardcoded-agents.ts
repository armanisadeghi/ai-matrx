#!/usr/bin/env npx tsx
/**
 * check:hardcoded-agents — find raw AGENT IDs living in this repo.
 *
 * 🚨 THE RULE (CLAUDE.md § Platform laws; features/mandates/FEATURE.md):
 * an agent's definition lives in the DATABASE; the codebase is only the
 * connection. A raw agent UUID in code is the same violation as a prompt in
 * code spelled shorter: it pins a surface to ONE agent forever, the admin
 * mandate console cannot rebind it, and it silently drifts from the agent the
 * platform actually runs. The legal form is a mandate — `useMandate` /
 * `launchMandate` / `launchAgentExecution({ mandateKey })` — resolved at run
 * time. Sibling guard for prompts: scripts/check-hardcoded-prompts.ts. This is
 * the frontend half of common-docs/systems/intelligence/mandates/REGISTER.md row X4.
 *
 * WHAT THIS FLAGS: a v4 UUID literal under the scanned dirs that is USED AS AN
 * AGENT ID — either (a) the literal sits in an identifier/property whose name
 * is agent-shaped (`agentId`, `agent_id`, `promptId`, `defaultAgentId`,
 * `*_AGENT_ID`, `*_AGENT`), or (b) it sits inside a call to one of the agent
 * execution entry points (`launchAgentExecution`, `launchAgent`,
 * `createManualInstance`, `useRunAgent`, `executeAgent`).
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG (the documented legal postures):
 *   1. a `SEED MIRROR` marker comment (case-insensitive) within SEED_MIRROR_WINDOW lines above the
 *      literal — static module-scope data that cannot resolve a mandate and
 *      that nothing reads at run time (FEATURE.md "manifest seed-mirror
 *      ruling"). The marker is the contract: it says "mirror of the mandate's
 *      system default, not a second authority".
 *   2. `defaultAgentId:` inside features/surfaces/manifests/** — manifests are
 *      seeded into `ui_surface_agent_role` and are seed mirrors by ruling.
 *   3. an entry in the reason-required allowlist (ALLOWLIST_FILE).
 *   Also skipped: tests, `types/`, `.next`, node_modules, demo routes
 *   (`app/(dev)/`) — sample code is not a wired surface.
 *
 * HOW TO FIX A REAL ONE: declare a mandate in aidream
 * `services/mandates/client_slots.py` (seeded with this very id as its system
 * default), resolve it here, and DELETE the literal. If the id must stay as
 * static seed data, say so with a `SEED MIRROR` comment directly above it —
 * that comment is a promise that no runtime path reads it.
 *
 * THE BASELINE IS A RATCHET. `scripts/hardcoded-agents-baseline.json` holds
 * the sites that existed when the guard was built; the count only goes DOWN.
 * A site not in the baseline and not allowlisted is NEW and exits 1 — loud,
 * but nothing runs this at commit time (no hook, no CI); it runs when you run
 * it or via `pnpm check:release-gates` (advisory mode there).
 * `--write` rewrites the baseline to the sites STILL present (never adds); with
 * no baseline file yet it seeds one from the current state.
 *
 *   pnpm check:hardcoded-agents
 *   pnpm check:hardcoded-agents --json
 *   pnpm check:hardcoded-agents --write    # ratchet the baseline down / seed it
 *   pnpm check:hardcoded-agents --self-test  # each model-choice rule fires on a planted line
 *
 * SECOND SCAN — HARD-CODED MODEL CHOICES (added 2026-09-25, BYPASS-CENSUS
 * frontend-features / frontend-rest). A raw MODEL picked in code is the same
 * violation as a raw agent id: the mandate cannot rebind it. Each rule below
 * names one bypass that was converted; a match anywhere in the scanned tree
 * (comments excluded, `app/(dev)/` excluded) exits 1 — there is no baseline,
 * every one of these is at zero. Rules: MODEL_CHOICE_RULES.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = join(ROOT, "scripts", "hardcoded-agents-allowlist.json");
const BASELINE_FILE = join(ROOT, "scripts", "hardcoded-agents-baseline.json");
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "utils", "actions"];
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|__mocks__|\.git|types)(\/|$)|^app\/\(dev\)\//;
const SKIP_FILE = /(\.test\.tsx?$|\.spec\.tsx?$|\.d\.ts$)/;

/** Lines above the literal in which a `SEED MIRROR` marker exonerates it. */
const SEED_MIRROR_WINDOW = 10;
const SEED_MIRROR_RE = /seed[ -]?mirror/i;
const MANIFEST_DIR_RE = /^features\/surfaces\/manifests\//;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const AGENT_NAME_RE = /agent(?:_|-)?id|agentId|promptId|defaultAgentId|AGENT_ID|_AGENT\b/i;
const ENTRY_POINT_RE =
  /\b(launchAgentExecution|launchAgent|createManualInstance|useRunAgent|executeAgent)\s*\(/g;

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

interface Site {
  file: string;
  line: number;
  symbol: string;
  uuid: string;
}

interface AllowEntry {
  file: string;
  /** The identifier/property name the literal sits in, or the UUID itself. */
  name: string;
  reason: string;
}

interface BaselineEntry {
  file: string;
  symbol: string;
  uuid: string;
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
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry) && !SKIP_FILE.test(entry)) out.push(full);
  }
}

/** The identifier the literal is assigned to / keyed under, looking at this line and the one above. */
function symbolFor(lines: string[], lineIdx: number, col: number): string | null {
  const before = lines[lineIdx].slice(0, col);
  const here = /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:\(|\[)?\s*["'`]?$/.exec(before);
  if (here) return here[1];
  // `agentId:\n    "uuid"` / `const X_AGENT_ID =\n  "uuid"`
  if (/^\s*["'`]?$/.test(before) && lineIdx > 0) {
    const prev = /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:\(|\[)?\s*$/.exec(lines[lineIdx - 1]);
    if (prev) return prev[1];
  }
  return null;
}

/** Name of the agent entry-point call the literal sits inside, if any. */
function enclosingEntryPoint(src: string, idx: number): string | null {
  ENTRY_POINT_RE.lastIndex = 0;
  let best: string | null = null;
  for (let m = ENTRY_POINT_RE.exec(src); m && m.index < idx; m = ENTRY_POINT_RE.exec(src)) {
    const between = src.slice(m.index + m[0].length, idx);
    let depth = 1;
    for (const ch of between) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0) break;
    }
    if (depth > 0) best = m[1];
  }
  return best;
}

interface ScanResult {
  violations: Site[];
  seedMirrors: Site[];
  manifestDefaults: Site[];
}

function scanFile(file: string, out: ScanResult): void {
  const src = readFileSync(file, "utf8");
  if (!/-4[0-9a-f]{3}-/.test(src)) return; // cheap pre-filter
  const rel = relative(ROOT, file);
  const lines = src.split("\n");
  const lineOf = (idx: number) => src.slice(0, idx).split("\n").length;

  UUID_RE.lastIndex = 0;
  for (let m = UUID_RE.exec(src); m; m = UUID_RE.exec(src)) {
    const uuid = m[0];
    const lineNo = lineOf(m.index);
    const lineIdx = lineNo - 1;
    const lineStart = src.lastIndexOf("\n", m.index - 1) + 1;
    const col = m.index - lineStart;
    const lineText = lines[lineIdx];

    // Literal must be a string literal, not a comment / URL fragment.
    const quoteBefore = /["'`]$/.test(src.slice(lineStart, m.index).replace(/\s+$/, "")) ||
      src[m.index - 1] === '"' || src[m.index - 1] === "'" || src[m.index - 1] === "`";
    if (!quoteBefore) continue;
    const trimmed = lineText.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    let symbol = symbolFor(lines, lineIdx, col);
    let isAgent = symbol !== null && AGENT_NAME_RE.test(symbol);
    if (!isAgent && AGENT_NAME_RE.test(lineText.slice(0, col))) {
      // e.g. `agentId: someFlag ? "uuid" : other` — the key is earlier on the line
      const k = /([A-Za-z_$][\w$]*(?:agent(?:_|-)?id|agentId|promptId|defaultAgentId|AGENT_ID|_AGENT)[\w$]*)/i.exec(
        lineText.slice(0, col),
      );
      if (k) {
        symbol = k[1];
        isAgent = true;
      }
    }
    if (!isAgent) {
      const ep = enclosingEntryPoint(src, m.index);
      if (ep) {
        symbol = symbol ? `${ep}(${symbol})` : `${ep}(…)`;
        isAgent = true;
      }
    }
    if (!isAgent) continue;

    const site: Site = { file: rel, line: lineNo, symbol: symbol ?? "(unnamed)", uuid };

    if (MANIFEST_DIR_RE.test(rel) && symbol === "defaultAgentId") {
      out.manifestDefaults.push(site);
      continue;
    }
    const windowStart = Math.max(0, lineIdx - SEED_MIRROR_WINDOW);
    const above = lines.slice(windowStart, lineIdx + 1).join("\n");
    if (SEED_MIRROR_RE.test(above)) {
      out.seedMirrors.push(site);
      continue;
    }
    out.violations.push(site);
  }
}

// ── Hard-coded model choices ────────────────────────────────────────────────

interface ModelRule {
  id: string;
  re: RegExp;
  /** Files (repo-relative) where the pattern is the sanctioned adapter, not a choice. */
  allowFiles?: string[];
  fix: string;
}

export const MODEL_CHOICE_RULES: ModelRule[] = [
  {
    id: "xai-realtime-socket-literal",
    re: /["'`]wss:\/\/api\.x\.ai/,
    fix: "the realtime socket URL is the token broker credential's `endpoint` (features/voice-agent/transport/tokenManager.ts), never a literal.",
  },
  {
    id: "xai-realtime-model-literal",
    re: /["'`]grok-voice[\w.-]*["'`]/,
    allowFiles: ["features/voice-agent/realtimeModel.ts"],
    fix: "the voice session model comes from the voice mandate's Holder agent (features/voice-agent/realtimeModel.ts). Rebind the mandate; add a wire-name row there only for a new catalog model.",
  },
  {
    id: "observational-memory-model-override",
    re: /\bmemory_model\s*=(?!=)|\bMEMORY_MODEL_NAMES\b/,
    fix: "the Observer/Reflector model is the server's observational-memory mandate's Holder; the client never sends `memory_model`.",
  },
  {
    id: "embedding-lab-in-product",
    re: /\bGoogleEmbeddingLab\b/,
    allowFiles: ["features/rag/components/GoogleEmbeddingLab.tsx"],
    fix: "the Google embedding lab picks a raw embedding model and is DEV-ONLY: mount it only under app/(dev)/ (see app/(dev)/demos/embedding-lab).",
  },
  {
    id: "google-session-model-literal",
    re: /["'`](?:gemini-[\w.-]*live[\w.-]*|gemini-[\w.-]*native-audio[\w.-]*|gemini-robotics[\w.-]*|lyria-[\w.-]*|deep-research-[\w.-]*|antigravity-[\w.-]*|gemini-embedding-[\w.-]*)["'`]/,
    allowFiles: [
      "features/rag/api/google-embeddings.ts",
      "features/rag/components/GoogleEmbeddingLab.tsx",
      // OPEN BYPASS (2026-09-25): the research topic's Google background agents still
      // send a raw model — their managed-agent models are not agent-assignable, so no
      // mandate Holder can be born yet (BYPASS-CENSUS frontend-features). Remove these
      // two entries in the change that converts them.
      "features/research/service/google-background.ts",
      "features/research/components/agents/GoogleBackgroundAgentCard.tsx",
    ],
    fix: "Gemini Live, Lyria music and the Google background agents run their MANDATE's Holder model, resolved on aidream (services/google_specialized.py: voice.gemini_live, audio.live_music, research_client.google_*). The client sends a job/mandate key, never a model. (Embedding lab files are the dev-only exception.)",
  },
  {
    id: "direct-provider-sdk-import",
    re: /from\s+["'](?:openai|@anthropic-ai\/sdk|@ai-sdk\/[\w-]+|@google\/genai|@google\/generative-ai|groq-sdk)["']/,
    fix: "no provider SDK in the frontend — every AI call goes through a mandate on aidream (POST /ai/mandates/{key}). Deleted 2026-09-25: lib/ai/providers, lib/ai/adapters, actions/ai.ts, actions/quiz.ts, app/api/generate-quiz.",
  },
];

export interface ModelChoiceSite {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** Non-comment lines of `src` that match a rule. Exported for the self-test. */
export function scanModelChoices(rel: string, src: string): ModelChoiceSite[] {
  const hits: ModelChoiceSite[] = [];
  const lines = src.split("\n");
  let inBlock = false;
  lines.forEach((raw, i) => {
    let text = raw;
    if (inBlock) {
      const end = text.indexOf("*/");
      if (end === -1) return;
      text = text.slice(end + 2);
      inBlock = false;
    }
    const t = text.trimStart();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      return;
    }
    const code = text.replace(/\s\/\/\s.*$/, "");
    for (const rule of MODEL_CHOICE_RULES) {
      if (rule.allowFiles?.includes(rel)) continue;
      if (rule.re.test(code)) hits.push({ file: rel, line: i + 1, rule: rule.id, text: raw.trim() });
    }
  });
  return hits;
}

function selfTest(): void {
  const planted: Record<string, string> = {
    "xai-realtime-socket-literal": 'const U = "wss://api.x.ai/v1/realtime";',
    "xai-realtime-model-literal": 'const M = "grok-voice-latest";',
    "observational-memory-model-override": 'request.memory_model = "google/gemini-2.5-flash";',
    "embedding-lab-in-product": 'import { GoogleEmbeddingLab } from "@/features/rag/components/GoogleEmbeddingLab";',
    "google-session-model-literal": 'const client = createGoogleRealtimeClient("live", { model: "gemini-3.1-flash-live-preview" });',
    "direct-provider-sdk-import": 'import { google } from "@ai-sdk/google";',
  };
  let failed = 0;
  for (const rule of MODEL_CHOICE_RULES) {
    const line = planted[rule.id];
    const fired = line ? scanModelChoices("features/x/planted.ts", line).some((h) => h.rule === rule.id) : false;
    const commented = line ? scanModelChoices("features/x/planted.ts", `// ${line}`).length === 0 : false;
    const ok = fired && commented;
    if (!ok) failed++;
    console.log(`${ok ? C.green + "✓" : C.red + "✗"}${C.reset} ${rule.id} ${C.dim}(fires on plant: ${fired}; silent in a comment: ${commented})${C.reset}`);
  }
  exitAfterDrain(failed > 0 ? 1 : 0);
}

// ── Allowlist / baseline ────────────────────────────────────────────────────

function loadJsonArray<T>(file: string, isEntry: (e: unknown) => e is T): T[] | null {
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

const isAllow = (e: unknown): e is AllowEntry =>
  !!e &&
  typeof e === "object" &&
  typeof (e as AllowEntry).file === "string" &&
  typeof (e as AllowEntry).name === "string" &&
  typeof (e as AllowEntry).reason === "string" &&
  (e as AllowEntry).reason.trim().length > 0;

const isBaseline = (e: unknown): e is BaselineEntry =>
  !!e &&
  typeof e === "object" &&
  typeof (e as BaselineEntry).file === "string" &&
  typeof (e as BaselineEntry).symbol === "string" &&
  typeof (e as BaselineEntry).uuid === "string";

const siteKey = (s: { file: string; symbol: string; uuid: string }) => `${s.file}::${s.symbol}::${s.uuid}`;
const fmt = (s: Site) => `${s.file}:${s.line}  ${s.symbol}  ${s.uuid}`;

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = new Set(process.argv.slice(2));
  const asJson = args.has("--json");
  const write = args.has("--write");
  if (args.has("--self-test")) return selfTest();

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  const result: ScanResult = { violations: [], seedMirrors: [], manifestDefaults: [] };
  for (const f of files) scanFile(f, result);
  const modelChoices: ModelChoiceSite[] = [];
  for (const f of files) modelChoices.push(...scanModelChoices(relative(ROOT, f), readFileSync(f, "utf8")));
  const failing = (n: number) => n > 0 || modelChoices.length > 0;
  const bySite = (a: Site, b: Site) => a.file.localeCompare(b.file) || a.line - b.line;
  result.violations.sort(bySite);

  const allow = loadJsonArray(ALLOWLIST_FILE, isAllow) ?? [];
  const allowed = new Map<string, AllowEntry>();
  for (const e of allow) {
    allowed.set(`${e.file}::${e.name}`, e);
  }
  const allowEntryFor = (s: Site) =>
    allowed.get(`${s.file}::${s.symbol}`) ?? allowed.get(`${s.file}::${s.uuid}`);

  const live = result.violations.filter((s) => !allowEntryFor(s));
  const allowlisted = result.violations.filter((s) => !!allowEntryFor(s));
  const liveKeys = new Set(live.map(siteKey));
  const allowMatched = new Set(allowlisted.flatMap((s) => [`${s.file}::${s.symbol}`, `${s.file}::${s.uuid}`]));
  const staleAllow = allow.filter((e) => !allowMatched.has(`${e.file}::${e.name}`));

  const baseline = loadJsonArray(BASELINE_FILE, isBaseline);
  const baselineKeys = new Set((baseline ?? []).map(siteKey));
  const newSites = baseline ? live.filter((s) => !baselineKeys.has(siteKey(s))) : live;
  const staleBaseline = (baseline ?? []).filter((e) => !liveKeys.has(siteKey(e)));

  if (write) {
    // RATCHET: with a baseline, keep only entries still live (never add). With
    // no baseline, seed one from the current state.
    const kept: BaselineEntry[] = baseline
      ? (baseline.filter((e) => liveKeys.has(siteKey(e))))
      : live.map(({ file, symbol, uuid }) => ({ file, symbol, uuid }));
    writeFileSync(BASELINE_FILE, `${JSON.stringify(kept, null, 2)}\n`);
    console.log(
      `${C.green}✓${C.reset} baseline ${baseline ? "ratcheted" : "seeded"}: ${kept.length} site(s)` +
        (baseline ? ` (${staleBaseline.length} removed).` : "."),
    );
    if (baseline && newSites.length > 0) {
      console.log(
        `${C.yellow}!${C.reset} ${newSites.length} NEW site(s) remain outside the baseline — --write never adds. Convert them to a mandate, mark a SEED MIRROR, or allowlist with a reason.`,
      );
    }
    return;
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          files: files.length,
          live,
          newSites,
          allowlisted,
          seedMirrors: result.seedMirrors,
          manifestDefaults: result.manifestDefaults,
          staleBaseline,
          staleAllow,
          modelChoices,
        },
        null,
        2,
      ),
    );
    exitAfterDrain(failing(newSites.length) ? 1 : 0);
  }

  console.log(
    `\n${C.bold}${C.white}HARDCODED AGENT IDS${C.reset} ${C.dim}(check:hardcoded-agents)${C.reset}`,
  );
  console.log(
    `${C.dim}An agent's definition lives in the DB; the code is the connection. Scanned ${files.length} files in ${SCAN_DIRS.join(", ")}.${C.reset}\n`,
  );

  if (!baseline) {
    console.log(
      `${C.yellow}No baseline yet${C.reset} ${C.dim}(${relative(ROOT, BASELINE_FILE)}). Every live site counts as NEW until one is seeded: pnpm check:hardcoded-agents --write${C.reset}\n`,
    );
  }

  if (newSites.length === 0) {
    console.log(
      `${C.green}✓ No NEW hardcoded agent ids.${C.reset} ${C.dim}(${live.length} baselined, ${allowlisted.length} allowlisted, ${result.seedMirrors.length} SEED MIRROR, ${result.manifestDefaults.length} manifest defaultAgentId)${C.reset}`,
    );
  } else {
    console.log(
      `${C.red}${C.bold}✗ ${newSites.length} NEW raw agent id site(s) — not in the baseline, not allowlisted${C.reset}\n`,
    );
    for (const s of newSites) console.log(`  ${C.cyan}${fmt(s)}${C.reset}`);
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} declare a mandate in aidream services/mandates/client_slots.py seeded`,
    );
    console.log(`  ${C.dim}with this id, resolve it here (useMandate / launchMandate /${C.reset}`);
    console.log(`  ${C.dim}launchAgentExecution({mandateKey})), and DELETE the literal.${C.reset}`);
    console.log(
      `  ${C.dim}Static seed data nothing reads at run time? Put a \`SEED MIRROR\` comment within ${SEED_MIRROR_WINDOW} lines above it.${C.reset}`,
    );
    console.log(
      `  ${C.dim}Genuinely not an agent id? Add it to ${relative(ROOT, ALLOWLIST_FILE)} WITH a reason.${C.reset}`,
    );
  }

  const baselined = live.filter((s) => baselineKeys.has(siteKey(s)));
  if (baselined.length > 0) {
    console.log(
      `\n${C.yellow}${C.bold}${baselined.length} baselined site(s) still in code${C.reset} ${C.dim}— known debt, the ratchet only goes down${C.reset}`,
    );
    for (const s of baselined) console.log(`  ${C.dim}${fmt(s)}${C.reset}`);
  }

  if (staleBaseline.length > 0) {
    console.log(
      `\n${C.green}${staleBaseline.length} baseline entr${staleBaseline.length === 1 ? "y" : "ies"} no longer match${C.reset} ${C.dim}— the ratchet moved. Run --write to lock it in.${C.reset}`,
    );
    for (const e of staleBaseline) console.log(`  ${C.dim}${e.file}  ${e.symbol}  ${e.uuid}${C.reset}`);
  }
  if (staleAllow.length > 0) {
    console.log(
      `\n${C.yellow}${staleAllow.length} stale allowlist entr${staleAllow.length === 1 ? "y" : "ies"}${C.reset} ${C.dim}(no longer match anything). Remove by hand.${C.reset}`,
    );
    for (const e of staleAllow) console.log(`  ${C.dim}${e.file} :: ${e.name}${C.reset}`);
  }

  if (modelChoices.length === 0) {
    console.log(
      `\n${C.green}✓ No hard-coded model choices.${C.reset} ${C.dim}(${MODEL_CHOICE_RULES.length} rules: ${MODEL_CHOICE_RULES.map((r) => r.id).join(", ")})${C.reset}`,
    );
  } else {
    console.log(`\n${C.red}${C.bold}✗ ${modelChoices.length} hard-coded model choice site(s)${C.reset}`);
    for (const h of modelChoices) {
      const rule = MODEL_CHOICE_RULES.find((r) => r.id === h.rule);
      console.log(`  ${C.cyan}${h.file}:${h.line}${C.reset}  ${h.rule}  ${C.dim}${h.text.slice(0, 120)}${C.reset}`);
      if (rule) console.log(`    ${C.yellow}Fix:${C.reset} ${C.dim}${rule.fix}${C.reset}`);
    }
  }

  console.log("");
  exitAfterDrain(failing(newSites.length) ? 1 : 0);
}

// Run only when invoked directly — the self-test/red proofs import the scanner.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
