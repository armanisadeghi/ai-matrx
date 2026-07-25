/**
 * RENDERING — how a resource becomes text an agent can read.
 *
 * Every item is rendered as a self-describing block: a heading that names WHAT
 * this is and WHERE it came from, then the content. That header is not
 * decoration — it is the difference between an agent that can cite a claim to a
 * URL and one that emits an unattributable wall of text. Rich context with no
 * provenance is how hallucinated citations get written.
 *
 * Rules:
 *   * Every block carries its source URL when one exists.
 *   * Blocks are separated by a rule so boundaries survive concatenation.
 *   * Nothing here truncates: budget enforcement is the resolver's job, in one
 *     place, and it reports what it cut. A renderer that silently trimmed would
 *     make that report a lie.
 */

import { isJsonObject, type JsonObject } from "@/types/json";
import type { ResourceItem } from "./types";

export const BLOCK_SEPARATOR = "\n\n---\n\n";

export interface RenderContext {
  /** The source's URL, stored once per source on its `search.result` item. */
  urlForSource: (sourceId: string | null) => string | null;
  /** Keyword text by id, for labeling keyword-scoped resources. */
  keywordName: (keywordId: string | null) => string | null;
  /** Tag name by id. */
  tagName: (tagId: string | null) => string | null;
}

/** One labeled block. `meta` lines are dropped when empty. */
export function block(
  heading: string,
  meta: Array<[string, string | number | null | undefined]>,
  body: string,
): string {
  const lines = [`## ${heading}`];
  for (const [key, value] of meta) {
    if (value === null || value === undefined || value === "") continue;
    lines.push(`- ${key}: ${value}`);
  }
  const text = body.trim();
  if (text) {
    lines.push("");
    lines.push(text);
  }
  return lines.join("\n");
}

/** Standard provenance metadata for a source-derived item. */
export function sourceMeta(
  item: ResourceItem,
  ctx: RenderContext,
): Array<[string, string | number | null | undefined]> {
  const url = ctx.urlForSource(item.sourceId);
  const tier = typeof item.flags.tier === "string" ? item.flags.tier : null;
  return [
    ["URL", url],
    ["Site", typeof item.flags.hostname === "string" ? item.flags.hostname : null],
    ["Authority", item.authority !== null ? `${item.authority}/100${tier ? ` (${tier})` : ""}` : null],
    ["Best search rank", item.bestRank !== null ? `#${item.bestRank}` : null],
    ["Importance", item.importance !== null ? item.importance : null],
  ];
}

/** Pretty-print a JSON payload for a model: stable, indented, fenced. */
export function jsonBlock(value: unknown): string {
  try {
    return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
  } catch {
    return "```\n[unserializable payload]\n```";
  }
}

/** Render a jsonb array of `{...}` rows as a compact bullet list. */
export function bulletList(
  value: unknown,
  format: (entry: JsonObject) => string | null,
  max?: number,
): string {
  if (!Array.isArray(value)) return "";
  const lines: string[] = [];
  for (const entry of value) {
    if (max !== undefined && lines.length >= max) break;
    if (!isJsonObject(entry)) {
      if (typeof entry === "string") lines.push(`- ${entry}`);
      continue;
    }
    const line = format(entry);
    if (line) lines.push(`- ${line}`);
  }
  return lines.join("\n");
}

/** A markdown table from rows of cells. Header is required. */
export function table(
  headers: string[],
  rows: Array<Array<string | number | null>>,
): string {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${r.map((c) => (c === null ? "" : String(c))).join(" | ")} |`,
  );
  return [head, rule, ...body].join("\n");
}
