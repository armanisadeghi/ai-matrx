/**
 * Deterministic content-block generator — turns a kind's structural authority
 * (`emitted_json_schema`) plus its real canonical example into the teaching
 * "content block" an agent reads to learn how to emit the kind. This is the
 * paved, no-LLM path for the `content_block` leg of the shape doctor: the block
 * a human previously hand-authored inside a per-kind SQL migration is now
 * DERIVED from data the platform already holds.
 *
 * Two tiers, mirroring the house formats already in `skill.render_definition`
 * (e.g. the "Flashcard Simple" row):
 *   - "basic"    → one-line intro + a single `__kind`-leading JSON sample.
 *   - "detailed" → field-by-field annotations (required markers, enums,
 *                  nested item structure) + a pretty `__kind`-leading sample.
 *
 * The sample ALWAYS leads with `__kind` (emit shape). The real canonical
 * example is preferred because stored examples strip only the ROOT `__kind`
 * (nested `__kind` values survive), so a wrapper kind's children render
 * correctly for free; a minimal example is synthesized from the schema only
 * when no example exists. When the schema is not a resolvable object schema the
 * generator degrades LOUDLY to a raw schema dump rather than inventing shape.
 *
 * Pure and importable — no React, no client, no DB. The persistence layer
 * (`kind-content-block-service.ts`) consumes this; the admin preview renders it
 * before anyone stores it.
 */

import type { Json } from "@/types/database.types";
import { formatBlockLabel } from "@/features/content-ir/core/schema-structure";
import { withRootKind } from "@/features/content-ir/core/emit-payload";

export type ContentBlockTier = "basic" | "detailed";

export interface GeneratedContentBlock {
  /** Stable, globally-unique upsert key: `kind-<slug>-simple|-full`. */
  blockId: string;
  label: string;
  description: string;
  /** Lucide icon name (content_blocks.icon_name is NOT NULL). */
  iconName: string;
  /** The markdown teaching body stored in content_blocks.template. */
  template: string;
  tier: ContentBlockTier;
}

export interface GenerateContentBlockInput {
  kind: string;
  /** Human label of the kind (kind_definition.label). */
  label: string;
  emittedJsonSchema: Json | null;
  /**
   * Real canonical example DATA — source shape, root `__kind` stripped, exactly
   * as stored in `content_ir.kind_example.data`. Preferred sample source.
   */
  canonicalExample?: unknown;
  tier: ContentBlockTier;
}

// ─── Minimal JSON-Schema view (only what teaching needs) ────────────────────

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  enum?: unknown[];
  const?: unknown;
  description?: string;
}

function asNode(value: unknown): SchemaNode | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SchemaNode)
    : null;
}

function primaryType(node: SchemaNode): string | null {
  if (Array.isArray(node.type)) {
    const first = node.type.find((t) => t !== "null");
    return first ?? node.type[0] ?? null;
  }
  return typeof node.type === "string" ? node.type : null;
}

function asObjectSchema(node: SchemaNode | null): SchemaNode | null {
  return node && (primaryType(node) === "object" || node.properties) ? node : null;
}

/** Short type label for a field line, e.g. `string`, `string[]`, `object[]`. */
function typeLabel(node: SchemaNode): string {
  if (Array.isArray(node.enum) && node.enum.length > 0) return "enum";
  const type = primaryType(node);
  if (type === "array") {
    const items = asNode(node.items);
    const inner = items ? primaryType(items) ?? "any" : "any";
    return `${inner}[]`;
  }
  return type ?? "any";
}

function enumValues(node: SchemaNode): string[] | null {
  if (!Array.isArray(node.enum) || node.enum.length === 0) return null;
  return node.enum.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
}

// ─── Field-line rendering (detailed tier) ───────────────────────────────────

interface RenderedFields {
  lines: string[];
  /** Nested object schemas to describe under their own sub-heading. */
  nested: Array<{ heading: string; node: SchemaNode }>;
}

function renderFields(node: SchemaNode): RenderedFields {
  const props = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const lines: string[] = [];
  const nested: RenderedFields["nested"] = [];

  for (const [name, rawChild] of Object.entries(props)) {
    if (name === "__kind") continue;
    const child = asNode(rawChild);
    if (!child) continue;
    const star = required.has(name) ? "\\*" : "";
    const enums = enumValues(child);
    const desc = child.description ? ` — ${child.description}` : "";

    if (enums) {
      lines.push(`- \`${name}\`${star} ∈ \`${enums.join(" | ")}\`${desc}`);
      continue;
    }

    lines.push(`- \`${name}\`${star} (${typeLabel(child)})${desc}`);

    // One level of nested structure — an object field, or an array of objects.
    const isArray = primaryType(child) === "array";
    const objectChild =
      asObjectSchema(child) ??
      (isArray ? asObjectSchema(asNode(child.items)) : null);
    if (objectChild && objectChild.properties) {
      nested.push({
        heading: isArray ? `Each \`${name}\` item` : `\`${name}\` object`,
        node: objectChild,
      });
    }
  }

  return { lines, nested };
}

