#!/usr/bin/env npx tsx
/**
 * check-overlay-key-alignment.ts
 *
 * Cross-checks every registered overlay's three layers for key-name drift:
 *
 *   1. Registry defaultData     (windowRegistryMetadata.ts)
 *   2. Component Props           (the file referenced by componentImport)
 *   3. Dispatch sites' data keys (every `openOverlay({ overlayId, data })` /
 *                                  `toggleOverlay(...)` call in the repo)
 *
 * The render contract — OverlaySurface spreads `{...defaultData, ...data}`
 * onto the component — has no runtime validation. When the three layers
 * disagree on a key name, the component receives `undefined`, its
 * `useState(undefined)` falls back to null, and the window renders empty
 * with zero indication of cause. This audit catches that class of bug.
 *
 * Findings categories:
 *   A. dispatch-key-not-in-default
 *      A dispatch sends a key that the registry's defaultData does not
 *      declare. Either (a) the dispatch is stale, or (b) the defaultData
 *      forgot a key.
 *   B. default-key-not-in-props
 *      The registry declares a default for a key the component does not
 *      destructure. Dead key — harmless, but brittle.
 *   C. props-key-not-in-default
 *      The component declares a Prop the registry's defaultData doesn't
 *      mention. If no dispatch supplies it either, the prop is always
 *      undefined.
 *   D. dispatch-key-not-in-props
 *      Worst case: a dispatch sends a key that the component doesn't
 *      consume. Prop arrives, then is ignored. Often the result of a
 *      rename that updated the component but not the dispatch.
 *
 * Exit code 0 = no findings. Non-zero = one or more findings (so this can
 * gate CI once Phase B fixes are in).
 *
 * Usage:
 *   npx tsx scripts/check-overlay-key-alignment.ts
 *   npx tsx scripts/check-overlay-key-alignment.ts --json    (machine-readable)
 *   npx tsx scripts/check-overlay-key-alignment.ts --only=agentRunWindow,notesWindow
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistry.ts",
);
const METADATA_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistryMetadata.ts",
);

// Reserved props injected by OverlaySurface, not part of the data contract.
const RESERVED_PROPS = new Set([
  "isOpen",
  "onClose",
  "instanceId",
  // Frequently appear on the WindowPanel wrapper; not part of overlay data.
  "children",
  "className",
]);

interface OverlayRecord {
  overlayId: string;
  defaultDataKeys: Set<string>;
  importPath: string | undefined; // resolved file path relative to repo root
  namedExport: string | undefined; // if `.then(m => ({ default: m.Foo }))` style
  propKeys: Set<string> | undefined; // undefined = could not extract
  dispatches: DispatchSite[];
}

interface DispatchSite {
  file: string; // relative path
  line: number;
  keys: Set<string>;
}

interface Finding {
  overlayId: string;
  category: "A" | "B" | "C" | "D";
  detail: string;
  evidence?: string;
}

// ─── Step 1: parse registry metadata for defaultData ──────────────────────

function parseMetadata(): Map<string, Set<string>> {
  const src = readFileSync(METADATA_PATH, "utf8");
  // Match each entry: { ... overlayId: "foo", ... defaultData: { ... }, ... }
  // We scan entry-by-entry, naive but accurate enough — the file's hand-curated.
  const result = new Map<string, Set<string>>();
  // Find every `overlayId: "..."` then look ahead for the nearest
  // `defaultData: { ... }` before the next `overlayId:`.
  const overlayIdRe = /overlayId:\s*"([a-zA-Z][a-zA-Z0-9_]*)"/g;
  const indices: { id: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = overlayIdRe.exec(src))) {
    indices.push({ id: m[1], index: m.index });
  }
  for (let i = 0; i < indices.length; i++) {
    const { id, index } = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].index : src.length;
    const slice = src.slice(index, end);
    // Locate `defaultData:` and the immediately following `{...}` block,
    // using the brace-aware walker so nested objects / template strings
    // don't truncate early.
    const ddIdx = slice.search(/\bdefaultData:/);
    if (ddIdx < 0) {
      result.set(id, new Set());
      continue;
    }
    let j = ddIdx + "defaultData:".length;
    while (j < slice.length && /\s/.test(slice[j])) j++;
    if (slice[j] !== "{") {
      result.set(id, new Set());
      continue;
    }
    const closeIdx = findMatchingBrace(slice, j);
    if (closeIdx < 0) {
      result.set(id, new Set());
      continue;
    }
    result.set(id, extractTopLevelObjectKeys(slice.slice(j + 1, closeIdx)));
  }
  return result;
}

// ─── Step 2: parse windowRegistry for componentImport paths ───────────────

function parseRegistry(): Map<
  string,
  { importPath: string; namedExport: string | undefined }
> {
  const src = readFileSync(REGISTRY_PATH, "utf8");
  const result = new Map<
    string,
    { importPath: string; namedExport: string | undefined }
  >();
  // Find each DYNAMIC entry. Naive: look for `<id>: {\n... componentImport: ...`
  // up to the matching `},`. Then extract import path and named-export pattern.
  // Pattern A: import("…path…")
  // Pattern B: import("…path…").then((m) => ({ default: m.Foo }))
  const entryRe =
    /^\s{2}([a-zA-Z][a-zA-Z0-9_]*):\s*\{[\s\S]*?componentImport:\s*\(\)\s*=>\s*([\s\S]*?)(?=\n\s{2,4}(?:renderTrayPreview|captureTraySnapshot|\}))/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(src))) {
    const overlayId = m[1];
    const importBlock = m[2];
    const pathMatch = /import\(\s*"([^"]+)"\s*\)/.exec(importBlock);
    if (!pathMatch) continue;
    const importPath = pathMatch[1];
    const namedMatch = /default:\s*m\.([a-zA-Z_$][a-zA-Z0-9_$]*)/.exec(
      importBlock,
    );
    result.set(overlayId, {
      importPath,
      namedExport: namedMatch ? namedMatch[1] : undefined,
    });
  }
  return result;
}

// ─── Step 3: resolve `@/`-prefixed import path to a real file ─────────────

function resolveImportPath(importSpec: string): string | undefined {
  // "@/foo/bar" → REPO_ROOT/foo/bar.{tsx,ts}
  const rel = importSpec.startsWith("@/")
    ? importSpec.slice(2)
    : importSpec.startsWith("./")
      ? importSpec
      : importSpec;
  const candidates = [
    join(REPO_ROOT, rel + ".tsx"),
    join(REPO_ROOT, rel + ".ts"),
    join(REPO_ROOT, rel, "index.tsx"),
    join(REPO_ROOT, rel, "index.ts"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

// ─── Step 4: extract Props prop names from a component file ───────────────

/**
 * Self-subscribing overlay: instead of receiving data via spread props from
 * OverlaySurface, the component calls `useSelector(selectOverlayData(...))`
 * directly. Examples: SettingsShellOverlay, anything that needs to read
 * overlay data outside the prop interface.
 *
 * For these overlays, the prop-name-alignment check is meaningless — data
 * flows through Redux, not through props. We detect this by looking for
 * `selectOverlayData` import + invocation in the component file.
 */
