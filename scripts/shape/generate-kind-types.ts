#!/usr/bin/env tsx
/**
 * generate-kind-types — the registry→TypeScript codegen (KINDS_EVERYWHERE_PLAN
 * §4.3 + §10g GAP 1). Reads `content_ir.kind_definition.emitted_json_schema`
 * for EVERY active kind from the LIVE registry and emits ONE artifact:
 *
 *   features/content-ir/kinds/generated/kinds.generated.ts
 *
 * That file is the ONLY place a kind payload shape is written down in this
 * repo. Arman's standard — *"they'll never be type errors"* — is only real if
 * the types every renderer, bridge and surface consumes come from the registry
 * itself. A hand-written payload interface beside a kind is the defect the
 * generator exists to delete.
 *
 *   pnpm shape:types          # regenerate the artifact
 *   pnpm check:kind-types     # freshness gate: regenerate in memory, diff,
 *                             # exit 1 on drift (CI-blocking)
 *
 * Precedent: `scripts/generate-entity-types.ts` (ONE artifact, `--check`
 * freshness guard, DB is the source of truth, never hand-edit).
 *
 * Rules:
 * - The REGISTRY is the source of truth. Never hand-edit the artifact — edit
 *   the kind (pydantic in aidream, or the TS-owned `KindSchema` in a bridge),
 *   re-seed/re-emit the registry row, re-run this.
 * - NESTED KINDS REFERENCE, THEY DO NOT DUPLICATE. When a `$defs` entry is
 *   itself a registered active kind (its `__kind` const says so, or
 *   `content_ir.kind_edge` declares the parent.field → child relationship),
 *   the generated property points at that kind's own interface. One shape,
 *   one type, everywhere — the whole point of the graph.
 * - Non-kind `$defs` are deduped by STRUCTURE across the registry: 58 kinds
 *   carrying an identical `JsonValue` get one `JsonValue`. Names that carry
 *   two different structures (or collide with a kind's own name) are
 *   disambiguated by their owning kind, deterministically.
 * - Fidelity over convenience: required/optional/nullable mirror the schema
 *   exactly. pydantic leaves defaulted fields (incl. `__kind`) out of
 *   `required`, so they generate as optional — the serializer always emits
 *   them, but the TYPE tells the truth about what validation guarantees.
 * - Mid-stream envelope values are PARTIAL; these types describe the COMPLETE
 *   instance. Streaming components keep their defensive value readers.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = resolve(ROOT, "features", "content-ir", "kinds", "generated");
export const GENERATED_REL = "features/content-ir/kinds/generated/kinds.generated.ts";
const OUT_PATH = resolve(OUT_DIR, "kinds.generated.ts");

// ── helpers ─────────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  console.error(`\x1b[31m\x1b[1mgenerate-kind-types:\x1b[0m ${message}`);
  process.exit(1);
}

function literal(value: unknown): string {
  return JSON.stringify(value);
}

/** Deterministic structural hash of a schema node (key order irrelevant). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 12);
}

/** PascalCase identifier from a slug / def name. */
function pascal(name: string): string {
  const parts = name.split(/[_\-\s]+/).filter(Boolean);
  const joined = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[A-Za-z]/.test(joined) ? joined : `Kind${joined}`;
}

/**
 * TS/global names a generated interface must never take — shadowing `Boolean`
 * or `Number` inside the artifact turns a primitive kind into a footgun.
 */
const RESERVED_NAMES = new Set([
  "Boolean",
  "Number",
  "String",
  "Object",
  "Function",
  "Array",
  "Symbol",
  "Date",
  "Error",
  "Map",
  "Set",
  "Promise",
  "Record",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
]);

function safeName(name: string): string {
  return RESERVED_NAMES.has(name) ? `${name}Kind` : name;
}

/** `$ref: "#/$defs/Rating"` → "Rating" (only local $defs refs are supported). */
function refName(ref: string, kindSlug: string): string {
  const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!m) fail(`unsupported $ref "${ref}" in kind "${kindSlug}" — only local #/$defs/* refs are generated`);
  return m[1];
}

