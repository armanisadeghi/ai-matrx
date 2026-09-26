#!/usr/bin/env npx tsx
/**
 * check:one-door — A SOURCE IS WRITTEN THROUGH THE DOOR.
 *
 * SOURCE-CONVERGENCE §3: every Source (`docproc.processed_documents`) and its
 * portions (`docproc.processed_document_pages`) are written by the landing
 * door (`POST /sources/land`, `/sources/{id}/keep`, `/sources/{id}/edit`). A
 * client that inserts or rewrites those rows directly skips the door's
 * dedupe, versioning (`manual_curation` keeps the original), ledger and
 * processing policy — and the server is locking both tables to door-only
 * writes, so such a call would also start failing for real people.
 *
 * WHAT THIS FLAGS, under `features/` and `app/` (tests and `.d.ts` skipped):
 * a supabase-js chain on `.from("processed_documents")` or
 * `.from("processed_document_pages")` that calls `.insert(` / `.upsert(` /
 * `.delete(`, or `.update(` with anything other than an object literal whose
 * every key is a client-writable column:
 *
 *   processed_documents       deleted_at · name · metadata · archived_at
 *   processed_document_pages  (none)
 *
 * `.update(patch)` with a variable is a finding: the guard cannot see which
 * columns it writes, so neither can a reviewer.
 *
 * ALLOWLIST: `ALLOWED_FILES` below — a file and the reason it may still write
 * directly. Every entry is printed on every run (a debt, never a silent pass).
 *
 *   pnpm check:one-door
 *   pnpm check:one-door --self-test   # proves the matcher flags and passes
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["features", "app"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__snapshots__"]);

const WRITABLE: Record<string, ReadonlySet<string>> = {
  processed_documents: new Set(["deleted_at", "name", "metadata", "archived_at"]),
  processed_document_pages: new Set(),
};

/** Files that still write directly, and why. Printed every run. */
const ALLOWED_FILES: Record<string, string> = {
  "features/pdf/services/saveDerivative.ts":
    "inserts a derived PDF's lineage row (parent_processed_id + derivation_kind); the door has no derivative route yet — owned by the server lane's door-only-grants item",
};

export interface Finding {
  file: string;
  line: number;
  table: string;
  verb: string;
  detail: string;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
}

/** The object literal's top-level keys, or null when the argument is not a literal. */
function literalKeys(arg: string): string[] | null {
  const trimmed = arg.trim();
  if (!trimmed.startsWith("{")) return null;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = trimmed.slice(1, end);
  const keys: string[] = [];
  let d = 0;
  let token = "";
  for (const c of body) {
    if (c === "{" || c === "(" || c === "[") d++;
    if (c === "}" || c === ")" || c === "]") d--;
    if (c === "," && d === 0) {
      keys.push(token);
      token = "";
    } else token += c;
  }
  if (token.trim()) keys.push(token);
  return keys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      if (k.startsWith("...")) return "...spread";
      const m = /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*(:|$)/.exec(k);
      return m ? m[1] : k;
    });
}

export function scanSource(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const fromRe = /\.from\(\s*["'](processed_documents|processed_document_pages)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source))) {
    const table = m[1];
    // The chain: from here to the end of the statement (a `;` at depth 0), capped.
    const rest = source.slice(m.index + m[0].length, m.index + m[0].length + 1500);
    let depth = 0;
    let stop = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") {
        depth--;
        if (depth < 0) {
          stop = i;
          break;
        }
      } else if (c === ";" && depth === 0) {
        stop = i;
        break;
      }
    }
    const chain = rest.slice(0, stop);
    const verb = /\.(insert|upsert|delete|update)\(/.exec(chain);
    if (!verb) continue;
    const line = source.slice(0, m.index).split("\n").length;
    const name = verb[1];
    if (name !== "update") {
      findings.push({ file, line, table, verb: name, detail: `.${name}() on docproc.${table}` });
      continue;
    }
    const arg = chain.slice(verb.index + verb[0].length);
    const keys = literalKeys(arg);
    if (!keys) {
      findings.push({
        file,
        line,
        table,
        verb: name,
        detail: `.update(<non-literal>) on docproc.${table} — the columns it writes cannot be seen`,
      });
      continue;
    }
    const bad = keys.filter((k) => !WRITABLE[table].has(k));
    if (bad.length) {
      findings.push({ file, line, table, verb: name, detail: `.update() writes ${bad.join(", ")} on docproc.${table}` });
    }
  }
  return findings;
}

function selfTest(): void {
  const cases: Array<[string, number]> = [
    [`db.from("processed_document_pages").update(patch).eq("id", x);`, 1],
    [`db.from("processed_document_pages").update({ raw_text: t }).eq("id", x);`, 1],
    [`db.from("processed_documents").insert({ name: "a" });`, 1],
    [`db.from("processed_documents").update({ deleted_at: now }).eq("id", x).select("id");`, 0],
    [`db.from("processed_documents").update({ name: n, metadata: m }).eq("id", x);`, 0],
    [`db.from("processed_documents").update({ kept_at: n }).eq("id", x);`, 1],
    [`db.from("processed_documents").select("id").eq("id", x);`, 0],
  ];
  let failed = 0;
  for (const [src, expected] of cases) {
    const got = scanSource("self-test.ts", src).length;
    if (got !== expected) {
      failed++;
      console.error(`self-test FAIL: expected ${expected}, got ${got} for: ${src}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`check:one-door self-test — PASS (${cases.length} cases)`);
}

function main(): void {
  if (process.argv.includes("--self-test")) return selfTest();
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  const findings: Finding[] = [];
  const allowed: string[] = [];
  for (const full of files) {
    const rel = relative(ROOT, full);
    const src = readFileSync(full, "utf8");
    if (!src.includes("processed_document")) continue;
    const found = scanSource(rel, src);
    if (!found.length) continue;
    if (ALLOWED_FILES[rel]) {
      allowed.push(`  ${rel} — ${ALLOWED_FILES[rel]}`);
      continue;
    }
    findings.push(...found);
  }
  if (allowed.length) {
    console.log(`check:one-door — ${allowed.length} allowlisted direct writer(s) (debt, printed every run):`);
    for (const a of allowed) console.log(a);
  }
  if (findings.length) {
    console.error(`check:one-door — FAIL: ${findings.length} direct write(s) to a Source outside the door:`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.detail}`);
    console.error("Write Sources through the door: POST /sources/land, /sources/{id}/keep, /sources/{id}/edit (features/sources/api/sourcesApi.ts).");
    process.exit(1);
  }
  console.log("check:one-door — PASS: no direct Source writes outside the allowlisted columns.");
}

main();