function isSelfSubscribingOverlay(src: string): boolean {
  // Any of these signals means the component reads overlay state itself
  // rather than (or in addition to) receiving it via spread props.
  return (
    /\bselectOverlayData\b/.test(src) ||
    /\bselectOverlay\b/.test(src) ||
    /\buseOverlayData\b/.test(src)
  );
}

function extractPropsKeys(
  filePath: string,
  namedExport: string | undefined,
): Set<string> | undefined {
  const src = readFileSync(filePath, "utf8");
  if (isSelfSubscribingOverlay(src)) return undefined; // marker for "do not audit by Props"

  // Find the entry-point component name (named export from the registry, or
  // the file's default export function name).
  let componentName = namedExport;
  if (!componentName) {
    const m = /export\s+default\s+(?:function|const)\s+([A-Z][a-zA-Z0-9_]*)/.exec(
      src,
    );
    if (m) componentName = m[1];
  }
  // Fallback: file may use `export default <expr>` where expr is the
  // component name (e.g. `export default SettingsShellOverlay`).
  if (!componentName) {
    const m = /export\s+default\s+([A-Z][a-zA-Z0-9_]*)\s*;/.exec(src);
    if (m) componentName = m[1];
  }

  // Find all `interface XxxProps {...}` AND `interface XxxName {...}`
  // declarations in the file. We pick the one whose name matches either
  // `${componentName}Props` (the standard convention) or the type
  // annotation on the component's single parameter (for components that
  // share a `PlaceholderProps`-style type with siblings).
  const interfaceRe =
    /(?:export\s+)?(?:interface|type)\s+([A-Z][a-zA-Z0-9_]*)\s*[={]([\s\S]*?)^\}/gm;
  const candidates: { name: string; body: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = interfaceRe.exec(src))) {
    candidates.push({ name: m[1], body: m[2], index: m.index });
  }

  // Prefer the Props interface matching the component's param-type annotation
  // (e.g. `function AgentOptimizerWindow(props: PlaceholderProps)` → use
  // `PlaceholderProps`). Falls back to `${componentName}Props`.
  let chosen: { name: string; body: string; index: number } | undefined;
  if (componentName) {
    const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const paramTypeRe = new RegExp(
      `function\\s+${escaped}\\s*\\(\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\)`,
    );
    const arrowParamTypeRe = new RegExp(
      `${escaped}\\s*=\\s*(?:React\\.memo\\s*\\(\\s*)?\\(\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\)`,
    );
    const paramMatch =
      paramTypeRe.exec(src) ?? arrowParamTypeRe.exec(src);
    if (paramMatch) {
      chosen = candidates.find((c) => c.name === paramMatch[1]);
    }
  }
  const targetName = componentName ? `${componentName}Props` : undefined;
  if (!chosen && targetName) {
    chosen = candidates.find((c) => c.name === targetName);
  }

  if (chosen) {
    const keys = extractKeysFromInterfaceBody(chosen.body);
    // Augment with the entry component's own destructured param names. This
    // catches additional props introduced via aliasing or inline-typed
    // signatures. We restrict the destructure scan to the specific function
    // by name to avoid pulling in keys from sub-components in the same file.
    if (componentName) {
      for (const k of extractDestructureForComponent(src, componentName)) {
        keys.add(k);
      }
    }
    return keys;
  }

  // No matching Props interface; fall back to scanning the entry
  // component's destructure if we know its name.
  if (componentName) {
    const keys = extractDestructureForComponent(src, componentName);
    if (keys.size > 0) return keys;
  }

  // Last resort: union of all Props interfaces in the file. This is noisy
  // but better than reporting "no props at all" when the file uses a less
  // conventional naming scheme. The findings from such a file are low-
  // confidence — flagged separately below as Category C.
  const fallback = new Set<string>();
  for (const c of candidates) {
    for (const k of extractKeysFromInterfaceBody(c.body)) fallback.add(k);
  }
  return fallback.size > 0 ? fallback : undefined;
}

