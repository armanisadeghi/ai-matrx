/**
 * THE AUTHOR'S NAME FOR A FIELD, read out of the producer's own JSON Schema.
 *
 * A payload key is the MACHINE's name for a field (`headline_finding`,
 * `watsons_words`). `humanizeKey` turns that into something readable, and that
 * is the right fallback — but when the producing node declared a JSON Schema
 * with `title` on the property, that title is what the AUTHOR called it, and
 * it outranks anything derived from the key.
 *
 * Wall W61 (Expert Book Challenge, 2026-09-12): the finished-run showcase
 * headed a section "Watsons words" — a name nobody chose, derived from a key
 * the reader was never meant to see.
 *
 * Flat by design: JSON Schema nests, but a rendered document addresses fields
 * by key at whatever depth they appear, and a key means the same thing
 * wherever it occurs in ONE schema. First declaration wins, so the outermost
 * `title` is the one a reader sees.
 *
 * Pure, total, defensive: a served schema is a contract we do not control, and
 * a malformed one yields an empty label map rather than throwing at a reader.
 */

import type { SchemaFieldLabel } from "./document-presentation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** Sub-schema keywords whose values are themselves schemas (or lists of them). */
const SCHEMA_BRANCHES = [
  "items",
  "additionalProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "then",
  "else",
  "not",
] as const;

/** Keywords whose values are a MAP of name → schema. */
const SCHEMA_MAPS = ["properties", "$defs", "definitions", "patternProperties"] as const;

/** Depth cap: a schema that recurses forever must not hang a render. */
const MAX_DEPTH = 12;

/**
 * Every property in `schema` that declares a `title`, keyed by property name.
 * Properties with no `title` are absent — the caller falls back to the key.
 */
export function fieldLabelsFromJsonSchema(
  schema: unknown,
): Record<string, SchemaFieldLabel> {
  const labels: Record<string, SchemaFieldLabel> = {};
  walk(schema, labels, 0);
  return labels;
}

function walk(
  node: unknown,
  labels: Record<string, SchemaFieldLabel>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, labels, depth + 1);
    return;
  }
  if (!isRecord(node)) return;

  for (const mapKey of SCHEMA_MAPS) {
    const map = node[mapKey];
    if (!isRecord(map)) continue;
    for (const [name, child] of Object.entries(map)) {
      if (isRecord(child) && mapKey === "properties") {
        const label = asText(child.title);
        // FIRST DECLARATION WINS — the outermost title is the reader's.
        if (label && !labels[name]) {
          const description = asText(child.description);
          labels[name] = description ? { label, description } : { label };
        }
      }
      walk(child, labels, depth + 1);
    }
  }

  for (const branch of SCHEMA_BRANCHES) {
    if (branch in node) walk(node[branch], labels, depth + 1);
  }
}
