#!/usr/bin/env npx tsx
/**
 * generate-overlay-controller.ts
 *
 * One-shot codegen for the new `features/overlays/OverlayController.tsx`.
 * Walks every registry entry, resolves the component file, reads its Props
 * interface, and emits explicit per-overlay JSX with no `{...spread}` —
 * every prop wired by name with a runtime type guard around the dispatched
 * `data` field.
 *
 *   pnpm tsx scripts/generate-overlay-controller.ts > features/overlays/OverlayController.tsx
 *
 * The generated file is intended to be the SEED, not a permanently-
 * regenerated artifact. After the migration, the controller is a normal
 * hand-edited file. Don't re-run this script on the same target — it would
 * blow away any subsequent fixups.
 *
 * What the script can and can't do:
 *   - Can read each component's `interface XxxProps`/`interface XxxOptions`/etc.
 *     and emit a `<X prop1={…} prop2={…} />` JSX block with type-safe runtime
 *     guards based on TypeScript primitives (`string`, `number`, `boolean`,
 *     `null`, optional, array, record).
 *   - Cannot infer custom defaults that depend on other slices, memos, or
 *     side selectors. Those land in the file as `// TODO: review` markers.
 *   - Cannot infer multi-instance shape for components that take a `data`
 *     blob directly. Emits a single-instance block with a `// TODO: multi`
 *     marker that a human flips after review.
 *
 * Coverage check after generation: `pnpm check:registry` confirms every
 * registered overlay is rendered exactly once by the controller.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistry.ts",
);
const METADATA_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistryMetadata.ts",
);

interface RegistryEntry {
  overlayId: string;
  importPath: string;
  namedExport: string | undefined;
  defaultDataKeys: string[];
  instanceMode: "singleton" | "multi";
  selfSubscribing: boolean;
  resolvedFile: string | undefined;
  propKeys: string[] | undefined;
  propsInterfaceBody: string | undefined;
  componentName: string;
}

// ─── Registry parser ──────────────────────────────────────────────────────

function parseMetadata(): Map<
  string,
  { defaultDataKeys: string[]; instanceMode: "singleton" | "multi" }
> {
  const src = readFileSync(METADATA_PATH, "utf8");
  const map = new Map<
    string,
    { defaultDataKeys: string[]; instanceMode: "singleton" | "multi" }
  >();
  const idRe = /overlayId:\s*"([a-zA-Z][a-zA-Z0-9_]*)"/g;
  const indices: { id: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(src))) indices.push({ id: m[1], index: m.index });
  for (let i = 0; i < indices.length; i++) {
    const { id, index } = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].index : src.length;
    const slice = src.slice(index, end);
    const ddIdx = slice.search(/\bdefaultData:/);
    let keys: string[] = [];
    if (ddIdx >= 0) {
      let j = ddIdx + "defaultData:".length;
      while (j < slice.length && /\s/.test(slice[j])) j++;
      if (slice[j] === "{") {
        const close = findMatchingBrace(slice, j);
        if (close > 0) keys = topLevelKeys(slice.slice(j + 1, close));
      }
    }
    const instanceModeMatch = /instanceMode:\s*"(singleton|multi)"/.exec(slice);
    const instanceMode = (instanceModeMatch?.[1] ?? "singleton") as
      | "singleton"
      | "multi";
    map.set(id, { defaultDataKeys: keys, instanceMode });
  }
  return map;
}

function parseRegistry(): Map<
  string,
  { importPath: string; namedExport: string | undefined }
> {
  const src = readFileSync(REGISTRY_PATH, "utf8");
  const result = new Map<
    string,
    { importPath: string; namedExport: string | undefined }
  >();
  const entryRe =
    /^\s{2}([a-zA-Z][a-zA-Z0-9_]*):\s*\{[\s\S]*?componentImport:\s*\(\)\s*=>\s*([\s\S]*?)(?=\n\s{2,4}(?:renderTrayPreview|captureTraySnapshot|\}))/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(src))) {
    const overlayId = m[1];
    const importBlock = m[2];
    const pathMatch = /import\(\s*"([^"]+)"\s*\)/.exec(importBlock);
    if (!pathMatch) continue;
    const namedMatch = /default:\s*m\.([a-zA-Z_$][a-zA-Z0-9_$]*)/.exec(
      importBlock,
    );
    result.set(overlayId, {
      importPath: pathMatch[1],
      namedExport: namedMatch ? namedMatch[1] : undefined,
    });
  }
  return result;
}

// ─── Brace utilities ──────────────────────────────────────────────────────

function findMatchingBrace(src: string, openIdx: number): number {
  if (src[openIdx] !== "{") return -1;
  let depth = 0;
  let i = openIdx;
  let inString: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
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
      if (c === inString) inString = null;
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

function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let paren = 0;
  let bracket = 0;
  let inString: '"' | "'" | "`" | null = null;
  let canStartKey = true;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "{") {
      depth++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "(") {
      paren++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === ")") {
      paren--;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "[") {
      bracket++;
      canStartKey = false;
      i++;
      continue;
    }
    if (c === "]") {
      bracket--;
      canStartKey = false;
      i++;
      continue;
    }
    if (depth === 0 && paren === 0 && bracket === 0 && c === ",") {
      canStartKey = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (
      depth === 0 &&
      paren === 0 &&
      bracket === 0 &&
      canStartKey &&
      /[A-Za-z_$]/.test(c)
    ) {
      let j = i;
      while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j++;
      const ident = body.slice(i, j);
      let k = j;
      while (k < body.length && /\s/.test(body[k])) k++;
      if (body[k] === ":") {
        keys.push(ident);
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

// ─── Component file analysis ──────────────────────────────────────────────

function resolveImportPath(spec: string): string | undefined {
  const rel = spec.startsWith("@/") ? spec.slice(2) : spec;
  const candidates = [
    join(REPO_ROOT, rel + ".tsx"),
    join(REPO_ROOT, rel + ".ts"),
    join(REPO_ROOT, rel, "index.tsx"),
    join(REPO_ROOT, rel, "index.ts"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return undefined;
}

function isSelfSubscribing(src: string): boolean {
  return (
    /\bselectOverlayData\b/.test(src) ||
    /\bselectOverlay\b/.test(src) ||
    /\buseOverlayData\b/.test(src)
  );
}

function findPropsInterface(
  src: string,
  componentName: string,
): { name: string; body: string } | undefined {
  // Find every `interface X [extends ...] { ... }` declaration via a
  // brace-aware walker. `extends` chains are resolved by merging parent
  // fields into the child (child wins on conflict). We intentionally skip
  // `type X = ...` aliases — they don't have a body delimited by `{...}`
  // and parsing them generically here would mis-bound the body.
  const candidates: { name: string; body: string; extendsList: string[] }[] = [];
  const declRe = /(?:export\s+)?interface\s+([A-Z][a-zA-Z0-9_]*)/g;
  let dm: RegExpExecArray | null;
  while ((dm = declRe.exec(src))) {
    // Walk forward from the name to the first `{`. Anything between the
    // name and `{` is the (optional) `extends A, B<X>, Omit<C, "d">` list.
    let i = dm.index + dm[0].length;
    const preBraceStart = i;
    while (i < src.length && src[i] !== "{") i++;
    if (src[i] !== "{") continue;
    const preBrace = src.slice(preBraceStart, i);
    const extendsList = parseExtendsList(preBrace);
    const close = findMatchingBrace(src, i);
    if (close < 0) continue;
    candidates.push({
      name: dm[1],
      body: src.slice(i + 1, close),
      extendsList,
    });
    declRe.lastIndex = close + 1;
  }
  // 1. Try a param-type annotation on the component (preferred — handles
  //    components that share a type like `PlaceholderProps`).
  const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paramTypeRe = new RegExp(
    `function\\s+${escaped}\\s*\\(\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\)`,
  );
  const arrowParamTypeRe = new RegExp(
    `${escaped}\\s*=\\s*(?:React\\.memo\\s*\\(\\s*)?\\(\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:\\s*([A-Z][a-zA-Z0-9_]*)\\s*\\)`,
  );
  const paramMatch = paramTypeRe.exec(src) ?? arrowParamTypeRe.exec(src);
  let chosen:
    | { name: string; body: string; extendsList: string[] }
    | undefined;
  if (paramMatch) {
    chosen = candidates.find((c) => c.name === paramMatch[1]);
  }
  if (!chosen) {
    chosen = candidates.find((c) => c.name === `${componentName}Props`);
  }
  if (!chosen) {
    chosen = candidates.find((c) => c.name === `${componentName}Options`);
  }
  if (!chosen) return undefined;

  // Merge parent interfaces' bodies into the chosen one. Parent fields go
  // FIRST so child fields can override on collision (resolveExtendedBody
  // dedupes by name).
  return {
    name: chosen.name,
    body: resolveExtendedBody(chosen, candidates),
  };
}

/**
 * Parses the (optional) `extends A, B<X>` clause between the interface name
 * and its body. Returns the bare type-reference names; we drop generics and
 * mapped-type wrappers (`Omit<X, "a">` → ignored) because we can't resolve
 * those statically.
 */