/**
 * Extract the destructured-parameter names from a specifically-named
 * function/const component declaration. Matches `function FooWindow({...}` and
 * `const FooWindow = ({...}` forms. Returns an empty set if the component
 * doesn't destructure its param (e.g. takes `props: T` and uses `props.x`).
 */
function extractDestructureForComponent(
  src: string,
  componentName: string,
): Set<string> {
  const keys = new Set<string>();
  const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // function form
  const funcRe = new RegExp(
    `function\\s+${escaped}\\s*\\(\\s*\\{([^}]*)\\}\\s*[:)]`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = funcRe.exec(src))) {
    extractDestructureKeys(m[1], keys);
  }
  // arrow form
  const arrowRe = new RegExp(
    `${escaped}\\s*=\\s*(?:React\\.memo\\s*\\(\\s*)?\\(\\s*\\{([^}]*)\\}\\s*[:)]`,
    "g",
  );
  while ((m = arrowRe.exec(src))) {
    extractDestructureKeys(m[1], keys);
  }
  return keys;
}

function extractKeysFromInterfaceBody(body: string): Set<string> {
  const keys = new Set<string>();
  // Each line typically looks like `  key?: type;` or `  key: type;`
  // We strip strings + comments, then match `^\s*([A-Za-z_$][\w$]*)\s*\??\s*:`
  const sanitized = body
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
  const lineKeyRe = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = lineKeyRe.exec(sanitized))) {
    keys.add(m[1]);
  }
  return keys;
}

