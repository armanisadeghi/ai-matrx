#!/usr/bin/env tsx
/**
 * generate-kind-types — the registry→TypeScript codegen (KINDS_EVERYWHERE_PLAN
 * §4.3, SDK wishlist #2). Reads `content_ir.kind_definition.emitted_json_schema`
 * from the LIVE registry and emits one self-contained `.gen.ts` per kind into
 * `features/content-ir/kinds/generated/` — the typed view of a complete kind
 * instance (`envelope.root.value` once `status === "complete"`).
 *
 *   pnpm shape:types <kind> [<kind>...]   # (re)generate named kinds
 *   pnpm shape:types --all-generated      # regenerate every committed .gen.ts
 *   pnpm check:kind-types                 # drift check: regenerate in memory,
 *                                         # diff against committed files, exit 1
 *
 * Rules:
 * - The REGISTRY is the source of truth. Never hand-edit a .gen.ts — edit the
 *   pydantic model (aidream), re-seed the registry, re-run this.
 * - Files are self-contained on purpose: `$defs` interfaces are emitted into
 *   each file (a `Rating` def inside web-result.gen.ts duplicates the one in
 *   local-place.gen.ts). No cross-file imports, no barrel — drift is impossible
 *   because both copies come from the same registry row on every run.
 * - Fidelity over convenience: required/optional/nullable mirror the schema
 *   exactly. pydantic leaves defaulted fields (incl. `__kind`) out of
 *   `required`, so they generate as optional — the serializer always emits
 *   them, but the TYPE tells the truth about what validation guarantees.
 * - Mid-stream envelope values are PARTIAL; these types describe the COMPLETE
 *   instance. Streaming components keep their defensive value readers.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = resolve(ROOT, "features", "content-ir", "kinds", "generated");

// ── JSON Schema → TS ────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  console.error(`\x1b[31m\x1b[1mgenerate-kind-types:\x1b[0m ${message}`);
  process.exit(1);
}

/** `$ref: "#/$defs/Rating"` → "Rating" (only local $defs refs are supported). */
function refName(ref: string): string {
  const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!m) fail(`unsupported $ref "${ref}" — only local #/$defs/* refs are generated`);
  return m[1];
}

function literal(value: unknown): string {
  return JSON.stringify(value);
}

/** Render a schema node as a TS type expression. */
function tsType(schema: unknown, kindSlug: string): string {
  if (!isRecord(schema)) fail(`non-object schema node in kind "${kindSlug}"`);

  if (typeof schema.$ref === "string") return refName(schema.$ref);

  if (Array.isArray(schema.anyOf)) {
    const parts = schema.anyOf.map((sub) => tsType(sub, kindSlug));
    return [...new Set(parts)].join(" | ");
  }
  if (Array.isArray(schema.oneOf)) {
    const parts = schema.oneOf.map((sub) => tsType(sub, kindSlug));
    return [...new Set(parts)].join(" | ");
  }
  if ("const" in schema) return literal(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(literal).join(" | ");

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
    case "array":
      return `${wrapForArray(tsType(schema.items ?? {}, kindSlug))}[]`;
    case "object": {
      if (isRecord(schema.properties)) return inlineObject(schema, kindSlug);
      // No declared properties: an open map.
      const ap = schema.additionalProperties;
      if (isRecord(ap)) return `Record<string, ${tsType(ap, kindSlug)}>`;
      return "Record<string, unknown>";
    }
    case undefined:
      // No type, no ref, no composition — arbitrary JSON.
      return "unknown";
    default:
      fail(`unsupported schema type ${literal(schema.type)} in kind "${kindSlug}"`);
  }
}

function wrapForArray(inner: string): string {
  return inner.includes(" ") ? `(${inner})` : inner;
}

function docComment(schema: Record<string, unknown>, indent: string): string {
  const description = typeof schema.description === "string" ? schema.description.trim() : "";
  if (!description) return "";
  const lines = description.split("\n").map((l) => `${indent} * ${l}`.trimEnd());
  return `${indent}/**\n${lines.join("\n")}\n${indent} */\n`;
}

function objectBody(schema: Record<string, unknown>, kindSlug: string, indent: string): string {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === "string") : []);
  const inner = `${indent}  `;
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (!isRecord(prop)) fail(`property "${name}" is not an object in kind "${kindSlug}"`);
    const optional = required.has(name) ? "" : "?";
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : literal(name);
    lines.push(`${docComment(prop, inner)}${inner}${key}${optional}: ${tsType(prop, kindSlug)};`);
  }
  return lines.join("\n");
}