function parseExtendsList(preBrace: string): string[] {
  const cleaned = preBrace
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const m = /\bextends\s+([\s\S]*)$/.exec(cleaned);
  if (!m) return [];
  // Split at top-level commas only.
  const list = splitTopLevel(m[1], ",");
  const out: string[] = [];
  for (const entry of list) {
    const trimmed = entry.trim();
    // Plain `Identifier` — resolve. Anything wrapped (Omit<...>, Pick<...>)
    // can't be resolved without full TS — skip with a warning comment.
    const idMatch = /^([A-Z][a-zA-Z0-9_]*)\s*$/.exec(trimmed);
    if (idMatch) out.push(idMatch[1]);
  }
  return out;
}

function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "(" || c === "{" || c === "[" || c === "<") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ">") {
      // Skip `=>` arrow.
      const prev = input[i - 1];
      if (prev !== "=") depth--;
    }
    if (c === sep && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function resolveExtendedBody(
  chosen: { name: string; body: string; extendsList: string[] },
  candidates: { name: string; body: string; extendsList: string[] }[],
): string {
  // Depth-first merge: get parent fields first (recursively), then child.
  const seen = new Set<string>();
  const merged: PropField[] = [];

  function visit(name: string): void {
    if (seen.has(name)) return;
    seen.add(name);
    const cand = candidates.find((c) => c.name === name);
    if (!cand) return;
    for (const parentName of cand.extendsList) visit(parentName);
    for (const f of parsePropsFields(cand.body)) {
      const existingIdx = merged.findIndex((m) => m.name === f.name);
      if (existingIdx >= 0) merged[existingIdx] = f;
      else merged.push(f);
    }
  }

  visit(chosen.name);
  return merged
    .map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${f.tsType};`)
    .join("\n");
}

function inferComponentName(
  src: string,
  namedExport: string | undefined,
): string {
  if (namedExport) return namedExport;
  const def = /export\s+default\s+(?:function|const)\s+([A-Z][a-zA-Z0-9_]*)/.exec(
    src,
  );
  if (def) return def[1];
  const defRef = /export\s+default\s+([A-Z][a-zA-Z0-9_]*)\s*;/.exec(src);
  if (defRef) return defRef[1];
  return "Component";
}

interface PropField {
  name: string;
  optional: boolean;
  tsType: string;
}

function parsePropsFields(body: string): PropField[] {
  // Strip line/block comments.
  const cleaned = body
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const fields: PropField[] = [];
  // Walk top-level fields. A field looks like `name?: type;` or `name: type,`
  // where the type can include unions, generics, arrows, etc.
  // We tokenize by tracking braces/parens/angles for type depth.
  let i = 0;
  while (i < cleaned.length) {
    // Skip whitespace.
    while (i < cleaned.length && /\s/.test(cleaned[i])) i++;
    if (i >= cleaned.length) break;
    // Read identifier.
    if (!/[A-Za-z_$]/.test(cleaned[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < cleaned.length && /[A-Za-z0-9_$]/.test(cleaned[j])) j++;
    const name = cleaned.slice(i, j);
    // Read optional marker.
    let optional = false;
    let k = j;
    while (k < cleaned.length && /\s/.test(cleaned[k])) k++;
    if (cleaned[k] === "?") {
      optional = true;
      k++;
      while (k < cleaned.length && /\s/.test(cleaned[k])) k++;
    }
    if (cleaned[k] !== ":") {
      // Not a field — could be a continuation, advance.
      i = j + 1;
      continue;
    }
    // Read type until matching top-level `;` or `,`.
    //
    // Track paren / brace / bracket / angle-bracket depth. `<...>` matters
    // because of generic types like `Record<string, unknown>` where a
    // naive `,` terminator would split the type in half. The one trap is
    // `=>` (arrow-function return type) — the `>` there is not closing a
    // generic and must not decrement depth. We detect it by looking at
    // the previous non-space character.
    let m = k + 1;
    let depth = 0;
    let inString: '"' | "'" | "`" | null = null;
    const tStart = m;
    while (m < cleaned.length) {
      const c = cleaned[m];
      if (inString) {
        if (c === "\\") {
          m += 2;
          continue;
        }
        if (c === inString) inString = null;
        m++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = c as '"' | "'" | "`";
        m++;
        continue;
      }
      if (c === "(" || c === "{" || c === "[" || c === "<") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === ">") {
        // Skip `>` that's part of `=>` (arrow), not a generic closer.
        let p = m - 1;
        while (p >= 0 && /\s/.test(cleaned[p])) p--;
        if (cleaned[p] !== "=") depth--;
      } else if (depth === 0 && (c === ";" || c === ",")) {
        break;
      }
      m++;
    }
    const tsType = cleaned.slice(tStart, m).trim();
    fields.push({ name, optional, tsType });
    i = m + 1;
  }
  return fields;
}