/**
 * Provider-strict wrapper unwrap: some registry rows store
 * `{name, schema, strict}` (the OpenAI function-schema envelope) instead of the
 * bare JSON Schema. The payload shape is `.schema`.
 */
function unwrapSchema(schema: unknown): JsonSchema {
  if (isRecord(schema) && !("type" in schema) && isRecord(schema.schema) && typeof schema.name === "string") {
    return schema.schema;
  }
  return isRecord(schema) ? schema : {};
}

/** The `__kind` const a schema node declares, if any. */
function declaredKind(schema: unknown): string | null {
  if (!isRecord(schema) || !isRecord(schema.properties)) return null;
  const marker = schema.properties.__kind;
  if (!isRecord(marker)) return null;
  if (typeof marker.const === "string") return marker.const;
  if (Array.isArray(marker.enum) && marker.enum.length === 1 && typeof marker.enum[0] === "string") {
    return marker.enum[0];
  }
  return null;
}

// ── registry rows ───────────────────────────────────────────────────────────

interface KindRow {
  id: string;
  kind: string;
  version: number;
  schema: JsonSchema;
}

interface EdgeRow {
  parentKind: string;
  fieldName: string;
  childKind: string;
}

// ── naming pass ─────────────────────────────────────────────────────────────

/**
 * Where every `$defs` entry of every kind lands in the artifact:
 *  - `{ ref: "<InterfaceName>" }` for a shared/deduped local def, or
 *  - `{ kind: "<slug>" }` when the def IS a registered kind (reference it).
 */
type DefTarget = { name: string; emitAs: "local" | "kind" };

interface Naming {
  /** kind slug → its exported root interface name. */
  rootName: Map<string, string>;
  /** kind slug → (def name → where it points). */
  defTarget: Map<string, Map<string, DefTarget>>;
  /** interface name → the def schema to emit once (shared local defs). */
  localDefs: Map<string, { schema: JsonSchema; owner: string; sharedBy: string[] }>;
}

