#!/usr/bin/env npx tsx
/**
 * check:server-pipeline — ONE request pipeline to the Python server.
 *
 * P9c (2026-10-02). Every call to the AI Matrx Python server rides the core
 * pipeline in `@ai-matrx/agents/matrx` (`call.ts`: URL, body, execution,
 * NDJSON, the one error classifier) through this app's host doors —
 * `lib/python-client.ts`, `lib/api/call-api.ts`, `lib/api/matrx-transport.ts`,
 * `lib/api/stream-parser.ts`, and the chat package's bare-host default. The
 * census before this guard found ~60 files that resolved the server's base URL
 * themselves and called `fetch` on it, and a dozen hand-rolled NDJSON readers;
 * each one had drifted (no organization header, "HTTP 500" for the server's own
 * sentence, a torn final line dropped, an abort reported as a failure).
 *
 * WHAT THIS FLAGS, per shipped file outside the doors:
 *   url-fetch     — the file names a server base-URL source (the resolvers, the
 *                   env names, the production host) AND makes a raw network call
 *                   (`fetch(`, `resilientFetch(`, `XMLHttpRequest`, `EventSource`).
 *   ndjson-parse  — the file reads a body stream (`getReader(`) AND splits it on
 *                   newlines AND `JSON.parse`s the lines.
 * Comments are stripped first, so documentation never trips it.
 *
 * NOT SCANNED: tests, `scripts/**` (node CLIs; their copies are parked work),
 * and the doors themselves.
 *
 * BASELINE THAT ONLY SHRINKS: `scripts/server-pipeline-allowlist.json` names the
 * files allowed to match, each with its reason. A finding not in the list FAILS;
 * a listed entry that no longer matches FAILS too (delete it — the list only
 * shrinks). Entries prefixed `pending:` are copies still to migrate; any other
 * reason is a permanent exception (the call is not the Python server).
 *
 * Exit 1 on any finding. `--self-test` plants a copy in a scratch tree and
 * proves the check goes red, then green once it is removed.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "packages",
  // @ai-matrx/chat's source, in the aidream checkout beside this repo (P27). Its frozen
  // rewrite under `src/compat/` is not app code.
  "../aidream/apps/shared/chat/src",
  "providers",
  "utils",
];

/** The host doors: the only files that may resolve the server and call it. */
export const DOORS: ReadonlySet<string> = new Set([
  "lib/python-client.ts",
  "lib/api/call-api.ts",
  "lib/api/matrx-transport.ts",
  "lib/api/stream-parser.ts",
  "lib/api/resolve-service-url.ts",
  "lib/api/service-routing.ts",
  "lib/api/endpoints.ts",
  "lib/redux/slices/apiConfigSlice.ts",
  "../aidream/apps/shared/chat/src/host/defaults/server-api.ts",
]);

export const ALLOWLIST_PATH = "scripts/server-pipeline-allowlist.json";

export type Rule = "url-fetch" | "ndjson-parse";

const BASE_URL_SOURCE =
  /\b(?:selectResolvedBaseUrl|selectResolvedServiceBaseUrl|resolveBaseUrl|resolveBaseUrlForPath|resolveFilesBaseUrl|resolveServiceBaseUrl|resolveBackendForConversation|resolveBaseUrlForConversation|BACKEND_URLS|AIDREAM_PRODUCTION_URL|NEXT_PUBLIC_BACKEND_URL\w*|productionUrl|backendBase|backendUrl|serverUrl|baseUrl)\b|server\.app\.matrxserver\.com/;