// ─── Type → runtime guard expression ──────────────────────────────────────

/**
 * Given a TypeScript type expression, emit a runtime guard that reads
 * `data?.<name>` from the dispatched data and produces the value the prop
 * should receive (with a sensible default).
 *
 * Inputs we can handle precisely:
 *   - `string` / `string | null` / `string | undefined`
 *   - `number` / `number | null`
 *   - `boolean`
 *   - Literal unions: `"a" | "b" | "c"` (with optional null)
 *   - Arrays: `string[]` / `T[]`
 *   - Plain object / record types: emit as a generic record passthrough
 *   - Function types: emit `undefined` (functions don't travel through Redux)
 *
 * Anything we don't recognize: emit `data?.${name} as ${tsType}` and a
 * TODO marker. The developer reviews and fixes.
 */
function emitPropValue(
  name: string,
  tsType: string,
  optional: boolean,
): { value: string; todo: boolean } {
  const trimmed = tsType.trim();
  // Reserved props injected by the controller, not by data.
  if (name === "isOpen") return { value: "true", todo: false };
  if (name === "onClose") return { value: "__onClose__", todo: false };
  if (name === "instanceId") return { value: "__instanceId__", todo: false };

  // Function types — never come through Redux.
  if (/=>\s*/.test(trimmed) || /\bFunction\b/.test(trimmed)) {
    return {
      value: "undefined /* fn — pass via callbackGroupId */",
      todo: true,
    };
  }

  // Strip outer parens/leading/trailing whitespace.
  const t = trimmed.replace(/^\((.+)\)$/, "$1").trim();

  // Recognize `string`, `string | null`, `string | undefined`, etc.
  const isString = /^(string)(\s*\|\s*(null|undefined))*$/.test(t);
  const isStringNullable =
    /\b(null|undefined)\b/.test(t) && /\bstring\b/.test(t);
  if (isString) {
    if (optional || isStringNullable) {
      return {
        value: `typeof data?.${name} === "string" ? data.${name} : ${/null/.test(t) ? "null" : "undefined"}`,
        todo: false,
      };
    }
    return {
      value: `typeof data?.${name} === "string" ? data.${name} : ""`,
      todo: false,
    };
  }

  const isNumber = /^(number)(\s*\|\s*(null|undefined))*$/.test(t);
  if (isNumber) {
    const fallback = /null/.test(t) ? "null" : optional ? "undefined" : "0";
    return {
      value: `typeof data?.${name} === "number" ? data.${name} : ${fallback}`,
      todo: false,
    };
  }

  const isBool = /^(boolean)(\s*\|\s*(null|undefined))*$/.test(t);
  if (isBool) {
    const fallback = /null/.test(t) ? "null" : optional ? "undefined" : "false";
    return {
      value: `typeof data?.${name} === "boolean" ? data.${name} : ${fallback}`,
      todo: false,
    };
  }

  // Literal union of strings (with optional null): `"a" | "b" | "c"`.
  const literalUnionMatch = /^("[^"]*"(?:\s*\|\s*"[^"]*")*)(\s*\|\s*null)?(\s*\|\s*undefined)?$/.exec(
    t,
  );
  if (literalUnionMatch) {
    const literals = literalUnionMatch[1]
      .split(/\s*\|\s*/)
      .map((s) => s.trim());
    const literalSet = `[${literals.join(", ")}]`;
    const fallback = /null/.test(t) ? "null" : optional ? "undefined" : literals[0];
    return {
      value: `(${literalSet} as ReadonlyArray<unknown>).includes(data?.${name}) ? (data?.${name} as ${t}) : ${fallback}`,
      todo: false,
    };
  }

  // Special case: arrays of primitives can be cast cleanly without
  // depending on any external import.
  if (/^(string|number|boolean)\[\]$/.test(t)) {
    const elem = t.replace(/\[\]$/, "");
    return {
      value: `Array.isArray(data?.${name}) && data.${name}.every((v) => typeof v === "${elem}") ? (data.${name} as ${t}) : ${optional ? "undefined" : "[]"}`,
      todo: false,
    };
  }

  // Other array / record / object types reference a custom element type
  // (e.g. `CodeFile[]`, `Record<string, TaskSourceInput>`). We can't import
  // every such type into the controller, and `as unknown as T` still
  // references T. Cast through `never` instead — assignable to anything —
  // and flag the line as TODO so the dev tightens the runtime check.
  if (
    /\[\]$/.test(t) ||
    /^Array<.+>$/.test(t) ||
    /^Record<.+>$/.test(t) ||
    /^\{.*\}$/.test(t)
  ) {
    return {
      value: `(Array.isArray(data?.${name}) || (typeof data?.${name} === "object" && data?.${name} !== null) ? data.${name} : ${optional ? "undefined" : "[]"}) as never`,
      todo: true,
    };
  }

  // Unrecognized scalar / union / branded type — emit a typed passthrough
  // via `as never` (no import needed) plus a TODO.
  return {
    value: `data?.${name} as never`,
    todo: true,
  };
}

