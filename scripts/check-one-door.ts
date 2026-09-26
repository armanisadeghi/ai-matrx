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
 * AND — a Source's body is read and changed through the Source. Research's
 * `research.rs_content` row points at its Source (`processed_document_id`)
 * once the page landed; its `content` / `original_content` columns are
 * research's own copy, which only a page NOT yet a Source may use. A chain on
 * `.from("rs_content")` is flagged when it
 *   - inserts or upserts (research bodies are created by the server), or
 *   - `.update()`s with a non-literal, or writes `content` /
 *     `original_content` (clearing `original_content: null` — retiring the
 *     research copy — is allowed), or
 *   - `.select()`s `*` or `content` / `original_content`,
 * unless the chain itself carries `.is("processed_document_id", null)` — the
 * query then cannot touch a page that is a Source. Everything else reads the
 * body through `GET /research/topics/{t}/sources/{s}/content` and edits it
 * with `POST /sources/{id}/edit` / `/restore` (features/research/service.ts).
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
  const entries = literalEntries(arg);
  return entries ? entries.map(([k]) => k) : null;
}

/** The object literal's top-level `[key, value text]` pairs, or null when not a literal. */
function literalEntries(arg: string): Array<[string, string]> | null {
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
    .map((k): [string, string] => {
      if (k.startsWith("...")) return ["...spread", ""];
      const m = /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*(:|$)/.exec(k);
      if (!m) return [k, ""];
      // Shorthand `{ content }` has no colon: its value is the variable itself.
      const value = m[2] === ":" ? k.slice(m[0].length).trim() : m[1];
      return [m[1], value];
    });
}

/** From just after a `.from(...)` to the end of its statement (a `;` at depth 0), capped. */
function chainAfter(source: string, from: number): string {
  const rest = source.slice(from, from + 1500);
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth < 0) return rest.slice(0, i);
    } else if (c === ";" && depth === 0) return rest.slice(0, i);
  }
  return rest;
}

const RESEARCH_BODY_COLUMNS = new Set(["content", "original_content"]);

/** research.rs_content: a page body is research's own only while the page is not yet a Source. */
export function scanResearchBodies(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const fromRe = /\.from\(\s*["']rs_content["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source))) {
    const chain = chainAfter(source, m.index + m[0].length);
    if (/\.is\(\s*["']processed_document_id["']\s*,\s*null\s*\)/.test(chain)) continue;
    const line = source.slice(0, m.index).split("\n").length;
    const push = (verb: string, detail: string) =>
      findings.push({ file, line, table: "rs_content", verb, detail });
    const write = /\.(insert|upsert|update)\(/.exec(chain);
    if (write) {
      if (write[1] !== "update") {
        push(write[1], `.${write[1]}() on research.rs_content — research bodies are created by the server`);
        continue;
      }
      const entries = literalEntries(chain.slice(write.index + write[0].length));
      if (!entries) {
        push("update", ".update(<non-literal>) on research.rs_content — the columns it writes cannot be seen");
        continue;
      }
      const bad = entries
        .filter(([k, v]) => k === "...spread" || (RESEARCH_BODY_COLUMNS.has(k) && !(k === "original_content" && v === "null")))
        .map(([k]) => k);
      if (bad.length) {
        push("update", `.update() writes ${bad.join(", ")} on research.rs_content without .is("processed_document_id", null) — a Source's body is edited through POST /sources/{id}/edit`);
      }
      continue;
    }
    const sel = /\.select\(\s*(["'`])([^"'`]*)\1/.exec(chain);
    const selVar = /\.select\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/.exec(chain);
    const columns = sel
      ? sel[2].split(",").map((c) => c.trim().split(/[\s:(]/)[0])
      : selVar
        ? constColumns(source, selVar[1])
        : /\.select\(\s*\)/.test(chain)
          ? ["*"]
          : [];
    const read = columns.filter((c) => c === "*" || RESEARCH_BODY_COLUMNS.has(c));
    if (read.length) {
      push("select", `.select(${read.join(", ")}) on research.rs_content without .is("processed_document_id", null) — read a page body through GET /research/topics/{t}/sources/{s}/content`);
    }
  }
  return findings;
}

/** The column list a `const NAME = [...].join(",")` or `const NAME = "a,b"` declares, if visible. */
function constColumns(source: string, name: string): string[] {
  const decl = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]{0,2000}?);`).exec(source);
  if (!decl) return ["<unseen>"];
  return [...decl[1].matchAll(/["'`]([^"'`]+)["'`]/g)]
    .flatMap((x) => x[1].split(","))
    .map((c) => c.trim())
    .filter((c) => c && c !== ",");
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
    // research.rs_content — a Source's body goes through the Source.
    [`db.from("rs_content").update({ content: t, char_count: n }).eq("id", x);`, 1],
    [`db.from("rs_content").update({ content: t }).eq("id", x).is("processed_document_id", null);`, 0],
    [`db.from("rs_content").update({ original_content: null }).eq("id", x);`, 0],
    [`db.from("rs_content").update({ original_content: o }).eq("id", x);`, 1],
    [`db.from("rs_content").update(updates).eq("id", x);`, 1],
    [`db.from("rs_content").insert({ content: t });`, 1],
    [`db.from("rs_content").select("*").eq("source_id", s);`, 1],
    [`db.from("rs_content").select("id,content").in("id", ids);`, 1],
    [`db.from("rs_content").select("id, content").in("id", ids).is("processed_document_id", null);`, 0],
    [`db.from("rs_content").select("source_id, char_count, is_current").eq("topic_id", t);`, 0],
    [`const COLS = ["id", "content_hash"].join(","); db.from("rs_content").select(COLS);`, 0],
    [`const COLS = ["id", "content"].join(","); db.from("rs_content").select(COLS);`, 1],
  ];
  let failed = 0;
  for (const [src, expected] of cases) {
    const got = scanSource("self-test.ts", src).length + scanResearchBodies("self-test.ts", src).length;
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
    if (!src.includes("processed_document") && !src.includes("rs_content")) continue;
    const found = [...scanSource(rel, src), ...scanResearchBodies(rel, src)];
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
    console.error("Write Sources through the door: POST /sources/land, /sources/{id}/keep, /sources/{id}/edit (features/sources/api/sourcesApi.ts); read a research page body through GET /research/topics/{t}/sources/{s}/content.");
    process.exit(1);
  }
  console.log("check:one-door — PASS: no direct Source writes outside the allowlisted columns.");
}

main();
