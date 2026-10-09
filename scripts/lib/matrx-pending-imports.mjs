// matrx-pending-imports — THE SHARED PREVIEW NEVER 500s ON AN @ai-matrx NAME NOT PUBLISHED YET.
//
// THE DEFECT THIS EXISTS FOR (2026-10-07, three outages in one day; a fourth found 2026-10-08)
// --------------------------------------------------------------------------------------------
// The one dev server on :3001 serves ~30 agents from the shared checkout's WORKING TREE. An edit
// there imported an @ai-matrx name the installed package did not ship yet — the consumer half
// written before aidream's npm train published the package half:
//
//   PERMISSION_LEVEL_HINTS from @ai-matrx/chat           (needs 0.3.29, 0.3.27 installed)
//   @ai-matrx/chat/canvas/workspace/side-chat-address    (subpath not shipped)
//   @ai-matrx/chat/agents/ui-first-tools/ui/CredentialCaptureCard
//   @ai-matrx/alchemy/react/surface
//   @ai-matrx/records/app-table + useAppTable            (2026-10-08: /login 500 for everyone)
//
// Each sat in a module the shell imports, so Turbopack failed it and EVERY route answered 500 until
// someone noticed. `check:matrx-imports` and the sync sweep hold (check-sweep-resolves) see it, but
// neither runs between an agent's edit and the next request, and the sweep hold only keeps the file
// off main — it is still on disk, still compiled.
//
// So the dev server rescues the import itself. For ONE file, `rescuePendingImports` resolves each
// @ai-matrx import against the INSTALLED package (scripts/lib/matrx-package-resolve.mjs, the same
// resolution check-matrx-imports uses) and, for an import that package certainly cannot satisfy,
// rewrites just that binding to a loud placeholder (lib/turbopack/matrx-pending.js): a red inline
// "Not published yet" box wherever it renders, one console error naming the file, the package,
// the installed version and the version aidream's source is at. Every other route keeps working.
// Once the package is published and installed the next compile sees the real export and the
// placeholder is gone — nothing to clean up.
//
// DEV ONLY (next.config.js wires the loader for PHASE_DEVELOPMENT_SERVER). A build never gets it:
// a release must still fail on the real error.
//
// NO TYPESCRIPT HERE. This runs in every Turbopack loader worker; the first version loaded the
// compiler there and drove the shared preview past its 48 GB watchdog (2026-10-08). Statements are
// found with line-anchored patterns, runtime exports are read from the shipped ESM text, and
// declarations only to tell a type from a value. Conservative: a name is replaced only when the
// runtime JavaScript is statically readable AND lacks it AND the declarations do not show it as a
// type-only name. Anything unreadable, a workspace link, a `type` import: left exactly as written.
//
//   node scripts/lib/matrx-pending-imports.mjs <files…>      # what the dev server would rescue
//   node scripts/lib/matrx-pending-imports.mjs --self-test   # RED then GREEN in a temp tree

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearPackageResolution,
  findInstalled,
  isWorkspaceSource,
  resolveRelativeJs,
  resolveSubpath,
  splitSpecifier,
} from "./matrx-package-resolve.mjs";

const SCOPE = "@ai-matrx/";
export const PLACEHOLDER_MODULE = "@/lib/turbopack/matrx-pending";

// ── what a shipped file exports (text only) ──────────────────────────────────