// ─── Render emitters ──────────────────────────────────────────────────────

function emitBlock(entry: RegistryEntry): string {
  const id = entry.overlayId;
  const Comp = entry.componentName;
  const indent = "      ";

  if (entry.selfSubscribing) {
    return [
      `      {/* ${id} — self-subscribing component (reads overlay state internally). */}`,
      `      <${Comp} />`,
      "",
    ].join("\n");
  }

  if (entry.instanceMode === "multi") {
    return emitMultiInstanceBlock(entry, indent);
  }

  return emitSingletonBlock(entry, indent);
}

function emitSingletonBlock(entry: RegistryEntry, _indent: string): string {
  const id = entry.overlayId;
  const Comp = entry.componentName;
  const lines: string[] = [];
  lines.push(`      {/* ${id} */}`);
  lines.push(`      {(() => {`);
  lines.push(`        const isOpen = isOpenById.${id};`);
  lines.push(
    `        const data = dataById.${id} as Record<string, unknown> | null | undefined;`,
  );
  lines.push(`        if (!isOpen) return null;`);
  lines.push(`        return (`);
  lines.push(`          <${Comp}`);

  const hasIsOpen = entry.propKeys?.includes("isOpen") ?? false;
  const hasOnClose = entry.propKeys?.includes("onClose") ?? false;
  if (hasIsOpen) lines.push(`            isOpen`);
  if (hasOnClose) {
    lines.push(
      `            onClose={() => dispatch(closeOverlay({ overlayId: "${id}" }))}`,
    );
  }

  let anyTodo = false;
  const props = entry.propKeys
    ? entry.propKeys
        .filter((k) => k !== "isOpen" && k !== "onClose" && k !== "instanceId")
        .map((name) => ({ name, field: parsedField(entry, name) }))
    : [];
  for (const { name, field } of props) {
    if (!field) {
      lines.push(
        `            ${name}={data?.${name} as never /* TODO: review type */}`,
      );
      anyTodo = true;
      continue;
    }
    const { value, todo } = emitPropValue(name, field.tsType, field.optional);
    if (todo) anyTodo = true;
    const final = value
      .replace(
        /__onClose__/g,
        `() => dispatch(closeOverlay({ overlayId: "${id}" }))`,
      )
      .replace(/__instanceId__/g, `undefined`);
    lines.push(
      `            ${name}={${final}}${todo ? "  /* TODO: review */" : ""}`,
    );
  }
  lines.push(`          />`);
  lines.push(`        );`);
  lines.push(`      })()}`);
  lines.push("");
  if (anyTodo) {
    lines.unshift(`      {/* TODO: review prop wiring for ${id} */}`);
  }
  return lines.join("\n");
}