function inlineObject(schema: Record<string, unknown>, kindSlug: string): string {
  const body = objectBody(schema, kindSlug, "  ");
  return body ? `{\n${body}\n  }` : "Record<string, never>";
}

/** PascalCase interface name from a kind slug (fallback when title is absent). */
function pascal(slug: string): string {
  return slug
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

interface KindRow {
  kind: string;
  version: number;
  emitted_json_schema: JsonSchema;
}

function generateFile(row: KindRow): string {
  const schema = row.emitted_json_schema;
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) {
    fail(`kind "${row.kind}" has a non-object emitted_json_schema root — nothing to generate`);
  }

  const rootName = typeof schema.title === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(schema.title)
    ? schema.title
    : pascal(row.kind);

  const chunks: string[] = [];
  chunks.push(
    [
      "/**",
      ` * GENERATED — do not edit. Source of truth: content_ir.kind_definition`,
      ` * row "${row.kind}" (schema version ${row.version}), emitted by pydantic in`,
      ` * aidream and registered in the live Shape registry.`,
      " *",
      ` * Regenerate:  pnpm shape:types ${row.kind}`,
      ` * Drift check: pnpm check:kind-types`,
      " *",
      " * This is the COMPLETE-instance type (envelope.root.value at",
      ' * status === "complete"). Mid-stream values are partial — streaming',
      " * components keep their defensive readers.",
      " */",
      "",
    ].join("\n"),
  );

  const defs = isRecord(schema.$defs) ? schema.$defs : {};
  for (const [name, def] of Object.entries(defs)) {
    if (!isRecord(def)) fail(`$defs.${name} is not an object in kind "${row.kind}"`);
    if (def.type !== "object" || !isRecord(def.properties)) {
      chunks.push(`export type ${name} = ${tsType(def, row.kind)};\n`);
      continue;
    }
    chunks.push(`${docComment(def, "")}export interface ${name} {\n${objectBody(def, row.kind, "")}\n}\n`);
  }

  chunks.push(`${docComment(schema, "")}export interface ${rootName} {\n${objectBody(schema, row.kind, "")}\n}\n`);
  return chunks.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function fileNameFor(kind: string): string {
  return `${kind.replaceAll("_", "-")}.gen.ts`;
}

function kindFromFileName(file: string): string {
  return file.replace(/\.gen\.ts$/, "").replaceAll("-", "_");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check");
  const allGenerated = args.includes("--all-generated");
  const slugArgs = args.filter((a) => !a.startsWith("--"));

  let slugs: string[];
  if (checkMode || allGenerated) {
    if (!existsSync(OUT_DIR)) {
      if (checkMode) {
        console.log("check:kind-types — no generated dir yet, nothing to check.");
        return;
      }
      fail("--all-generated: no generated dir exists yet");
    }
    slugs = readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".gen.ts"))
      .map(kindFromFileName);
    if (slugs.length === 0) {
      console.log("No committed .gen.ts files — nothing to do.");
      return;
    }
  } else {
    slugs = slugArgs;
    if (slugs.length === 0) {
      fail("usage: pnpm shape:types <kind> [<kind>...] | --all-generated | --check");
    }
  }

  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local) — generation NEEDS the live registry");
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("kind, version, emitted_json_schema")
    .in("kind", slugs);
  if (error) fail(`registry read failed: ${error.message}`);

  const bySlug = new Map<string, KindRow>();
  for (const row of data ?? []) {
    if (isRecord(row.emitted_json_schema)) {
      bySlug.set(row.kind as string, row as unknown as KindRow);
    }
  }

  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    fail(`not in the registry (or no emitted_json_schema): ${missing.join(", ")}`);
  }

  let drift = 0;
  if (!checkMode) mkdirSync(OUT_DIR, { recursive: true });

  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row) continue;
    const content = generateFile(row);
    const outPath = resolve(OUT_DIR, fileNameFor(slug));
    if (checkMode) {
      const committed = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
      if (committed !== content) {
        drift++;
        console.error(
          `\x1b[31mDRIFT\x1b[0m ${fileNameFor(slug)} — registry (v${row.version}) disagrees with the committed file. Run: pnpm shape:types ${slug}`,
        );
      }
    } else {
      writeFileSync(outPath, content);
      console.log(`wrote features/content-ir/kinds/generated/${fileNameFor(slug)} (v${row.version})`);
    }
  }

  if (checkMode) {
    if (drift > 0) {
      console.error(`\ncheck:kind-types — ${drift} file(s) drifted from the live registry.`);
      process.exit(1);
    }
    console.log(`check:kind-types — ${slugs.length} generated file(s) match the live registry.`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