function buildNaming(rows: KindRow[], edges: EdgeRow[]): Naming {
  const activeSlugs = new Set(rows.map((r) => r.kind));

  // 1. Root names — stable, derived from the slug (titles drift, slugs do not).
  const rootName = new Map<string, string>();
  const takenRoots = new Map<string, string>();
  for (const row of rows) {
    const name = safeName(pascal(row.kind));
    const clash = takenRoots.get(name);
    if (clash) fail(`kind "${row.kind}" and "${clash}" both generate the interface name "${name}"`);
    takenRoots.set(name, row.kind);
    rootName.set(row.kind, name);
  }
  const rootNames = new Set(rootName.values());

  // 2. Which `$defs` entries ARE registered kinds → reference, never duplicate.
  //    Signal A: the def declares a `__kind` const naming an active kind.
  //    Signal B: content_ir.kind_edge declares parent.field → child, and the
  //              parent's field schema $refs this def.
  const edgeByParent = new Map<string, Map<string, string>>();
  for (const edge of edges) {
    if (!activeSlugs.has(edge.parentKind) || !activeSlugs.has(edge.childKind)) continue;
    if (!edgeByParent.has(edge.parentKind)) edgeByParent.set(edge.parentKind, new Map());
    edgeByParent.get(edge.parentKind)!.set(edge.fieldName, edge.childKind);
  }

  const kindDefs = new Map<string, Map<string, string>>(); // kind → (defName → child slug)
  for (const row of rows) {
    const map = new Map<string, string>();
    const defs = isRecord(row.schema.$defs) ? row.schema.$defs : {};
    for (const [defName, def] of Object.entries(defs)) {
      const marker = declaredKind(def);
      if (marker && activeSlugs.has(marker)) map.set(defName, marker);
    }
    // kind_edge: resolve the parent's field schema down to the $def it uses.
    const fields = edgeByParent.get(row.kind);
    if (fields && isRecord(row.schema.properties)) {
      for (const [fieldName, childKind] of fields) {
        const prop = row.schema.properties[fieldName];
        const target = refUnderneath(prop, row.kind);
        if (target && defs[target] !== undefined && !map.has(target)) map.set(target, childKind);
      }
    }
    kindDefs.set(row.kind, map);
  }

  // 3. Remaining (non-kind) defs: dedupe by structure, disambiguate by owner.
  //    Pass A — collect every (name, structure) pair and who carries it.
  const byName = new Map<string, Map<string, { schema: JsonSchema; kinds: string[] }>>();
  for (const row of rows) {
    const defs = isRecord(row.schema.$defs) ? row.schema.$defs : {};
    const asKind = kindDefs.get(row.kind)!;
    for (const [defName, def] of Object.entries(defs)) {
      if (asKind.has(defName)) continue;
      if (!isRecord(def)) fail(`$defs.${defName} is not an object in kind "${row.kind}"`);
      const h = hash(def);
      if (!byName.has(defName)) byName.set(defName, new Map());
      const variants = byName.get(defName)!;
      if (!variants.has(h)) variants.set(h, { schema: def, kinds: [] });
      variants.get(h)!.kinds.push(row.kind);
    }
  }

  //    Pass B — assign one interface name per (name, structure).
  const localDefs: Naming["localDefs"] = new Map();
  const nameForVariant = new Map<string, string>(); // `${defName}:${hash}` → interface name
  for (const [defName, variants] of [...byName].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const base = safeName(pascal(defName));
    const contested = variants.size > 1 || rootNames.has(base);
    for (const [h, variant] of [...variants].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const owner = [...variant.kinds].sort()[0];
      let name = contested ? `${base}_${pascal(owner)}` : base;
      while (localDefs.has(name) || rootNames.has(name)) name = `${name}_`;
      localDefs.set(name, { schema: variant.schema, owner, sharedBy: [...variant.kinds].sort() });
      nameForVariant.set(`${defName}:${h}`, name);
    }
  }

  // 4. Per-kind def resolution table.
  const defTarget = new Map<string, Map<string, DefTarget>>();
  for (const row of rows) {
    const table = new Map<string, DefTarget>();
    const defs = isRecord(row.schema.$defs) ? row.schema.$defs : {};
    const asKind = kindDefs.get(row.kind)!;
    for (const [defName, def] of Object.entries(defs)) {
      const childKind = asKind.get(defName);
      if (childKind) {
        table.set(defName, { name: rootName.get(childKind)!, emitAs: "kind" });
        continue;
      }
      const name = nameForVariant.get(`${defName}:${hash(def)}`);
      if (!name) fail(`internal: no interface assigned for ${row.kind}.$defs.${defName}`);
      table.set(defName, { name, emitAs: "local" });
    }
    defTarget.set(row.kind, table);
  }

  return { rootName, defTarget, localDefs };
}

/** The `$defs` name a property schema ultimately points at (through arrays/unions). */
function refUnderneath(schema: unknown, kindSlug: string): string | null {
  if (!isRecord(schema)) return null;
  if (typeof schema.$ref === "string") return refName(schema.$ref, kindSlug);
  if (isRecord(schema.items)) return refUnderneath(schema.items, kindSlug);
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = schema[key];
    if (Array.isArray(branch)) {
      for (const sub of branch) {
        const found = refUnderneath(sub, kindSlug);
        if (found) return found;
      }
    }
  }
  return null;
}

// ── JSON Schema → TS ────────────────────────────────────────────────────────

interface RenderContext {
  kindSlug: string;
  defs: Map<string, DefTarget>;
}