// A string-aware scan (review of 1162b05f96: a `//` inside a base64 string in alchemy's shipped
// operate-pptx.js made a naive stripper delete the real `export{buildPresentation}` after it, so a
// SHIPPED import read as pending). Comments become spaces (indices and newlines kept); strings,
// templates and regex literals are skipped intact. Returns { code, hidden } — `hidden` holds the
// [start, end) ranges inside comments and template literals — or null when the text does not scan
// cleanly (an unterminated comment/string), which every caller treats as "not knowable".
const REGEX_AFTER = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
export function scanCode(text) {
  const out = text.split("");
  const hidden = [];
  let prev = ""; // last significant character outside comments
  let i = 0;
  const n = text.length;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      hidden.push([i, stop]);
      i = stop;
    } else if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) return null;
      blank(i, end + 2);
      hidden.push([i, end + 2]);
      i = end + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      i = j + 1;
      prev = c;
    } else if (c === "`") {
      let j = i + 1;
      while (j < n && text[j] !== "`") j += text[j] === "\\" ? 2 : 1;
      if (j >= n) return null;
      hidden.push([i, j + 1]);
      i = j + 1;
      prev = c;
    } else if (c === "/" && (prev === "" || REGEX_AFTER.has(prev) || /\b(?:return|typeof|case|in|of|void|throw|delete|new)\s*$/.test(text.slice(Math.max(0, i - 8), i)))) {
      let j = i + 1;
      let cls = false;
      while (j < n && text[j] !== "\n" && (cls || text[j] !== "/")) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") cls = true;
        else if (text[j] === "]") cls = false;
        j++;
      }
      i = j + 1;
      prev = "/";
    } else {
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return { code: out.join(""), hidden };
}
const stripComments = (text) => {
  const scanned = scanCode(text);
  if (!scanned) throw new Error("unscannable");
  return scanned.code;
};
const inside = (ranges, index) => ranges.some(([a, b]) => index >= a && index < b);