function extractFromDefaultExportDestructure(src: string): Set<string> {
  const keys = new Set<string>();
  // Match `export default function FooWindow({ a, b: alias, c = ... }: T)`
  // or `function FooWindow({...}: T)`
  const re =
    /(?:export\s+default\s+)?(?:export\s+)?function\s+[A-Z][a-zA-Z0-9_]*\s*\(\s*\{([^}]*)\}\s*[:)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    extractDestructureKeys(m[1], keys);
  }
  // Arrow form: `export const FooWindow = ({...}: T) =>`
  const arrowRe =
    /(?:export\s+(?:default\s+)?(?:const|let|var)\s+)?[A-Z][a-zA-Z0-9_]*\s*=\s*\(\s*\{([^}]*)\}\s*[:)]/g;
  while ((m = arrowRe.exec(src))) {
    extractDestructureKeys(m[1], keys);
  }
  return keys.size > 0 ? keys : new Set();
}

function extractDestructureKeys(body: string, out: Set<string>): void {
  // Strip default value RHS to avoid pulling in `null`, `[]`, etc.
  const cleaned = body
    .replace(/=\s*\[[^\]]*\]/g, "")
    .replace(/=\s*\{[^}]*\}/g, "")
    .replace(/=\s*"[^"]*"/g, "")
    .replace(/=\s*'[^']*'/g, "")
    .replace(/=\s*[^,]+/g, "");
  for (const part of cleaned.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // `a` or `a: alias` — we want the OUTER name (`a`), which is the prop
    // name as seen by the component.
    const name = trimmed.split(":")[0].trim();
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) out.add(name);
  }
}

// ─── Step 5: scan the repo for dispatch sites ─────────────────────────────

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const name of entries) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name === "dist" ||
      name === "build" ||
      name === ".vercel" ||
      name === ".claude" || // worktrees of other agent branches — not part of the audit surface
      name === ".cursor" ||
      name === ".arman" ||
      name === "__tests__" ||
      name === "__mocks__"
    )
      continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSourceFiles(p, acc);
    else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.test\.(ts|tsx)$/.test(name) &&
      !/\.spec\.(ts|tsx)$/.test(name)
    )
      acc.push(p);
  }
  return acc;
}

function parseDispatches(
  files: string[],
): Map<string, DispatchSite[]> {
  const byOverlay = new Map<string, DispatchSite[]>();
  // We walk the source looking for `openOverlay(` / `toggleOverlay(` then
  // brace-track to find the matching `})`. A naive `.*?\}\s*\)` non-greedy
  // regex truncates at the first nested closer (e.g. a `closeOverlay({...})`
  // inside an `onSave` callback) and misattributes outer-object keys
  // (`overlayId`, `instanceId`) as data keys.
  const startRe = /\b(openOverlay|toggleOverlay)\(\s*\{/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("openOverlay") && !src.includes("toggleOverlay"))
      continue;
    startRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(src))) {
      // Position cursor just inside the opening `{`.
      const openBraceIdx = m.index + m[0].length - 1;
      const closeIdx = findMatchingBrace(src, openBraceIdx);
      if (closeIdx < 0) continue;
      const blob = src.slice(openBraceIdx + 1, closeIdx);
      const overlayMatch = /overlayId:\s*"([a-zA-Z][a-zA-Z0-9_]*)"/.exec(blob);
      if (!overlayMatch) continue;
      const overlayId = overlayMatch[1];
      const dataKeys = extractDataKeysFromDispatchBlob(blob);
      const lineNum = src.slice(0, m.index).split("\n").length;
      const list = byOverlay.get(overlayId) ?? [];
      list.push({
        file: relative(REPO_ROOT, file),
        line: lineNum,
        keys: dataKeys,
      });
      byOverlay.set(overlayId, list);
    }
  }
  return byOverlay;
}