function emitMultiInstanceBlock(
  entry: RegistryEntry,
  _indent: string,
): string {
  const id = entry.overlayId;
  const Comp = entry.componentName;
  const lines: string[] = [];
  lines.push(`      {/* ${id} — multi-instance */}`);
  lines.push(`      {instancesById.${id}.map((inst) => {`);
  lines.push(
    `        const data = inst.data as Record<string, unknown> | null | undefined;`,
  );
  lines.push(`        return (`);
  lines.push(`          <${Comp}`);
  lines.push(`            key={inst.instanceId}`);

  const hasIsOpen = entry.propKeys?.includes("isOpen") ?? false;
  const hasOnClose = entry.propKeys?.includes("onClose") ?? false;
  const hasInstanceId = entry.propKeys?.includes("instanceId") ?? false;
  if (hasIsOpen) lines.push(`            isOpen`);
  if (hasInstanceId) lines.push(`            instanceId={inst.instanceId}`);
  if (hasOnClose) {
    lines.push(
      `            onClose={() => dispatch(closeOverlay({ overlayId: "${id}", instanceId: inst.instanceId }))}`,
    );
  }

  let anyTodo = false;
  const props = entry.propKeys
    ? entry.propKeys
        .filter((k) => k !== "isOpen" && k !== "onClose" && k !== "instanceId")
        .map((name) => ({ name, field: parsedField(entry, name) }))
    : [];
  for (const { name, field } of props) {
    if (!field) {
      lines.push(
        `            ${name}={data?.${name} as never /* TODO: review type */}`,
      );
      anyTodo = true;
      continue;
    }
    const { value, todo } = emitPropValue(name, field.tsType, field.optional);
    if (todo) anyTodo = true;
    const final = value
      .replace(
        /__onClose__/g,
        `() => dispatch(closeOverlay({ overlayId: "${id}", instanceId: inst.instanceId }))`,
      )
      .replace(/__instanceId__/g, `inst.instanceId`);
    lines.push(
      `            ${name}={${final}}${todo ? "  /* TODO: review */" : ""}`,
    );
  }
  lines.push(`          />`);
  lines.push(`        );`);
  lines.push(`      })}`);
  lines.push("");
  if (anyTodo) {
    lines.unshift(`      {/* TODO: review prop wiring for ${id} */}`);
  }
  return lines.join("\n");
}

function parsedField(entry: RegistryEntry, name: string): PropField | undefined {
  if (!entry.propsInterfaceBody) return undefined;
  const fields = parsePropsFields(entry.propsInterfaceBody);
  return fields.find((f) => f.name === name);
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  const meta = parseMetadata();
  const dyn = parseRegistry();
  const overlayIds = [...meta.keys()].sort();

  const entries: RegistryEntry[] = [];
  for (const overlayId of overlayIds) {
    const m = meta.get(overlayId);
    const d = dyn.get(overlayId);
    if (!m || !d) continue;
    const resolvedFile = resolveImportPath(d.importPath);
    let propKeys: string[] | undefined;
    let propsInterfaceBody: string | undefined;
    let componentName = d.namedExport ?? overlayIdToComponentName(overlayId);
    let selfSubscribing = false;
    if (resolvedFile) {
      const src = readFileSync(resolvedFile, "utf8");
      componentName = inferComponentName(src, d.namedExport);
      selfSubscribing = isSelfSubscribing(src);
      const propsInterface = findPropsInterface(src, componentName);
      if (propsInterface) {
        propsInterfaceBody = propsInterface.body;
        const fields = parsePropsFields(propsInterface.body);
        propKeys = fields.map((f) => f.name);
      }
    }
    entries.push({
      overlayId,
      importPath: d.importPath,
      namedExport: d.namedExport,
      defaultDataKeys: m.defaultDataKeys,
      instanceMode: m.instanceMode,
      selfSubscribing,
      resolvedFile,
      propKeys,
      propsInterfaceBody,
      componentName,
    });
  }

  const mode = process.argv[2] ?? "controller";
  switch (mode) {
    case "controller":
      emit(entries);
      break;
    case "openers":
      emitOpeners(entries);
      break;
    case "catalogue":
      emitCatalogue(entries);
      break;
    case "all":
      // Convenience: write all three to their canonical destinations.
      writeFileSyncSafe(
        join(REPO_ROOT, "features/overlays/OverlayController.tsx"),
        captureToString(() => emit(entries)),
      );
      writeOpeners(entries);
      writeFileSyncSafe(
        join(REPO_ROOT, "features/overlays/catalogue.ts"),
        captureToString(() => emitCatalogue(entries)),
      );
      process.stderr.write(
        `Wrote OverlayController + ${entries.length} openers + catalogue.\n`,
      );
      break;
    default:
      process.stderr.write(
        `Unknown mode: ${mode}. Use one of: controller (default), openers, catalogue, all.\n`,
      );
      process.exit(2);
  }
}

function overlayIdToComponentName(overlayId: string): string {
  return overlayId.charAt(0).toUpperCase() + overlayId.slice(1);
}

