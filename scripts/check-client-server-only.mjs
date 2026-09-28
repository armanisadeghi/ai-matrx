#!/usr/bin/env node
/**
 * check:client-server-only — a "use client" file never imports a VALUE from a
 * module marked `import "server-only"`.
 *
 * Why: the type check cannot see it and `next.config.js` ignores build type
 * errors, so the first signal is a failed production build. On 2026-09-27 a
 * pricing card imported a constant from its server-only loader and the release
 * had to be repaired (26f87c7c7d). Type-only imports are fine (erased).
 *
 * Server-only = marked `import "server-only"`, imports `next/headers` or
 * `next/cache`, or (transitively, through value imports) imports such a
 * module — the shipped case was client card → loader → utils/supabase/server →
 * next/headers. A client file importing `next/headers` / `next/cache` itself is
 * flagged too. A `"use server"` module is the Server Actions door and stays
 * allowed: the bundler hands the client a reference, never the module body.
 * (next/cache added 2026-09-27: it subclasses the Fetch `Request` at import.)
 * Aliases: `@/` = repo root;
 * relative paths resolved against the importer; extensions .ts/.tsx/.js/.mjs
 * and /index.*.
 *
 *   node scripts/check-client-server-only.mjs [paths…]   exit 1 on any finding
 *   node scripts/check-client-server-only.mjs --self-test proves it can fail
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXTS = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

/** Source with leading whitespace, line comments and block comments removed. */
function stripLeadingComments(src) {
  return src.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, "");
}