const RAW_NETWORK_CALL =
  /(?:^|[^\w.$])fetch\s*\(|\b(?:globalThis|window|self)\.fetch\s*\(|\bresilientFetch\s*\(|\bnew\s+XMLHttpRequest\b|\bnew\s+EventSource\s*\(/m;

const READS_BODY_STREAM = /\.getReader\s*\(/;
const SPLITS_ON_NEWLINE =
  /\.(?:split|indexOf|lastIndexOf)\s*\(\s*(?:"\\n"|'\\n'|`\\n`|\/\\r\?\\n\/|\/\\n\/)/;
const PARSES_JSON = /\bJSON\.parse\s*\(/;

/**
 * Strip `//` and block comments, keeping string and template-literal contents
 * (so `"https://…"` survives) and line structure (so line numbers hold).
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (quote !== "`" && source[i] === "\n") break;
        out += source[i];
        i += 1;
      }
      if (i < n) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function isScanned(relPath: string): boolean {
  if (!/\.(?:ts|tsx|mts|js|mjs)$/.test(relPath)) return false;
  if (/(?:^|\/)__tests__\//.test(relPath)) return false;
  if (/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(relPath)) return false;
  if (/\.d\.ts$/.test(relPath)) return false;
  if (relPath.includes("/node_modules/") || relPath.includes("/.matrx/")) return false;
  return !DOORS.has(relPath);
}

/** The rules one file breaks (empty when it is clean, a door, or not scanned). */
export function rulesBroken(relPath: string, source: string): Rule[] {
  if (!isScanned(relPath)) return [];
  const code = stripComments(source);
  const rules: Rule[] = [];
  if (BASE_URL_SOURCE.test(code) && RAW_NETWORK_CALL.test(code)) {
    rules.push("url-fetch");
  }
  if (
    READS_BODY_STREAM.test(code) &&
    SPLITS_ON_NEWLINE.test(code) &&
    PARSES_JSON.test(code)
  ) {
    rules.push("ndjson-parse");
  }
  return rules;
}

function walk(root: string, dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (rel === "../aidream/apps/shared/chat/src/compat") continue;
    const full = join(root, rel);
    if (statSync(full).isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
}

export interface AllowEntry {
  rules: Rule[];
  reason: string;
}

export interface ScanResult {
  newFindings: string[];
  staleEntries: string[];
  matched: Map<string, Rule[]>;
}

export function scan(
  root: string,
  allowlist: Record<string, AllowEntry>,
): ScanResult {
  const matched = new Map<string, Rule[]>();
  for (const dir of SCAN_DIRS) {
    const files: string[] = [];
    walk(root, dir, files);
    for (const rel of files) {
      if (!isScanned(rel)) continue;
      const rules = rulesBroken(rel, readFileSync(join(root, rel), "utf8"));
      if (rules.length) matched.set(rel, rules);
    }
  }
  const newFindings: string[] = [];
  for (const [rel, rules] of matched) {
    const allowed = allowlist[rel]?.rules ?? [];
    for (const rule of rules) {
      if (!allowed.includes(rule)) newFindings.push(`${rel}  [${rule}]`);
    }
  }
  const staleEntries: string[] = [];
  for (const [rel, entry] of Object.entries(allowlist)) {
    const now = matched.get(rel) ?? [];
    for (const rule of entry.rules) {
      if (!now.includes(rule)) staleEntries.push(`${rel}  [${rule}]`);
    }
  }
  return { newFindings, staleEntries, matched };
}

function loadAllowlist(root: string): Record<string, AllowEntry> {
  const raw = JSON.parse(readFileSync(join(root, ALLOWLIST_PATH), "utf8")) as {
    entries: Record<string, AllowEntry>;
  };
  return raw.entries;
}

function report(result: ScanResult, label: string): boolean {
  const pending = [...result.matched.keys()].length;
  if (result.newFindings.length === 0 && result.staleEntries.length === 0) {
    console.log(
      `${label} PASSED — no new copy of the server request pipeline (${pending} listed file(s) still match; the list only shrinks).`,
    );
    return true;
  }
  if (result.newFindings.length) {
    console.error(
      `${label} FAILED — ${result.newFindings.length} new place(s) build a Python-server URL and fetch it, or parse its NDJSON, outside the host doors.`,
    );
    console.error(
      "Remedy: call the server through lib/python-client (getJson / postJson / postNdjson / requestRaw / postMultipart / downloadBlob), callApi, or the chat host's server port; parse streams with parseNdjsonStream / parseMatrxNdjsonResponse; read errors with getUserMessage / extractMatrxErrorCode (@ai-matrx/agents/matrx).",
    );
    for (const finding of result.newFindings) console.error(`  ${finding}`);
  }
  if (result.staleEntries.length) {
    console.error(
      `${label} FAILED — ${result.staleEntries.length} allowlist entr(y/ies) no longer match. Delete them from ${ALLOWLIST_PATH}: the list only shrinks.`,
    );
    for (const entry of result.staleEntries) console.error(`  ${entry}`);
  }
  return false;
}

function plant(root: string, rel: string, body: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

function selfTest(): void {
  const root = mkdtempSync(join(tmpdir(), "server-pipeline-self-test-"));
  try {
    plant(
      root,
      "features/clean/service.ts",
      [
        'import { getJson, postNdjson } from "@/lib/python-client";',
        "// We used to do fetch(`${resolveBaseUrl()}/x`) and split('\\n') here.",
        "export const read = () => getJson('/x');",
        "export const stream = (b: unknown) => postNdjson('/y', b);",
        "export const open = () => fetch('/api/sandbox/1');",
      ].join("\n"),
    );
    plant(
      root,
      "lib/python-client.ts",
      "export const go = () => fetch(`${resolveBaseUrl()}/x`);",
    );
    plant(
      root,
      "features/clean/service.test.ts",
      "fetch(`${AIDREAM_PRODUCTION_URL}/x`);",
    );
    const cleanAllowlist: Record<string, AllowEntry> = {};

    const green = scan(root, cleanAllowlist);
    if (green.newFindings.length || green.staleEntries.length) {
      console.error(
        "check:server-pipeline self-test FAILED — a clean tree (door calls, a comment, a Next route fetch, the door itself, a test) was flagged:",
        green.newFindings,
      );
      exitAfterDrain(1);
    }

    plant(
      root,
      "features/copy/service.ts",
      [
        'import { resolveBaseUrl } from "@/lib/python-client";',
        "export async function read() {",
        "  const res = await fetch(`${resolveBaseUrl()}/rag/x`);",
        "  return res.json();",
        "}",
      ].join("\n"),
    );
    plant(
      root,
      "features/copy/stream.ts",
      [
        "export async function* lines(res: Response) {",
        "  const reader = res.body!.getReader();",
        '  let buf = "";',
        "  const parts = buf.split(\"\\n\");",
        "  for (const p of parts) yield JSON.parse(p);",
        "}",
      ].join("\n"),
    );
    const red = scan(root, cleanAllowlist);
    const caughtUrl = red.newFindings.includes(
      "features/copy/service.ts  [url-fetch]",
    );
    const caughtNdjson = red.newFindings.includes(
      "features/copy/stream.ts  [ndjson-parse]",
    );
    if (!caughtUrl || !caughtNdjson || red.newFindings.length !== 2) {
      console.error(
        "check:server-pipeline self-test FAILED — the planted copies were not both caught:",
        red.newFindings,
      );
      exitAfterDrain(1);
    }

    const stale = scan(root, {
      ...cleanAllowlist,
      "features/copy/service.ts": { rules: ["url-fetch"], reason: "pending: x" },
      "features/copy/stream.ts": { rules: ["ndjson-parse"], reason: "pending: x" },
      "features/gone.ts": { rules: ["url-fetch"], reason: "pending: x" },
    });
    if (stale.newFindings.length || stale.staleEntries.length !== 1) {
      console.error(
        "check:server-pipeline self-test FAILED — a listed copy was not admitted, or a stale entry was not reported:",
        stale,
      );
      exitAfterDrain(1);
    }

    rmSync(join(root, "features/copy"), { recursive: true, force: true });
    const greenAgain = scan(root, cleanAllowlist);
    if (greenAgain.newFindings.length || greenAgain.staleEntries.length) {
      console.error(
        "check:server-pipeline self-test FAILED — removing the planted copies did not turn it green:",
        greenAgain,
      );
      exitAfterDrain(1);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(
    "check:server-pipeline self-test PASSED — a clean tree is green; a planted URL-building fetch and a planted NDJSON reader go red; a stale allowlist entry is reported; removing the copies turns it green.",
  );
  exitAfterDrain(0);
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag > -1 ? process.argv[rootFlag + 1] : process.cwd();
  const result = scan(root, loadAllowlist(process.cwd()));
  if (process.argv.includes("--list")) {
    for (const [rel, rules] of result.matched) console.log(`${rel}\t${rules.join(",")}`);
  }
  exitAfterDrain(report(result, "check:server-pipeline") ? 0 : 1);
}

main();