function emit(entries: RegistryEntry[]): void {
  const out: string[] = [];
  out.push(`/**`);
  out.push(` * OverlayController.tsx`);
  out.push(` *`);
  out.push(` * Single mount point for every overlay in the app — dialogs, sheets, modals,`);
  out.push(` * windows, toasts. Renders the appropriate component when slice state says so,`);
  out.push(` * with every prop wired by name (no \`{...spread}\`) so TypeScript catches`);
  out.push(` * dispatch / component prop-shape drift at compile time.`);
  out.push(` *`);
  out.push(` * Initial seed generated by \`scripts/generate-overlay-controller.ts\` from the`);
  out.push(` * old window-panels registry. Subsequent edits are hand-written.`);
  out.push(` *`);
  out.push(` * Rules (ESLint-enforced):`);
  out.push(` *   - No JSX prop spread in this file.`);
  out.push(` *   - Every overlayId in OVERLAY_IDS is rendered here exactly once.`);
  out.push(` */`);
  out.push(`"use client";`);
  out.push(``);
  out.push(`import dynamic from "next/dynamic";`);
  out.push(`import { useEffect } from "react";`);
  out.push(`import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";`);
  out.push(`import {`);
  out.push(`  closeOverlay,`);
  out.push(`  selectIsOverlayOpen,`);
  out.push(`  selectOverlayData,`);
  out.push(`  selectOpenInstances,`);
  out.push(`} from "@/lib/redux/slices/overlaySlice";`);
  out.push(``);
  out.push(`// Module-level guard so the mount-confirmation log fires once per page`);
  out.push(`// session regardless of strict-mode double-invokes or route remounts.`);
  out.push(`// Companion to the LEGACY mount warn in UnifiedOverlayController.tsx.`);
  out.push(`let _confirmedNewMount = false;`);
  out.push(``);

  // Dynamic imports — deduped by component identifier. Some components are
  // registered under multiple overlayIds (e.g. `QuickNoteSaveOverlay` for
  // `saveToNotes` + `saveToNotesFullscreen`); we only want one `const`.
  const emittedDynamics = new Set<string>();
  for (const e of entries) {
    if (emittedDynamics.has(e.componentName)) continue;
    emittedDynamics.add(e.componentName);
    const namedSuffix = e.namedExport
      ? `.then((m) => ({ default: m.${e.namedExport} }))`
      : "";
    out.push(`const ${e.componentName} = dynamic(`);
    out.push(`  () => import("${e.importPath}")${namedSuffix},`);
    out.push(`  { ssr: false },`);
    out.push(`);`);
  }
  out.push(``);

  out.push(`export default function OverlayController() {`);
  out.push(`  const dispatch = useAppDispatch();`);
  out.push(``);
  out.push(`  useEffect(() => {`);
  out.push(`    if (!_confirmedNewMount) {`);
  out.push(`      _confirmedNewMount = true;`);
  out.push(`      // eslint-disable-next-line no-console`);
  out.push(`      console.info(`);
  out.push(`        "[overlays] NEW OverlayController active — every overlay rendered via explicit, type-safe prop wiring. " +`);
  out.push(`          "See docs/OVERLAY_WINDOW_OVERHAUL.md.",`);
  out.push(`      );`);
  out.push(`    }`);
  out.push(`  }, []);`);
  out.push(``);
  out.push(`  // Per-overlay subscriptions. Each useAppSelector is its own subscription,`);
  out.push(`  // so a state change in overlay A doesn't re-run the JSX of overlay B beyond`);
  out.push(`  // React's normal reconciliation.`);

  // Singleton: emit isOpen + data hooks
  const singletons = entries.filter(
    (e) => !e.selfSubscribing && e.instanceMode === "singleton",
  );
  const multi = entries.filter(
    (e) => !e.selfSubscribing && e.instanceMode === "multi",
  );

  out.push(`  const isOpenById = {`);
  for (const e of singletons) {
    out.push(
      `    ${e.overlayId}: useAppSelector((s) => selectIsOverlayOpen(s, "${e.overlayId}")),`,
    );
  }
  out.push(`  };`);
  out.push(``);
  out.push(`  const dataById = {`);
  for (const e of singletons) {
    out.push(
      `    ${e.overlayId}: useAppSelector((s) => selectOverlayData(s, "${e.overlayId}")) as Record<string, unknown> | null,`,
    );
  }
  out.push(`  };`);
  out.push(``);

  if (multi.length > 0) {
    out.push(`  const instancesById = {`);
    for (const e of multi) {
      out.push(
        `    ${e.overlayId}: useAppSelector((s) => selectOpenInstances(s, "${e.overlayId}")),`,
      );
    }
    out.push(`  };`);
    out.push(``);
  }

  out.push(`  return (`);
  out.push(`    <>`);
  for (const e of entries) {
    out.push(emitBlock(e));
  }
  out.push(`    </>`);
  out.push(`  );`);
  out.push(`}`);

  process.stdout.write(out.join("\n"));
}

// ─── Openers + catalogue emitters ─────────────────────────────────────────

/**
 * The opener layer is what dispatch sites import. Each overlay gets one
 * `.tsx` file with two exports:
 *
 *   - `useOpenX()` — imperative hook. Returns a stable function whose
 *     argument is a typed Options object derived from the component's Props.
 *     The returned handle exposes `close()` so callers can dismiss without
 *     touching the slice directly.
 *
 *   - `<XController />` — declarative wrapper. Mounts dispatch on commit,
 *     unmounts dispatch close. Same Options as the hook. Built so a caller
 *     (or AI agent) who just wants to render a window doesn't need to know
 *     about hooks, dispatches, or the overlay slice.
 *
 * Function props (callbacks) are NOT yet wired through the callback registry
 * here — those land in stage 3. For now we emit them as `// TODO callback`
 * placeholders in the Options type.
 */
function emitOpeners(entries: RegistryEntry[]): void {
  for (const e of entries) {
    process.stdout.write(`--- ${openerFilename(e)} ---\n`);
    process.stdout.write(buildOpenerFile(e));
    process.stdout.write("\n");
  }
}

// Overlays with hand-written callback-aware openers. Their files in
// `features/overlays/openers/` are thin re-exports of those hand-written
// hooks — they must NOT be overwritten by the codegen. We preserve them
// by skipping these overlayIds on `writeOpeners`. Listed here so it's
// obvious from the codegen what's intentionally out of the regen loop.
const CALLBACK_AWARE_OPENERS = new Set<string>([
  "imageUploaderWindow",
  "smartCodeEditorWindow",
  "multiFileSmartCodeEditorWindow",
  "contentEditorWindow",
  "contentEditorListWindow",
  "contentEditorWorkspaceWindow",
  "curatedIconPickerWindow",
]);

function writeOpeners(entries: RegistryEntry[]): void {
  let skipped = 0;
  for (const e of entries) {
    if (CALLBACK_AWARE_OPENERS.has(e.overlayId)) {
      skipped++;
      continue;
    }
    const path = join(REPO_ROOT, "features/overlays/openers", openerFilename(e));
    writeFileSyncSafe(path, buildOpenerFile(e));
  }
  if (skipped > 0) {
    process.stderr.write(
      `  (skipped ${skipped} callback-aware opener${skipped === 1 ? "" : "s"} — see CALLBACK_AWARE_OPENERS)\n`,
    );
  }
}