function isClient(src) {
  const head = stripLeadingComments(src);
  return /^["']use client["']/.test(head);
}

/** Framework entry points that only run on the server. */
const SERVER_ONLY_PACKAGES = ["next/headers", "next/cache"];

/** A module that can only run on the server by itself. */
function isServerOnlyMarker(src) {
  return (
    /^\s*import\s+["']server-only["'];?/m.test(src) ||
    valueImports(src).some(({ spec }) => SERVER_ONLY_PACKAGES.includes(spec))
  );
}

function resolve(root, importer, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(importer), spec);
  else return null;
  if (existsSync(base) && /\.[mc]?[jt]sx?$/.test(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** Value (non-type) imports of a file: [{ spec, line }]. */
function valueImports(src) {
  const out = [];
  const re = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) continue;
    const clause = m[2].trim();
    const braces = clause.match(/\{([\s\S]*)\}/);
    const hasDefaultOrNs = !clause.startsWith("{") || /\*\s+as\s+/.test(clause);
    const namedValues = braces
      ? braces[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type "))
      : [];
    if (hasDefaultOrNs || namedValues.length) {
      out.push({ spec: m[3], line: src.slice(0, m.index).split("\n").length });
    }
  }
  return out;
}

export function scan(root, files) {
  const findings = [];
  const cache = new Map();
  // Returns the chain that makes `file` server-only, or null.
  const serverOnly = (file, depth = 0) => {
    if (cache.has(file)) return cache.get(file);
    cache.set(file, null); // cycle guard
    const src = readFileSync(file, "utf8");
    let chain = null;
    // A "use server" module is a Server Actions door — callable from the client by design.
    if (/^["']use server["']/.test(stripLeadingComments(src))) chain = null;
    else if (isServerOnlyMarker(src)) chain = [file];
    else if (depth < 6 && !isClient(src)) {
      for (const { spec } of valueImports(src)) {
        const target = resolve(root, file, spec);
        const sub = target && serverOnly(target, depth + 1);
        if (sub) {
          chain = [file, ...sub];
          break;
        }
      }
    }
    cache.set(file, chain);
    return chain;
  };
  for (const rel of files) {
    const file = path.join(root, rel);
    const src = readFileSync(file, "utf8");
    if (!isClient(src)) continue;
    for (const { spec, line } of valueImports(src)) {
      if (SERVER_ONLY_PACKAGES.includes(spec)) {
        findings.push(`${rel}:${line} — a client component imports a value from ${spec}, which only runs on the server. Call it from a "use server" action instead.`);
        continue;
      }
      const target = resolve(root, file, spec);
      const chain = target && serverOnly(target);
      if (chain)
        findings.push(`${rel}:${line} — a client component imports a value from a server-only module (${chain.map((f) => path.relative(root, f)).join(" → ")}). Move the shared value to a module with no server imports (or import it as a type).`);
    }
  }
  return findings;
}

function listFiles(root, paths) {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.split("\n").filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f) && !f.includes("node_modules/"));
}

if (process.argv.includes("--self-test")) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "client-server-only-"));
  mkdirSync(path.join(dir, "f"), { recursive: true });
  writeFileSync(path.join(dir, "f/loader.ts"), 'import "server-only";\nexport const FLAG = true;\nexport type Data = { a: 1 };\n');
  writeFileSync(path.join(dir, "f/bad.tsx"), '"use client";\nimport { FLAG } from "./loader";\nexport const x = FLAG;\n');
  writeFileSync(path.join(dir, "f/ok.tsx"), '"use client";\nimport type { Data } from "./loader";\nimport { type Data as D2 } from "@/f/loader";\nexport type X = Data | D2;\n');
  writeFileSync(path.join(dir, "f/server.tsx"), 'import { FLAG } from "./loader";\nexport const y = FLAG;\n');
  writeFileSync(path.join(dir, "f/db.ts"), 'import { cookies } from "next/headers";\nexport const db = cookies;\n');
  writeFileSync(path.join(dir, "f/load2.ts"), 'import { db } from "@/f/db";\nexport const LIMIT = 3;\nexport const get = db;\n');
  writeFileSync(path.join(dir, "f/bad2.tsx"), '"use client";\nimport { LIMIT } from "./load2";\nexport const z = LIMIT;\n');
  // next/cache is server-only too (it subclasses the Fetch `Request` at import time).
  writeFileSync(path.join(dir, "f/tags.ts"), 'import { revalidateTag } from "next/cache";\nexport const TAG = "t";\nexport const bust = () => revalidateTag(TAG);\n');
  writeFileSync(path.join(dir, "f/bad3.tsx"), '"use client";\nimport { TAG } from "./tags";\nexport const t = TAG;\n');
  writeFileSync(path.join(dir, "f/bad4.tsx"), '"use client";\nimport { updateTag } from "next/cache";\nexport const u = updateTag;\n');
  // A "use server" module is the Server Actions door: a client calling it stays allowed.
  writeFileSync(path.join(dir, "f/actions.ts"), '"use server";\nimport { updateTag } from "next/cache";\nimport { cookies } from "next/headers";\nexport async function act() { await cookies(); updateTag("t"); }\n');
  writeFileSync(path.join(dir, "f/ok2.tsx"), '"use client";\nimport { act } from "./actions";\nexport const a = act;\n');
  const findings = scan(dir, ["f/bad.tsx", "f/ok.tsx", "f/server.tsx", "f/bad2.tsx", "f/bad3.tsx", "f/bad4.tsx", "f/ok2.tsx"]);
  const ok =
    findings.length === 4 &&
    findings[0].startsWith("f/bad.tsx:2") &&
    findings[1].startsWith("f/bad2.tsx:2") &&
    findings[1].includes("f/load2.ts → f/db.ts") &&
    findings[2].startsWith("f/bad3.tsx:2") &&
    findings[2].includes("f/tags.ts") &&
    findings[3].startsWith("f/bad4.tsx:2") &&
    findings[3].includes("next/cache");
  console.log(ok ? "SELF-TEST PASS: flags direct and transitive client value imports of server-only code (server-only, next/headers, next/cache); a \"use server\" door stays allowed" : `SELF-TEST FAIL: ${JSON.stringify(findings)}`);
  process.exit(ok ? 0 : 1);
}

const root = process.cwd();
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const findings = scan(root, listFiles(root, args.length ? args : ["app", "components", "features", "lib", "hooks", "providers", "utils"]));
for (const f of findings) console.log(`ERROR ${f}`);
console.log(findings.length ? `\n${findings.length} client → server-only value import(s).` : "Client/server-only boundary OK.");
process.exit(findings.length ? 1 : 0);