/**
 * Given an index pointing at `{` in `src`, return the index of the matching
 * `}`. Tracks string literals (single/double/template) and line/block
 * comments so braces inside them don't throw off the depth counter.
 * Returns -1 if no match is found.
 */
function findMatchingBrace(src: string, openIdx: number): number {
  if (src[openIdx] !== "{") return -1;
  let depth = 0;
  let i = openIdx;
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let templateDepth = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (inString === "`" && c === "$" && next === "{") {
        templateDepth++;
        i += 2;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    if (templateDepth > 0 && c === "}") {
      templateDepth--;
      inString = "`";
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function extractDataKeysFromDispatchBlob(blob: string): Set<string> {
  // Find `data:` then the immediately following object literal. We use the
  // brace-aware walker so nested objects, string literals, and template
  // expressions inside `data` don't trip up the boundary detection.
  // We need a top-level `data:` — i.e. one that's a key of the outermost
  // object literal (not buried inside a nested object). Walk the blob and
  // find every `data:` at depth 0.
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let templateDepth = 0;
  let dataKeyOpenBrace = -1;
  for (let i = 0; i < blob.length; i++) {
    const c = blob[i];
    const next = blob[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (inString === "`" && c === "$" && next === "{") {
        templateDepth++;
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (templateDepth > 0 && c === "}") {
      templateDepth--;
      inString = "`";
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    // Look for `data:` at depth 0 only.
    if (
      depth === 0 &&
      c === "d" &&
      blob.slice(i, i + 5) === "data:"
    ) {
      // Skip "data:" and whitespace, then expect `{`.
      let j = i + 5;
      while (j < blob.length && /\s/.test(blob[j])) j++;
      if (blob[j] === "{") {
        dataKeyOpenBrace = j;
        break;
      }
    }
  }
  if (dataKeyOpenBrace < 0) return new Set();
  const closeIdx = findMatchingBrace(blob, dataKeyOpenBrace);
  if (closeIdx < 0) return new Set();
  const body = blob.slice(dataKeyOpenBrace + 1, closeIdx);
  // After body extraction, fall through to the existing sanitizer below.
  return extractTopLevelObjectKeys(body);
}

/**
 * Returns the top-level key names of an object literal body (the text
 * between `{` and `}` — exclusive). Strips strings, comments, nested
 * objects/arrays, and brackets so identifiers in ternaries or function
 * calls aren't misinterpreted as keys.
 */
function extractTopLevelObjectKeys(body: string): Set<string> {
  // Walk the body char-by-char tracking brace/bracket/paren depth, string
  // literals, template-expression depth, and comments. Emit a key only at
  // depth 0, where an identifier is preceded by `,` or start-of-body and
  // followed by `:`. This correctly skips:
  //   - identifiers inside nested objects (`onSave: { foo: bar }` won't emit `foo`)
  //   - parameter annotations in callbacks (`onSave: (x: T) => ...` won't emit `x`)
  //   - ternary RHS (`a: x ? y : z` won't emit `y`)
  //   - identifiers in for/if blocks inside arrow function bodies
  const keys = new Set<string>();
  let depthBrace = 0;
  let depthParen = 0;
  let depthBracket = 0;
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let templateDepth = 0;
  // Whether the *previous* non-whitespace, non-comment char at depth 0 was
  // `,` or start-of-body. We use this to decide when an identifier starting
  // here qualifies as a top-level key.
  let canStartKey = true;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const next = body[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (inString === "`" && c === "$" && next === "{") {
        templateDepth++;
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (templateDepth > 0 && c === "}") {
      templateDepth--;
      inString = "`";
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "{") {
      depthBrace++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "}") {
      depthBrace--;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "(") {
      depthParen++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === ")") {
      depthParen--;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "[") {
      depthBracket++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "]") {
      depthBracket--;
      canStartKey = false;
      i++;
      continue;
    }
    if (
      depthBrace === 0 &&
      depthParen === 0 &&
      depthBracket === 0 &&
      c === ","
    ) {
      canStartKey = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Non-whitespace, non-bracket, non-string content. If we're at top
    // level and the previous separator marked us as ready for a key, try
    // to read an identifier followed by `:`.
    if (
      depthBrace === 0 &&
      depthParen === 0 &&
      depthBracket === 0 &&
      canStartKey &&
      /[A-Za-z_$]/.test(c)
    ) {
      let j = i;
      while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j++;
      const ident = body.slice(i, j);
      // Skip optional whitespace, then we should see `:` (not `::` or
      // anything else) for this to be a key. Property shorthand
      // (`{ foo }`) doesn't apply to overlay data in this codebase.
      let k = j;
      while (k < body.length && /\s/.test(body[k])) k++;
      if (body[k] === ":") {
        keys.add(ident);
        // Move past the colon; the value follows. Mark canStartKey false
        // until the next top-level comma.
        i = k + 1;
        canStartKey = false;
        continue;
      }
      i = j;
      canStartKey = false;
      continue;
    }
    canStartKey = false;
    i++;
  }
  return keys;
}

// ─── Step 6: compare and report ────────────────────────────────────────────

function audit(): {
  records: OverlayRecord[];
  findings: Finding[];
} {
  const metadata = parseMetadata();
  const registry = parseRegistry();
  const files = walkSourceFiles(REPO_ROOT);
  const dispatches = parseDispatches(files);

  const records: OverlayRecord[] = [];
  const findings: Finding[] = [];

  const allOverlayIds = new Set<string>([
    ...metadata.keys(),
    ...registry.keys(),
  ]);

  for (const overlayId of [...allOverlayIds].sort()) {
    const defaultDataKeys = metadata.get(overlayId) ?? new Set();
    const reg = registry.get(overlayId);
    let importPath: string | undefined;
    let propKeys: Set<string> | undefined;
    if (reg) {
      const resolved = resolveImportPath(reg.importPath);
      importPath = resolved
        ? relative(REPO_ROOT, resolved)
        : `<unresolved: ${reg.importPath}>`;
      if (resolved) {
        propKeys = extractPropsKeys(resolved, reg.namedExport);
      }
    }
    const dispatchList = dispatches.get(overlayId) ?? [];

    records.push({
      overlayId,
      defaultDataKeys,
      importPath,
      namedExport: reg?.namedExport,
      propKeys,
      dispatches: dispatchList,
    });

    // Compute findings.
    const dispatchedKeyUnion = new Set<string>();
    for (const d of dispatchList) for (const k of d.keys) dispatchedKeyUnion.add(k);

    // A. dispatch key not in defaultData
    for (const d of dispatchList) {
      for (const k of d.keys) {
        if (RESERVED_PROPS.has(k)) continue;
        if (!defaultDataKeys.has(k)) {
          findings.push({
            overlayId,
            category: "A",
            detail: `dispatch sends "${k}" but defaultData declares only [${[...defaultDataKeys].sort().join(", ") || "<empty>"}]`,
            evidence: `${d.file}:${d.line}`,
          });
        }
      }
    }
    // B. default key not in props (only if we extracted props)
    if (propKeys) {
      for (const k of defaultDataKeys) {
        if (!propKeys.has(k)) {
          findings.push({
            overlayId,
            category: "B",
            detail: `defaultData declares "${k}" but component Props do not include it (dead key)`,
            evidence: importPath,
          });
        }
      }
      // C. props key not in default (only warn if also not in any dispatch)
      for (const k of propKeys) {
        if (RESERVED_PROPS.has(k)) continue;
        if (defaultDataKeys.has(k)) continue;
        if (dispatchedKeyUnion.has(k)) continue;
        findings.push({
          overlayId,
          category: "C",
          detail: `component Prop "${k}" is not declared in defaultData and no dispatch supplies it (prop will always be undefined)`,
          evidence: importPath,
        });
      }
      // D. dispatch key not in props
      for (const d of dispatchList) {
        for (const k of d.keys) {
          if (RESERVED_PROPS.has(k)) continue;
          if (!propKeys.has(k)) {
            findings.push({
              overlayId,
              category: "D",
              detail: `dispatch sends "${k}" but component does not declare a Prop with that name (will be ignored)`,
              evidence: `${d.file}:${d.line}`,
            });
          }
        }
      }
    }
  }

  return { records, findings };
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
// `--strict` exits 1 on ANY finding, including the noisy advisory categories
// (B: dead keys, C: always-undefined props). Default mode only exits 1 on the
// actionable categories (A: dispatched-key-not-in-default, D: dispatched-key-
// not-in-component-props) — those are the ones that cause silent render bugs
// or guaranteed dev-console warnings. B and C are mostly registry hygiene or
// false positives from the prop extractor's heuristics.
const strict = args.includes("--strict");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? new Set(onlyArg.slice("--only=".length).split(","))
  : null;

const { records, findings } = audit();
const scoped = only
  ? records.filter((r) => only.has(r.overlayId))
  : records;
const scopedFindings = only
  ? findings.filter((f) => only.has(f.overlayId))
  : findings;

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        records: scoped.map((r) => ({
          overlayId: r.overlayId,
          defaultDataKeys: [...r.defaultDataKeys].sort(),
          importPath: r.importPath,
          namedExport: r.namedExport,
          propKeys: r.propKeys ? [...r.propKeys].sort() : null,
          dispatches: r.dispatches.map((d) => ({
            file: d.file,
            line: d.line,
            keys: [...d.keys].sort(),
          })),
        })),
        findings: scopedFindings,
      },
      null,
      2,
    ),
  );
} else {
  // Group findings by category, then overlayId.
  const grouped: Record<string, Finding[]> = { A: [], B: [], C: [], D: [] };
  for (const f of scopedFindings) grouped[f.category].push(f);
  const headers: Record<string, string> = {
    A: "A. dispatch key not in defaultData (most common cause of silent render bugs)",
    B: "B. defaultData key not in component Props (dead key — brittle, not broken)",
    C: "C. component Prop never supplied by defaultData OR dispatch (always undefined)",
    D: "D. dispatch key not in component Props (silently ignored — usually stale rename)",
  };
  for (const cat of ["A", "D", "C", "B"] as const) {
    const list = grouped[cat];
    if (list.length === 0) continue;
    console.log(`\n${headers[cat]}\n${"─".repeat(headers[cat].length)}`);
    const byId = new Map<string, Finding[]>();
    for (const f of list) {
      const arr = byId.get(f.overlayId) ?? [];
      arr.push(f);
      byId.set(f.overlayId, arr);
    }
    for (const [overlayId, items] of [...byId.entries()].sort()) {
      console.log(`\n  ${overlayId}`);
      for (const it of items) {
        console.log(`    • ${it.detail}`);
        if (it.evidence) console.log(`        ${it.evidence}`);
      }
    }
  }
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const f of scopedFindings) counts[f.category]++;
  console.log(
    `\n${scopedFindings.length} findings across ${scoped.length} overlays (A:${counts.A}  D:${counts.D}  C:${counts.C}  B:${counts.B}).`,
  );
  if (!strict && (counts.B > 0 || counts.C > 0) && counts.A === 0 && counts.D === 0) {
    console.log(
      "Cat A + D clean. Cat B/C are advisory — re-run with --strict to fail the build on them.",
    );
  }
}

// Default: fail only on actionable categories (A + D). --strict fails on any.
const blockingFindings = strict
  ? scopedFindings
  : scopedFindings.filter((f) => f.category === "A" || f.category === "D");
process.exit(blockingFindings.length > 0 ? 1 : 0);