function tsType(schema: unknown, ctx: RenderContext): string {
  if (schema === true) return "unknown";
  if (schema === false) return "never";
  if (!isRecord(schema)) fail(`non-object schema node in kind "${ctx.kindSlug}"`);

  if (typeof schema.$ref === "string") {
    const name = refName(schema.$ref, ctx.kindSlug);
    const target = ctx.defs.get(name);
    if (!target) fail(`kind "${ctx.kindSlug}" refs #/$defs/${name} which is not declared`);
    return target.name;
  }

  for (const key of ["anyOf", "oneOf"] as const) {
    const branch = schema[key];
    if (Array.isArray(branch)) {
      const parts = branch.map((sub) => tsType(sub, ctx));
      return [...new Set(parts)].join(" | ");
    }
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((sub) => wrapForOperator(tsType(sub, ctx)));
    return [...new Set(parts)].join(" & ");
  }
  if ("const" in schema) return literal(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(literal).join(" | ");

  const type = Array.isArray(schema.type)
    ? schema.type.map((t) => tsType({ ...schema, type: t }, ctx)).join(" | ")
    : null;
  if (type !== null) return [...new Set(type.split(" | "))].join(" | ");

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const items = schema.items;
      if (Array.isArray(items)) return `[${items.map((i) => tsType(i, ctx)).join(", ")}]`;
      return `${wrapForArray(tsType(items ?? {}, ctx))}[]`;
    }
    case "object": {
      if (isRecord(schema.properties) && Object.keys(schema.properties).length > 0) {
        return inlineObject(schema, ctx);
      }
      const ap = schema.additionalProperties;
      if (isRecord(ap)) return `Record<string, ${tsType(ap, ctx)}>`;
      return "Record<string, unknown>";
    }
    case undefined:
      // No type, no ref, no composition — arbitrary JSON.
      return "unknown";
    default:
      fail(`unsupported schema type ${literal(schema.type)} in kind "${ctx.kindSlug}"`);
  }
}

function wrapForArray(inner: string): string {
  return /[ |&]/.test(inner) ? `(${inner})` : inner;
}

function wrapForOperator(inner: string): string {
  return /[|]/.test(inner) ? `(${inner})` : inner;
}

function docComment(schema: Record<string, unknown>, indent: string): string {
  const description = typeof schema.description === "string" ? schema.description.trim() : "";
  if (!description) return "";
  const lines = description.split("\n").map((l) => `${indent} * ${l.replaceAll("*/", "*\\/")}`.trimEnd());
  return `${indent}/**\n${lines.join("\n")}\n${indent} */\n`;
}

function objectBody(schema: Record<string, unknown>, ctx: RenderContext, indent: string): string {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [],
  );
  const inner = `${indent}  `;
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (!isRecord(prop)) fail(`property "${name}" is not an object in kind "${ctx.kindSlug}"`);
    const optional = required.has(name) ? "" : "?";
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : literal(name);
    lines.push(`${docComment(prop, inner)}${inner}${key}${optional}: ${tsType(prop, ctx)};`);
  }
  if (isRecord(schema.additionalProperties)) {
    // An index signature must be assignable FROM every declared property, so
    // the open-map type widens to cover them (TS2411 otherwise).
    const declared = Object.values(properties)
      .filter(isRecord)
      .map((prop) => tsType(prop, ctx));
    const parts = [...new Set([tsType(schema.additionalProperties, ctx), ...declared])];
    lines.push(`${inner}[key: string]: ${parts.join(" | ")} | undefined;`);
  }
  return lines.join("\n");
}

function inlineObject(schema: Record<string, unknown>, ctx: RenderContext): string {
  const body = objectBody(schema, ctx, "  ");
  return body ? `{\n${body}\n  }` : "Record<string, never>";
}

// ── artifact ────────────────────────────────────────────────────────────────