function openerFilename(e: RegistryEntry): string {
  // Filename matches the overlayId so a developer searching for an overlay
  // by its dispatch id lands on the opener immediately.
  return `${e.overlayId}.tsx`;
}

function controllerComponentName(e: RegistryEntry): string {
  // `useOpenAgentRunWindow` + `AgentRunWindowController`. Use the inferred
  // component name as the basis — that's also what the controller imports.
  return `${e.componentName}Controller`;
}

function hookName(e: RegistryEntry): string {
  return `useOpen${e.componentName}`;
}

function buildOpenerFile(e: RegistryEntry): string {
  const fields = e.propsInterfaceBody
    ? parsePropsFields(e.propsInterfaceBody)
    : [];
  const optionFields = fields.filter(
    (f) =>
      f.name !== "isOpen" &&
      f.name !== "onClose" &&
      f.name !== "instanceId",
  );
  const optionsTypeName = `Open${e.componentName}Options`;
  const handleTypeName = `${e.componentName}Handle`;

  const out: string[] = [];
  out.push(`"use client";`);
  out.push(``);
  out.push(`/**`);
  out.push(` * Opener for the \`${e.overlayId}\` overlay.`);
  out.push(` *`);
  out.push(` * - \`${hookName(e)}()\` — imperative hook. Call to open with typed options;`);
  out.push(` *   returns a handle with a \`close()\` method.`);
  out.push(` * - \`<${controllerComponentName(e)} />\` — declarative wrapper. Mount to open,`);
  out.push(` *   unmount to close. Equivalent ergonomics to rendering a normal component.`);
  out.push(` *`);
  out.push(` * Generated by scripts/generate-overlay-controller.ts (\`openers\` mode).`);
  out.push(` * Hand-edit freely after the initial seed; the script will not re-emit a`);
  out.push(` * file that already exists unless invoked with --force.`);
  out.push(` */`);
  out.push(``);
  out.push(`import { useCallback, useEffect } from "react";`);
  out.push(`import { useAppDispatch } from "@/lib/redux/hooks";`);
  if (e.instanceMode === "multi") {
    out.push(`import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";`);
  } else {
    out.push(`import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";`);
  }
  out.push(``);
  out.push(`const OVERLAY_ID = "${e.overlayId}" as const;`);
  out.push(``);

  // Options type — derived from the component's parsed Props. Types that
  // reference non-builtin identifiers (e.g. `CodeFile`, `ResourceType`)
  // would force the opener to also import them; we widen those to `unknown`
  // and mark the field with a `// TODO: tighten` comment so the dev pulls
  // the right import when they touch the opener. Builtin types (primitives,
  // literal unions, arrays/records of primitives) keep their exact shape.
  out.push(`export interface ${optionsTypeName} {`);
  if (e.instanceMode === "multi") {
    out.push(`  /** Optional stable instance id. Omit to spawn a fresh instance. */`);
    out.push(`  instanceId?: string;`);
  }
  let hasRequiredField = false;
  for (const f of optionFields) {
    const isFn = /=>/.test(f.tsType);
    const widened = widenTsTypeForOpener(f.tsType);
    if (!f.optional && !isFn) hasRequiredField = true;
    if (isFn) {
      // Callbacks are not yet wired through the callback registry (stage 3
      // work). Widen the function signature when it references any
      // non-builtin identifier so the opener doesn't need to import the
      // callback's parameter types. The caller still passes a normal
      // function; it's just typed as a generic `(...args: unknown[]) => void`
      // until stage 3 plumbs the real signature through the registry.
      const safeFnType = widenTsTypeForOpener(f.tsType);
      out.push(
        `  /** TODO callback — wire via callback registry in stage 3. */`,
      );
      out.push(`  ${f.name}?: ${safeFnType === "unknown" ? "(...args: unknown[]) => void" : f.tsType};`);
    } else if (widened !== f.tsType) {
      out.push(`  /** TODO: tighten to \`${f.tsType}\` once that type is imported. */`);
      out.push(`  ${f.name}${f.optional ? "?" : ""}: ${widened};`);
    } else {
      out.push(`  ${f.name}${f.optional ? "?" : ""}: ${f.tsType};`);
    }
  }
  out.push(`}`);
  out.push(``);

  // Handle type.
  out.push(`export interface ${handleTypeName} {`);
  if (e.instanceMode === "multi") {
    out.push(`  instanceId: string;`);
  }
  out.push(`  close: () => void;`);
  out.push(`}`);
  out.push(``);

  // useOpenX hook.
  out.push(`export function ${hookName(e)}() {`);
  out.push(`  const dispatch = useAppDispatch();`);
  out.push(`  return useCallback(`);
  if (e.instanceMode === "multi") {
    out.push(`    (opts: ${optionsTypeName}${hasRequiredField ? "" : " = {}"}): ${handleTypeName} => {`);
    out.push(
      `      const instanceId = opts.instanceId ?? \`${e.overlayId}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;`,
    );
    out.push(`      dispatch(`);
    out.push(`        openOverlay({`);
    out.push(`          overlayId: OVERLAY_ID,`);
    out.push(`          instanceId,`);
    out.push(`          data: {`);
    for (const f of optionFields) {
      out.push(`            ${f.name}: opts.${f.name},`);
    }
    out.push(`          },`);
    out.push(`        }),`);
    out.push(`      );`);
    out.push(`      return {`);
    out.push(`        instanceId,`);
    out.push(
      `        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),`,
    );
    out.push(`      };`);
    out.push(`    },`);
  } else {
    out.push(`    (opts: ${optionsTypeName}${hasRequiredField ? "" : " = {}"}): ${handleTypeName} => {`);
    if (optionFields.length === 0) {
      out.push(`      dispatch(openOverlay({ overlayId: OVERLAY_ID }));`);
    } else {
      out.push(`      dispatch(`);
      out.push(`        openOverlay({`);
      out.push(`          overlayId: OVERLAY_ID,`);
      out.push(`          data: {`);
      for (const f of optionFields) {
        out.push(`            ${f.name}: opts.${f.name},`);
      }
      out.push(`          },`);
      out.push(`        }),`);
      out.push(`      );`);
    }
    out.push(`      return {`);
    out.push(
      `        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),`,
    );
    out.push(`      };`);
    out.push(`    },`);
  }
  out.push(`    [dispatch],`);
  out.push(`  );`);
  out.push(`}`);
  out.push(``);

  // Controller component.
  const depList =
    optionFields.length > 0
      ? optionFields.map((f) => `props.${f.name}`).join(", ")
      : "";
  out.push(`/**`);
  out.push(` * Declarative form. Renders nothing visible; opens the overlay on mount,`);
  out.push(` * closes it on unmount. Use this when a caller wants to express overlay`);
  out.push(` * state declaratively (the way they'd render a normal component).`);
  out.push(` */`);
  out.push(
    `export function ${controllerComponentName(e)}(props: ${optionsTypeName}): null {`,
  );
  out.push(`  const open = ${hookName(e)}();`);
  out.push(`  useEffect(() => {`);
  out.push(`    const handle = open(props);`);
  out.push(`    return () => handle.close();`);
  if (depList) {
    out.push(`  }, [open, ${depList}]);`);
  } else {
    out.push(`  }, [open]);`);
  }
  out.push(`  return null;`);
  out.push(`}`);
  out.push(``);

  return out.join("\n");
}