const runtimeCache = new Map();
/** Names an ESM file exports at runtime, following relative `export *`; null when not knowable. */
function runtimeExportsOf(file, stack = new Set()) {
  if (runtimeCache.has(file)) return runtimeCache.get(file);
  if (stack.has(file)) return new Set();
  stack.add(file);
  let names = new Set();
  try {
    const text = stripComments(readFileSync(file, "utf8"));
    let esm = false;
    for (const m of text.matchAll(/\bexport\s*\*\s*(?:as\s+([\w$]+)\s*)?from\s*["']([^"']+)["']/g)) {
      esm = true;
      if (m[1]) {
        names.add(m[1]);
        continue;
      }
      if (!m[2].startsWith(".")) throw new Error("open star");
      const target = resolveRelativeJs(file, m[2]);
      const inner = target && runtimeExportsOf(target, stack);
      if (!inner) throw new Error("open star");
      for (const n of inner) if (n !== "default") names.add(n);
    }
    for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
      esm = true;
      for (const part of m[1].split(",")) {
        const el = part.trim();
        if (!el) continue;
        const as = el.match(/\bas\s+([\w$]+|["'][^"']+["'])$/);
        names.add((as ? as[1] : el).replace(/^["']|["']$/g, ""));
      }
    }
    for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s*([\w$]+|[{[])/g)) {
      esm = true;
      if (m[1] === "{" || m[1] === "[") throw new Error("destructured export");
      names.add(m[1]);
    }
    if (/\bexport\s+default\b/.test(text)) {
      esm = true;
      names.add("default");
    }
    if (!esm && !/\bimport\s*[\w${*]/.test(text)) throw new Error("not esm");
  } catch {
    names = null;
  }
  stack.delete(file);
  runtimeCache.set(file, names);
  return names;
}

function resolveRelativeDts(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec).replace(/\.(m?js|jsx?)$/, "");
  for (const c of [`${base}.d.ts`, `${base}.d.mts`, join(base, "index.d.ts"), `${base}.ts`, `${base}.tsx`]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const declTextCache = new Map();
/** The declaration entry's text plus every relative `export *` / `export … from` it reaches. */
function declarationText(entry) {
  if (declTextCache.has(entry)) return declTextCache.get(entry);
  const seen = new Set();
  const parts = [];
  const walk = (file) => {
    if (!file || seen.has(file) || seen.size > 400) return;
    seen.add(file);
    let text;
    try {
      text = stripComments(readFileSync(file, "utf8"));
    } catch {
      text = readFileSync(file, "utf8");
    }
    parts.push(text);
    for (const m of text.matchAll(/\bfrom\s*["'](\.[^"']*)["']/g)) walk(resolveRelativeDts(file, m[1]));
  };
  walk(entry);
  const text = parts.join("\n");
  declTextCache.set(entry, text);
  return text;
}

const escapeRe = (s) => s.replace(/[$]/g, "\\$");
/** A name the declarations show ONLY as a type: erased by the compiler, never a bundler error. */
function isTypeOnlyName(entry, name) {
  if (!entry || entry.endsWith(".json")) return false;
  const text = declarationText(entry);
  const n = escapeRe(name);
  const asType = new RegExp(`\\b(?:interface|type)\\s+${n}\\b|\\bexport\\s+type\\s*\\{[^}]*\\b${n}\\b`).test(text);
  const asValue = new RegExp(`\\b(?:const|let|var|function|class|enum|namespace)\\s+${n}\\b`).test(text);
  return asType && !asValue;
}

/** Is `name` certainly something the bundler cannot import from this resolved subpath? */
function nameIsPending(res, name) {
  if (!res.runtime) return false;
  const runtime = runtimeExportsOf(res.runtime);
  if (runtime === null || runtime.has(name)) return false;
  return !isTypeOnlyName(res.entry, name);
}

const sourceVersionCache = new Map();
/** The version aidream's SOURCE of this package is at (what the next publish will carry), or null. */
export function sourceVersionOf(pkg, root) {
  if (sourceVersionCache.has(pkg)) return sourceVersionCache.get(pkg);
  let version = null;
  const shared = join(root, "..", "aidream", "apps", "shared");
  try {
    for (const dir of readdirSync(shared)) {
      const manifest = join(shared, dir, "package.json");
      if (!existsSync(manifest)) continue;
      const m = JSON.parse(readFileSync(manifest, "utf8"));
      if (m.name === pkg) {
        version = m.version ?? null;
        break;
      }
    }
  } catch {
    version = null;
  }
  sourceVersionCache.set(pkg, version);
  return version;
}

export function resetPendingCaches() {
  clearPackageResolution();
  runtimeCache.clear();
  declTextCache.clear();
  sourceVersionCache.clear();
}

/** { pending: false } | { pending: "module", why, … } | { pending: "names", res, … } */
function judgeSpecifier(file, specifier, root) {
  const { name: pkg, sub } = splitSpecifier(specifier);
  const pkgDir = findInstalled(dirname(file), pkg, root);
  if (!pkgDir) return { pending: "module", why: "not-installed", pkg, version: null, sub, pkgDir: null };
  if (isWorkspaceSource(pkgDir)) return { pending: false };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  } catch {
    return { pending: false };
  }
  const res = resolveSubpath(pkgDir, manifest, sub);
  if (res.missingSubpath) return { pending: "module", why: "subpath", pkg, version: manifest.version, sub, pkgDir };
  if (res.missingFile) return { pending: "module", why: "subpath-file", pkg, version: manifest.version, sub, pkgDir };
  if (res.unresolved) return { pending: false, pkgDir };
  return { pending: "names", res, pkg, version: manifest.version, sub, pkgDir };
}

// ── the rewrite ──────────────────────────────────────────────────────────────

// `import … from "@ai-matrx/…"` / `export … from "@ai-matrx/…"`, anchored at a line start.
const STATIC = /(?<=^|;)([ \t]*)(import|export)(\s+type)?\s+([^;'"]*?)\s*from\s*(["'])(@ai-matrx\/[^"']+)\5[ \t]*;?/gm;
const SIDE_EFFECT = /(?<=^|;)([ \t]*)import\s*(["'])(@ai-matrx\/[^"']+)\2[ \t]*;?/gm;
const DYNAMIC = /\b(import|require)\(\s*(["'])(@ai-matrx\/[^"']+)\2\s*\)/g;
// `import a from "…" with { type: "json" }` — rewriting would leave the attributes dangling.
const ATTRIBUTES_FOLLOW = /^\s*(?:with|assert)\s*\{/;

/** `{ a, type B, c as d }` → [{ imported, local, typeOnly, text }] or null when not plainly readable. */
function namedList(body) {
  const out = [];
  let clean;
  try {
    clean = stripComments(body);
  } catch {
    return null;
  }
  for (const raw of clean.split(",")) {
    const el = raw.trim();
    if (!el) continue;
    const m = el.match(/^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/);
    if (!m) return null;
    out.push({ imported: m[2], local: m[3] ?? m[2], typeOnly: Boolean(m[1]), text: el });
  }
  return out;
}

/** Parse an import clause: `D`, `D, { … }`, `D, * as ns`, `{ … }`, `* as ns`. Null when unusual. */
function importClause(clause) {
  let c;
  try {
    c = stripComments(clause).trim();
  } catch {
    return null;
  }
  const m = c.match(/^(?:([\w$]+)\s*(?:,\s*|$))?(?:\*\s*as\s+([\w$]+)|\{([\s\S]*)\})?$/);
  if (!m || (!m[1] && !m[2] && m[3] === undefined)) return null;
  const named = m[3] !== undefined ? namedList(m[3]) : [];
  if (!named) return null;
  return { defaultName: m[1] ?? null, namespace: m[2] ?? null, named };
}

/**
 * Rewrite ONE file's @ai-matrx imports the installed packages certainly cannot satisfy.
 * Returns { code, pending: [{ file, line, specifier, name, pkg, version, source, why }], packageDirs }.
 * `code === text` when nothing is pending.
 */
export function rescuePendingImports(file, text, root) {
  const packageDirs = new Set();
  const pending = [];
  if (!text.includes(SCOPE)) return { code: text, pending, packageDirs };
  const rel = relative(root, file).split(sep).join("/");
  const judged = new Map();
  const judge = (spec) => {
    if (!judged.has(spec)) judged.set(spec, judgeSpecifier(file, spec, root));
    const j = judged.get(spec);
    if (j.pkgDir) packageDirs.add(j.pkgDir);
    return j;
  };
  const lineAt = (index) => text.slice(0, index).split("\n").length;
  const info = (j, name, line, specifier) => {
    const entry = { file: rel, line, specifier, name, pkg: j.pkg, version: j.version, source: sourceVersionOf(j.pkg, root), why: j.why ?? "export" };
    pending.push(entry);
    return JSON.stringify({ file: rel, line, specifier, pkg: entry.pkg, version: entry.version, source: entry.source });
  };
  const call = (inf, name) => `__matrxPending(${inf}, ${JSON.stringify(name)})`;
  const ns = (inf) => `__matrxPending.namespace(${inf})`;
  const edits = []; // { start, end, text }
  // Names the rewritten IMPORTS now declare as `const`, and the `export const` declarations the
  // rewritten RE-EXPORTS produce. `import { X } from "@ai-matrx/p"` + `export { X } from "@ai-matrx/p"`
  // is legal source (a re-export binds nothing locally) but became two declarations of X and 500'd
  // every route (2026-10-08). Collisions are resolved after the loop.
  const importLocals = new Set();
  const exportDecls = []; // { edit, local, value, decl }
  // Text inside a comment or template literal is never a statement (a code sample, a fixture).
  const hidden = scanCode(text)?.hidden ?? [];
  const skip = (m, end) => inside(hidden, m.index + m[1].length) || ATTRIBUTES_FOLLOW.test(text.slice(end));

  for (const m of text.matchAll(STATIC)) {
    const [whole, indent, verb, typeKw, clauseText, , specifier] = m;
    if (skip(m, m.index + whole.length)) continue;
    if (typeKw) continue; // `import type` / `export type`: erased, never reaches the bundler
    const j = judge(specifier);
    if (!j.pending) continue;
    const line = lineAt(m.index);
    const all = j.pending === "module";
    const isPending = (name) => all || nameIsPending(j.res, name);
    const quoted = JSON.stringify(specifier);
    const out = [];
    if (verb === "import") {
      const clause = importClause(clauseText);
      if (!clause) continue;
      let keepDefault = null;
      if (clause.defaultName) {
        if (isPending("default")) {
          importLocals.add(clause.defaultName);
          out.push(`const ${clause.defaultName} = ${call(info(j, "default", line, specifier), "default")};`);
        }
        else keepDefault = clause.defaultName;
      }
      if (clause.namespace && all) importLocals.add(clause.namespace);
      if (clause.namespace && all) out.push(`const ${clause.namespace} = ${ns(info(j, "*", line, specifier))};`);
      const keep = [];
      for (const el of clause.named) {
        if (!el.typeOnly && isPending(el.imported)) {
          importLocals.add(el.local);
          out.push(`const ${el.local} = ${call(info(j, el.imported, line, specifier), el.imported)};`);
        } else if (!all) keep.push(el.text);
      }
      if (!out.length) continue;
      if (!all) {
        const parts = [];
        if (keepDefault) parts.push(keepDefault);
        if (clause.namespace) parts.push(`* as ${clause.namespace}`);
        else if (keep.length) parts.push(`{ ${keep.join(", ")} }`);
        if (parts.length) out.unshift(`import ${parts.join(", ")} from ${quoted};`);
      }
    } else {
      let c;
      try {
        c = stripComments(clauseText).trim();
      } catch {
        continue;
      }
      const star = c.match(/^\*(?:\s*as\s+([\w$]+))?$/);
      if (star) {
        if (!all) continue;
        out.push(star[1] ? `export const ${star[1]} = ${ns(info(j, "*", line, specifier))};` : `/* matrx-pending: export * from ${specifier} skipped */ void ${ns(info(j, "*", line, specifier))};`);
      } else {
        const body = c.match(/^\{([\s\S]*)\}$/);
        const named = body && namedList(body[1]);
        if (!named) continue;
        const keep = [];
        for (const el of named) {
          if (!el.typeOnly && isPending(el.imported)) {
            const value = call(info(j, el.imported, line, specifier), el.imported);
            const decl = el.local === "default" ? `export default ${value};` : `export const ${el.local} = ${value};`;
            if (el.local !== "default") exportDecls.push({ local: el.local, value, decl });
            out.push(decl);
          } else if (!all) keep.push(el.text);
        }
        if (!out.length) continue;
        if (keep.length) out.unshift(`export { ${keep.join(", ")} } from ${quoted};`);
      }
    }
    // Same line count as the original statement, so every later line keeps its number.
    const pad = "\n".repeat((whole.match(/\n/g) ?? []).length);
    const edit = { start: m.index, end: m.index + whole.length, text: `${indent}${out.join(" ")}${pad}` };
    for (const d of exportDecls) d.edit ??= edit;
    edits.push(edit);
  }
  for (const d of exportDecls) {
    if (!importLocals.has(d.local)) continue;
    const tmp = `__matrxPendingExport_${d.local}`;
    d.edit.text = d.edit.text.replace(d.decl, `const ${tmp} = ${d.value}; export { ${tmp} as ${d.local} };`);
  }

  for (const m of text.matchAll(SIDE_EFFECT)) {
    if (skip(m, m.index + m[0].length)) continue;
    const j = judge(m[3]);
    if (j.pending !== "module") continue;
    void ns(info(j, "*", lineAt(m.index), m[3]));
    edits.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]}/* matrx-pending: side-effect import of ${m[3]} skipped */` });
  }

  for (const m of text.matchAll(DYNAMIC)) {
    if (inside(hidden, m.index) || /\bimport\s+[\w$]+\s*=\s*$/.test(text.slice(Math.max(0, m.index - 80), m.index))) continue;
    // `import("…").Name` / `typeof import("…")` is a TYPE query — erased at compile time, so a
    // runtime placeholder there is a syntax error (2026-10-08: `export type X = import("…").Y`
    // 500'd every route). A runtime import() is a Promise: only .then/.catch/.finally follow it.
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (m[1] === "import" && (/^\s*\.(?!\s*(?:then|catch|finally)\b)/.test(after) || /^\s*</.test(after) || /\btypeof\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index)))) continue;
    const j = judge(m[3]);
    if (j.pending !== "module") continue;
    const value = ns(info(j, "*", lineAt(m.index), m[3]));
    edits.push({ start: m.index, end: m.index + m[0].length, text: m[1] === "import" ? `Promise.resolve(${value})` : value });
  }

  if (!edits.length) return { code: text, pending, packageDirs };
  edits.sort((a, b) => b.start - a.start);
  let code = text;
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  // The helper import goes after the directive prologue ("use client" / "use server" stay first),
  // on the directive's own line so no later line number moves.
  const prologue = code.match(/^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(?:(["'])use [a-z]+\1;?[ \t]*(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*?)*/);
  let at = 0;
  if (prologue) {
    // Directives only — a comment that MENTIONS "use client" is blanked first (same length, so
    // indices hold); matching inside it put the helper import inside a JSDoc (2026-10-08).
    const code_only = prologue[0].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    const directives = [...code_only.matchAll(/(["'])use [a-z]+\1;?/g)];
    if (directives.length) {
      const last = directives[directives.length - 1];
      at = last.index + last[0].length;
    }
  }
  const helper = `${at && !code.slice(0, at).trimEnd().endsWith(";") ? ";" : ""} import { matrxPending as __matrxPending } from ${JSON.stringify(PLACEHOLDER_MODULE)};`;
  code = at ? code.slice(0, at) + helper + code.slice(at) : `${helper.trim()} ${code}`;
  return { code, pending, packageDirs };
}

/** One line per pending import, for the dev server's log and the loader's warning. */
export function describePending(p) {
  const what = p.name === "*" ? `module "${p.specifier}"` : `"${p.name}" from "${p.specifier}"`;
  const installed = p.version ? `installed ${p.pkg}@${p.version} does not ship it` : `${p.pkg} is not installed`;
  const next = p.source ? `; aidream source is at ${p.source} — publish it, then pnpm up ${p.pkg}@latest` : "";
  return `[matrx-pending] ${p.file}:${p.line} imports ${what}: ${installed}${next}. Rendering a placeholder so the shared preview stays up.`;
}

// ── self-test: the 2026-10-07 shapes, RED then GREEN ─────────────────────────

function selfTest() {
  const failures = [];
  const tmp = mkdtempSync(join(tmpdir(), "matrx-pending-"));
  try {
    const write = (rel, body) => {
      mkdirSync(dirname(join(tmp, rel)), { recursive: true });
      writeFileSync(join(tmp, rel), body);
    };
    const pkgDir = join(tmp, "node_modules", "@ai-matrx", "chat");
    const ship = (version, published) => {
      write("node_modules/@ai-matrx/chat/package.json", JSON.stringify({
        name: "@ai-matrx/chat",
        version,
        type: "module",
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
          "./agents/*": { types: "./dist/agents/*.d.ts", import: "./dist/agents/*.js" },
          ...(published ? { "./canvas/workspace/side-chat-address": { types: "./dist/side.d.ts", import: "./dist/side.js" } } : {}),
        },
      }));
      // Built ESM the way tsc/tsup ship it: an `export *` barrel plus `export { … }` lists.
      write("node_modules/@ai-matrx/chat/dist/index.js", `export * from "./levels.js";\nexport { Tool } from "./tool.js";\n`);
      // Minified, like alchemy's operate-pptx.js: a `//` inside a string BEFORE an export on the same line.
      write("node_modules/@ai-matrx/chat/dist/levels.js", `const PERMISSION_LEVELS=[],B="data:x//y",G='/*',R=/["'/]/;${published ? "const PERMISSION_LEVEL_HINTS={};export{PERMISSION_LEVEL_HINTS};" : ""}\nexport { PERMISSION_LEVELS };\n`);
      write("node_modules/@ai-matrx/chat/dist/tool.js", `export class Tool {}\n`);
      write("node_modules/@ai-matrx/chat/dist/index.d.ts", `export * from "./levels";\nexport { Tool } from "./tool";\n`);
      write("node_modules/@ai-matrx/chat/dist/levels.d.ts", `export declare const PERMISSION_LEVELS: string[];\nexport interface Level { id: string }\n${published ? "export declare const PERMISSION_LEVEL_HINTS: Record<string, string>;\n" : ""}`);
      write("node_modules/@ai-matrx/chat/dist/tool.d.ts", `export declare class Tool {}\n`);
      write("node_modules/@ai-matrx/chat/dist/agents/tools.js", `export function useTools() {}\n`);
      write("node_modules/@ai-matrx/chat/dist/agents/tools.d.ts", `export declare function useTools(): void;\n`);
      if (published) {
        write("node_modules/@ai-matrx/chat/dist/side.js", `export const sideChatAddress = 1;\n`);
        write("node_modules/@ai-matrx/chat/dist/side.d.ts", `export declare const sideChatAddress: number;\n`);
        write("node_modules/@ai-matrx/chat/dist/agents/ui/CredentialCaptureCard.js", `export default function C() {}\n`);
        write("node_modules/@ai-matrx/chat/dist/agents/ui/CredentialCaptureCard.d.ts", `export default function C(): null;\n`);
      } else {
        rmSync(join(pkgDir, "dist", "side.js"), { force: true });
        rmSync(join(pkgDir, "dist", "agents", "ui"), { recursive: true, force: true });
      }
    };
    const file = join(tmp, "features", "x", "Panel.tsx");
    const text = [
      `// header comment`,
      `"use client";`,
      `import {`,
      `  PERMISSION_LEVELS,`,
      `  PERMISSION_LEVEL_HINTS,`,
      `  type Level,`,
      `  Tool,`,
      `} from "@ai-matrx/chat";`,
      `import { Level as L2 } from "@ai-matrx/chat";`,
      `import type { Nope } from "@ai-matrx/chat/canvas/workspace/side-chat-address";`,
      `import { sideChatAddress } from "@ai-matrx/chat/canvas/workspace/side-chat-address";`,
      `import CredentialCaptureCard from "@ai-matrx/chat/agents/ui/CredentialCaptureCard";`,
      `import { useTools } from "@ai-matrx/chat/agents/tools";`,
      `export { PERMISSION_LEVEL_HINTS as HINTS } from "@ai-matrx/chat";`,
      `const lazy = () => import("@ai-matrx/chat/canvas/workspace/side-chat-address");`,
      `export default function Panel() { return <CredentialCaptureCard hints={PERMISSION_LEVEL_HINTS} a={sideChatAddress} />; }`,
      ``,
    ].join("\n");
    write("features/x/Panel.tsx", text);

    // RED: the package does not ship them yet → each one is rescued, nothing else is touched.
    ship("0.3.27", false);
    resetPendingCaches();
    const red = rescuePendingImports(file, text, tmp);
    const got = red.pending.map((p) => `${p.specifier}#${p.name}@${p.line}`).sort();
    const want = [
      "@ai-matrx/chat#PERMISSION_LEVEL_HINTS@14",
      "@ai-matrx/chat#PERMISSION_LEVEL_HINTS@3",
      "@ai-matrx/chat/agents/ui/CredentialCaptureCard#default@12",
      "@ai-matrx/chat/canvas/workspace/side-chat-address#*@15",
      "@ai-matrx/chat/canvas/workspace/side-chat-address#sideChatAddress@11",
    ].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`RED: pending ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    for (const must of [
      `"use client"; import { matrxPending as __matrxPending } from "@/lib/turbopack/matrx-pending";`,
      `import { PERMISSION_LEVELS, type Level, Tool } from "@ai-matrx/chat";`,
      `import { Level as L2 } from "@ai-matrx/chat";`,
      `import type { Nope } from "@ai-matrx/chat/canvas/workspace/side-chat-address";`,
      `import { useTools } from "@ai-matrx/chat/agents/tools";`,
      `const PERMISSION_LEVEL_HINTS = __matrxPending(`,
      `const sideChatAddress = __matrxPending(`,
      `const CredentialCaptureCard = __matrxPending(`,
      `export const HINTS = __matrxPending(`,
      `Promise.resolve(__matrxPending.namespace(`,
    ]) if (!red.code.includes(must)) failures.push(`RED: rewritten code lacks ${must}`);
    if (red.code.split("\n").length !== text.split("\n").length) failures.push("RED: the rewrite moved line numbers");
    if (!red.code.split("\n")[15].startsWith("export default function Panel()")) failures.push("RED: a later line moved");
    if (!/aidream source|does not ship it/.test(describePending(red.pending[0]))) failures.push(`RED: description names no version: ${describePending(red.pending[0])}`);

    // Review findings (1162b05f96): statements that must NOT be rewritten, and two on one line.
    const edge = [
      `const sample = \`import { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";\`;`,
      `/* import { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat"; */`,
      `import data from "@ai-matrx/chat/agents/ui/CredentialCaptureCard" with { type: "json" };`,
      `import legacy = require("@ai-matrx/chat/agents/ui/CredentialCaptureCard");`,
      `import { Tool } from "@ai-matrx/chat"; import { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";`,
      `export type Opts = import("@ai-matrx/chat/canvas/workspace/side-chat-address").Options;`,
      ``,
    ].join("\n");
    const e = rescuePendingImports(file, edge, tmp);
    const eLines = e.code.split("\n");
    if (e.pending.length !== 1 || e.pending[0].line !== 5) failures.push(`RED edge: expected only the second statement on line 5 rescued, got ${JSON.stringify(e.pending)}`);
    for (const k of [0, 1, 2, 3, 5]) if (!e.code.includes(edge.split("\n")[k])) failures.push(`RED edge: line ${k + 1} was touched:\n${e.code}`);
    if (!eLines[4].startsWith(`import { Tool } from "@ai-matrx/chat"; const PERMISSION_LEVEL_HINTS = __matrxPending(`)) failures.push(`RED edge: same-line statement not rescued:\n${eLines[4]}`);

    // import { X } + export { X } from the same package: one binding, one export, never two `const X`.
    const both = `import { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";\nexport { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";\nexport const use = PERMISSION_LEVEL_HINTS;\n`;
    const b = rescuePendingImports(file, both, tmp);
    const declCount = (b.code.match(/\bconst PERMISSION_LEVEL_HINTS\b/g) ?? []).length;
    if (declCount !== 1) failures.push(`RED: import + re-export of one name declared it ${declCount} times:\n${b.code}`);
    if (!/export \{ __matrxPendingExport_PERMISSION_LEVEL_HINTS as PERMISSION_LEVEL_HINTS \}/.test(b.code)) failures.push(`RED: re-export lost its export:\n${b.code}`);

    // A file with no directive gets the helper at the very top.
    const plain = `import { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";\nexport const x = PERMISSION_LEVEL_HINTS;\n`;
    const p2 = rescuePendingImports(file, plain, tmp);
    const mention = `/**\n * That entry is marked "use client", so names are declared here.\n */\nexport { PERMISSION_LEVEL_HINTS } from "@ai-matrx/chat";\n`;
    const p3 = rescuePendingImports(file, mention, tmp);
    if (!p3.code.startsWith(`import { matrxPending as __matrxPending }`)) failures.push(`RED: helper placed inside a comment that mentions a directive:\n${p3.code}`);
    if (!p2.code.startsWith(`import { matrxPending as __matrxPending }`)) failures.push(`RED: helper not first in a directive-less file:\n${p2.code}`);

    // GREEN: published + installed → the file is left byte-identical.
    ship("0.3.29", true);
    resetPendingCaches();
    const green = rescuePendingImports(file, text, tmp);
    if (green.code !== text || green.pending.length) failures.push(`GREEN: a shipped import was rewritten: ${JSON.stringify(green.pending)}`);
  } catch (err) {
    failures.push(`threw: ${err?.stack ?? err}`);
  }
  rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    console.error("matrx-pending-imports --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(
    "matrx-pending-imports --self-test OK — RED: a missing export (through an export * barrel), an unshipped subpath, a wildcard subpath with no file, a re-export and a dynamic import() are each rescued; type-only and shipped names untouched, directive kept first, no line number moves; GREEN: once published the file is left byte-identical.",
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) process.exitCode = selfTest();
  else {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    let code = 0;
    for (const f of process.argv.slice(2)) {
      const abs = resolve(f);
      if (!statSync(abs).isFile()) continue;
      const r = rescuePendingImports(abs, readFileSync(abs, "utf8"), root);
      for (const p of r.pending) console.log(describePending(p));
      if (r.pending.length) code = 1;
    }
    process.exitCode = code;
  }
}