// ─── Example synthesis (only when no real example exists) ───────────────────

function synthesize(node: SchemaNode | null, depth = 0): unknown {
  if (!node || depth > 6) return null;
  const enums = enumValues(node);
  if (enums) return node.enum?.[0] ?? enums[0];
  if (node.const !== undefined) return node.const;
  const type = primaryType(node);
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [name, rawChild] of Object.entries(node.properties ?? {})) {
        if (name === "__kind") continue;
        out[name] = synthesize(asNode(rawChild), depth + 1);
      }
      return out;
    }
    case "array":
      return [synthesize(asNode(node.items), depth + 1)];
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return true;
    case "string":
      return node.description ? `<${node.description.replace(/[.\n].*$/s, "")}>` : "...";
    default:
      return node.properties ? synthesize({ ...node, type: "object" }, depth) : "...";
  }
}

// ─── Public entry ───────────────────────────────────────────────────────────

function stripRootKindShape(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { __kind: _dropped, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
}

/** The concrete emit sample — real example preferred, synthesized as fallback. */
function sampleData(input: GenerateContentBlockInput): unknown {
  if (input.canonicalExample !== undefined && input.canonicalExample !== null) {
    // Root __kind is stripped in storage; strip defensively in case a caller
    // passes an emit-shaped value, then re-add it via withRootKind below.
    return stripRootKindShape(input.canonicalExample);
  }
  const node = asNode(input.emittedJsonSchema);
  return node ? synthesize(node) : null;
}

function jsonBlock(value: unknown, pretty: boolean): string {
  const body = pretty
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value);
  return "```json\n" + body + "\n```";
}

const KIND_ARTICLE = /^[aeiou]/i;

export function contentBlockIdFor(kind: string, tier: ContentBlockTier): string {
  const slug = kind.replace(/_/g, "-");
  return `kind-${slug}-${tier === "basic" ? "simple" : "full"}`;
}

/**
 * Generate a teaching content block for a kind. Deterministic: identical inputs
 * always produce an identical block (stable `blockId` for upsert).
 */
export function generateKindContentBlock(
  input: GenerateContentBlockInput,
): GeneratedContentBlock {
  const { kind, tier } = input;
  const label = input.label?.trim() || formatBlockLabel(kind);
  const article = KIND_ARTICLE.test(label) ? "an" : "a";
  const objectNode = asObjectSchema(asNode(input.emittedJsonSchema));
  const sample = withRootKind(kind, sampleData(input));

  const header = `## ${label} Output Structure\n`;
  const kindRule =
    "**Every object MUST include its `__kind` field** — without it the system " +
    "can't read the structure. Strict schema: add no keys beyond those listed.";

  let body: string;

  if (!objectNode) {
    // LOUD degrade — no resolvable object schema. Dump the schema verbatim so
    // the block is still truthful rather than fabricated.
    const schemaDump =
      input.emittedJsonSchema != null
        ? `\n\nSchema:\n${jsonBlock(input.emittedJsonSchema, true)}`
        : "";
    body =
      `${header}\n` +
      `Emit ${article} \`${kind}\` payload inside a \`\`\`json code block, ` +
      "leading with `\"__kind\"`.\n\n" +
      `${jsonBlock(sample, true)}${schemaDump}`;
  } else if (tier === "basic") {
    body =
      `${header}\n` +
      `Emit ${article} ${label} as a JSON object inside a \`\`\`json code ` +
      `block. ${kindRule}\n\n` +
      jsonBlock(sample, false);
  } else {
    const { lines, nested } = renderFields(objectNode);
    const fieldsSection =
      lines.length > 0 ? `\n\n**Fields:**\n${lines.join("\n")}` : "";
    const nestedSections = nested
      .map((n) => {
        const sub = renderFields(n.node);
        return sub.lines.length > 0
          ? `\n\n**${n.heading}:**\n${sub.lines.join("\n")}`
          : "";
      })
      .join("");
    body =
      `${header}\n` +
      `Emit ${article} ${label} as a JSON object inside a \`\`\`json code ` +
      `block. ${kindRule}` +
      `${fieldsSection}${nestedSections}\n\n` +
      jsonBlock(sample, true);
  }

  return {
    blockId: contentBlockIdFor(kind, tier),
    label: `${label} — ${tier === "basic" ? "Simple" : "Detailed"}`,
    description:
      tier === "basic"
        ? `Minimal ${label} structure — the core shape and __kind, ready to emit.`
        : `Full ${label} structure — every field, enum, and nested shape annotated.`,
    iconName: "Shapes",
    template: body,
    tier,
  };
}