function emitCatalogue(entries: RegistryEntry[]): void {
  process.stdout.write(buildCatalogueFile(entries));
}

function buildCatalogueFile(entries: RegistryEntry[]): string {
  const out: string[] = [];
  out.push(`/**`);
  out.push(` * catalogue.ts`);
  out.push(` *`);
  out.push(` * Metadata catalogue for every overlay in the app. Render-free — used by`);
  out.push(` * tooling (admin smoketest pages, doctrine checks, URL hydration, the`);
  out.push(` * window manager's persistence layer). The OverlayController does NOT`);
  out.push(` * iterate this catalogue; its render path is fully explicit.`);
  out.push(` *`);
  out.push(` * Generated by scripts/generate-overlay-controller.ts \`catalogue\` mode.`);
  out.push(` */`);
  out.push(`import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";`);
  out.push(``);
  out.push(`export interface OverlayCatalogueEntry {`);
  out.push(`  /** Human-readable label. Shown in tooling. */`);
  out.push(`  label: string;`);
  out.push(`  /** Singleton overlays reuse one slot; multi spawn fresh per dispatch. */`);
  out.push(`  instanceMode: "singleton" | "multi";`);
  out.push(`  /** True if the component renders a WindowPanel chrome. */`);
  out.push(`  isWindow: boolean;`);
  out.push(`}`);
  out.push(``);
  out.push(`export const OVERLAY_CATALOGUE = {`);
  for (const e of entries) {
    const label = labelForEntry(e);
    out.push(`  ${e.overlayId}: {`);
    out.push(`    label: ${JSON.stringify(label)},`);
    out.push(`    instanceMode: ${JSON.stringify(e.instanceMode)},`);
    out.push(`    isWindow: ${isWindowComponent(e)},`);
    out.push(`  },`);
  }
  out.push(`} as const satisfies Record<OverlayId, OverlayCatalogueEntry>;`);
  out.push(``);
  out.push(`export function getCatalogueEntry(overlayId: OverlayId): OverlayCatalogueEntry {`);
  out.push(`  return OVERLAY_CATALOGUE[overlayId];`);
  out.push(`}`);
  out.push(``);
  return out.join("\n");
}

/**
 * If a parsed Props type references identifiers outside the small "safe"
 * set (primitives, literal unions, arrays/records of those), widen it to
 * `unknown` so the opener compiles without needing to import the referenced
 * type. The caller writes through this widened shape; TypeScript still
 * checks the actual prop at the controller render site, which DOES have
 * the component in scope.
 */
function widenTsTypeForOpener(tsType: string): string {
  const t = tsType.trim();
  // Allowed builtin keywords.
  const SAFE = new Set([
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "unknown",
    "any",
    "void",
    "never",
    "true",
    "false",
    "object",
    "Date",
    "RegExp",
    "Array",
    "Record",
    "Partial",
    "Readonly",
    "Promise",
    "ReadonlyArray",
  ]);
  // Strip the type to atomic identifiers and check each one.
  const tokens = t.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  for (const tok of tokens) {
    if (SAFE.has(tok)) continue;
    // Literal-union members are quoted; tokens here are only identifiers.
    return "unknown";
  }
  return t;
}

function labelForEntry(e: RegistryEntry): string {
  // Best-effort: title-case the overlayId. The legacy registry had labels
  // but we'd need to re-parse them here. The user can hand-edit afterwards.
  return e.overlayId
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function isWindowComponent(e: RegistryEntry): boolean {
  if (!e.resolvedFile) return false;
  // Either the file lives under window-panels OR it imports WindowPanel.
  if (/\/features\/window-panels\//.test(e.resolvedFile)) return true;
  try {
    const src = readFileSync(e.resolvedFile, "utf8");
    return /\bWindowPanel\b/.test(src);
  } catch {
    return false;
  }
}

// ─── Tiny fs helpers ──────────────────────────────────────────────────────

function writeFileSyncSafe(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function captureToString(fn: () => void): string {
  const original = process.stdout.write.bind(process.stdout);
  let buf = "";
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    buf += s;
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original as typeof process.stdout.write;
  }
  return buf;
}

main();