function renderArtifact(rows: KindRow[], edges: EdgeRow[]): string {
  const naming = buildNaming(rows, edges);
  const chunks: string[] = [];

  const fingerprint = hash(
    rows.map((r) => [r.kind, r.version, stableStringify(r.schema)]).concat([["__edges", 0, stableStringify(edges)]] as never),
  );

  chunks.push(
    [
      "// ─────────────────────────────────────────────────────────────────────────",
      "// AUTOGENERATED — DO NOT EDIT BY HAND.",
      "//",
      "// Source of truth: `content_ir.kind_definition` (+ `content_ir.kind_edge`)",
      "// in Supabase project brsgrqvjdzwihsvnfqkf — the live Shape registry.",
      "// Regenerate:  pnpm shape:types",
      "// Verify:      pnpm check:kind-types   (CI-blocking freshness gate)",
      "// Twin guard:  pnpm check:kind-type-twins",
      "//",
      `// ${rows.length} active kinds. THESE ARE THE ONLY KIND PAYLOAD TYPES IN THE REPO.`,
      "// A hand-written interface mirroring a registered kind is a defect — derive",
      "// (Pick/Omit) from the type here instead, and never re-declare it.",
      "//",
      "// Each interface describes a COMPLETE instance (envelope.root.value once",
      "// `status === \"complete\"`). Mid-stream values are PARTIAL — streaming",
      "// components keep their defensive readers.",
      "//",
      "// pydantic leaves defaulted fields (including `__kind`) out of `required`,",
      "// so they generate OPTIONAL. The serializer always emits them; the type",
      "// tells the truth about what validation guarantees.",
      "// ─────────────────────────────────────────────────────────────────────────",
      "",
      `/** Structural fingerprint of the registry rows this artifact was generated from. */`,
      `export const KIND_REGISTRY_FINGERPRINT = ${literal(fingerprint)};`,
      "",
    ].join("\n"),
  );

  // Shared, deduped local defs (nested structures that are NOT registered kinds).
  if (naming.localDefs.size > 0) {
    chunks.push(
      [
        "// ─────────────────────────────────────────────────────────────────────────",
        "// Shared nested structures. Deduped by structure across the registry — an",
        "// identical `$defs` entry carried by many kinds is ONE interface here.",
        "// ─────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    for (const [name, def] of [...naming.localDefs].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const ctx: RenderContext = { kindSlug: def.owner, defs: naming.defTarget.get(def.owner)! };
      const shared =
        def.sharedBy.length > 1
          ? `\n * Shared by ${def.sharedBy.length} kinds (${def.sharedBy.slice(0, 4).join(", ")}${def.sharedBy.length > 4 ? ", …" : ""}).`
          : `\n * From kind \`${def.owner}\`.`;
      const description =
        typeof def.schema.description === "string" ? `${def.schema.description.trim()}\n *${shared}` : shared.trim();
      const doc = docComment({ description }, "");
      if (def.schema.type !== "object" || !isRecord(def.schema.properties)) {
        chunks.push(`${doc}export type ${name} = ${tsType(def.schema, ctx)};\n`);
        continue;
      }
      chunks.push(`${doc}export interface ${name} {\n${objectBody(def.schema, ctx, "")}\n}\n`);
    }
  }

  chunks.push(
    [
      "// ─────────────────────────────────────────────────────────────────────────",
      "// Registered kinds. One interface per active `content_ir.kind_definition`",
      "// row. A nested registered kind is a REFERENCE to its own interface, never",
      "// an inlined duplicate.",
      "// ─────────────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );

  for (const row of rows) {
    const name = naming.rootName.get(row.kind)!;
    const ctx: RenderContext = { kindSlug: row.kind, defs: naming.defTarget.get(row.kind)! };
    const description =
      typeof row.schema.description === "string" && row.schema.description.trim()
        ? `${row.schema.description.trim()}\n *\n * Kind \`${row.kind}\` (registry v${row.version}).`
        : `Kind \`${row.kind}\` (registry v${row.version}).`;
    const doc = docComment({ description }, "");
    if (row.schema.type === "object" && isRecord(row.schema.properties)) {
      chunks.push(`${doc}export interface ${name} {\n${objectBody(row.schema, ctx, "")}\n}\n`);
    } else {
      chunks.push(`${doc}export type ${name} = ${tsType(row.schema, ctx)};\n`);
    }
  }

  // Slug union + slug→type map: the seam a generic consumer types against.
  chunks.push(
    [
      "// ─────────────────────────────────────────────────────────────────────────",
      "// The registry as a type-level index.",
      "// ─────────────────────────────────────────────────────────────────────────",
      "",
      "/** Every active kind slug. An unregistered slug is a COMPILE error. */",
      "export type GeneratedKindSlug =",
      rows.map((r) => `  | ${literal(r.kind)}`).join("\n") + ";",
      "",
      "/** Slug → the complete-instance payload type for that kind. */",
      "export interface KindPayloadBySlug {",
      rows.map((r) => `  ${literal(r.kind)}: ${naming.rootName.get(r.kind)!};`).join("\n"),
      "}",
      "",
      "/** `KindPayload<\"web_result\">` → `WebResult`. */",
      "export type KindPayload<S extends GeneratedKindSlug> = KindPayloadBySlug[S];",
      "",
      "/** Every active slug, sorted — the iteration/validation source. */",
      "export const GENERATED_KIND_SLUGS: readonly GeneratedKindSlug[] = [",
      rows.map((r) => `  ${literal(r.kind)},`).join("\n"),
      "];",
      "",
      "const GENERATED_KIND_SLUG_SET: ReadonlySet<string> = new Set(GENERATED_KIND_SLUGS);",
      "",
      "/** Runtime guard: is `value` a slug this artifact carries a type for? */",
      "export function isGeneratedKindSlug(value: unknown): value is GeneratedKindSlug {",
      "  return typeof value === \"string\" && GENERATED_KIND_SLUG_SET.has(value);",
      "}",
      "",
    ].join("\n"),
  );

  return chunks.join("\n");
}

// ── registry read ───────────────────────────────────────────────────────────

async function fetchRegistry(): Promise<{ rows: KindRow[]; edges: EdgeRow[] }> {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  dotenv.config({ path: resolve(ROOT, ".env") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local) — generation NEEDS the live registry");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // readAllRows semantics, inlined: PostgREST caps a bare select at 1000 rows
  // and this list must be COMPLETE or the artifact silently loses kinds.
  const raw: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id, kind, version, is_active, deleted_at, emitted_json_schema")
      .order("kind")
      .range(from, from + 999);
    if (error) fail(`registry read failed: ${error.message}`);
    raw.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  const rows: KindRow[] = [];
  const idToKind = new Map<string, string>();
  for (const row of raw) {
    if (row.deleted_at !== null || row.is_active !== true) continue;
    const schema = unwrapSchema(row.emitted_json_schema);
    idToKind.set(String(row.id), String(row.kind));
    rows.push({ id: String(row.id), kind: String(row.kind), version: Number(row.version), schema });
  }
  rows.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  if (rows.length === 0) fail("the live registry returned zero active kinds — refusing to write an empty artifact");

  const rawEdges: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_edge")
      .select("parent_definition_id, field_name, child_definition_id, deleted_at")
      .order("id")
      .range(from, from + 999);
    if (error) fail(`kind_edge read failed: ${error.message}`);
    rawEdges.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const edges: EdgeRow[] = [];
  for (const edge of rawEdges) {
    if (edge.deleted_at !== null) continue;
    const parentKind = idToKind.get(String(edge.parent_definition_id));
    const childKind = idToKind.get(String(edge.child_definition_id));
    if (!parentKind || !childKind) continue;
    edges.push({ parentKind, fieldName: String(edge.field_name), childKind });
  }
  edges.sort((a, b) =>
    `${a.parentKind}.${a.fieldName}.${a.childKind}` < `${b.parentKind}.${b.fieldName}.${b.childKind}` ? -1 : 1,
  );

  return { rows, edges };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const { rows, edges } = await fetchRegistry();
  const source = renderArtifact(rows, edges);

  if (check) {
    if (!existsSync(OUT_PATH)) {
      console.error(`\n  ✗ ${GENERATED_REL} is missing. Run: pnpm shape:types\n`);
      process.exit(1);
    }
    if (readFileSync(OUT_PATH, "utf8") !== source) {
      console.error(
        `\n  ✗ ${GENERATED_REL} is STALE vs the live registry (${rows.length} active kinds).\n` +
          "    A kind's schema changed and the generated types did not. Run: pnpm shape:types, then commit.\n",
      );
      process.exit(1);
    }
    console.log(`  ✓ ${GENERATED_REL} matches the live registry (${rows.length} active kinds).`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, source, "utf8");
  console.log(`  ✓ Wrote ${rows.length} kind types to ${GENERATED_REL}.`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
