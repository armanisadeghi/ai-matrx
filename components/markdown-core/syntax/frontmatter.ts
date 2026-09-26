// ─────────────────────────────────────────────────────────────────────────
// FRONT MATTER — YAML (`---`) or TOML (`+++`) at the very start of a
// document. Never rendered as text: the core hides it (remark-frontmatter +
// `stripFrontmatterNodes`) and exposes it as DOCUMENT PROPERTIES through
// `extractFrontmatter` / `useDocumentProperties`, which a properties panel
// reads.
//
// Grammar (the one Jekyll / Hugo / Obsidian / MkDocs / Pandoc share):
//   line 1 is exactly `---` (YAML) or `+++` (TOML); the block ends at the
//   next line that is exactly the same fence (YAML also accepts `...`).
// A document that merely starts with a `---` rule followed by prose is NOT
// front matter unless a closing fence exists — the parser agrees
// (remark-frontmatter requires the closer too).
// ─────────────────────────────────────────────────────────────────────────

import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";

export type FrontmatterFormat = "yaml" | "toml";

export interface FrontmatterSplit {
  format: FrontmatterFormat;
  /** The whole front-matter region, fences and trailing newline included. */
  raw: string;
  /** The text between the fences. */
  inner: string;
  /** Everything after the region — the document body. */
  body: string;
}

const OPEN: Record<string, FrontmatterFormat> = { "---": "yaml", "+++": "toml" };

/** Cut the front matter off the top of `source`, or null when it has none (or it has not closed yet). */
export function splitFrontmatter(source: string): FrontmatterSplit | null {
  if (!source) return null;
  // A leading byte-order mark is an encoding mark, not content (RC-B3r round 3, C1).
  const bom = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const firstBreak = source.indexOf("\n");
  if (firstBreak < 0) return null;
  const opener = source.slice(bom, firstBreak).replace(/\r$/, "");
  const format = OPEN[opener];
  if (!format) return null;
  let pos = firstBreak + 1;
  while (pos <= source.length) {
    const next = source.indexOf("\n", pos);
    const lineEnd = next < 0 ? source.length : next;
    const line = source.slice(pos, lineEnd).replace(/\r$/, "");
    if (line === opener || (format === "yaml" && line === "...")) {
      const end = next < 0 ? source.length : next + 1;
      return {
        format,
        raw: source.slice(0, end),
        inner: source.slice(firstBreak + 1, pos).replace(/\r?\n$/, ""),
        body: source.slice(end),
      };
    }
    if (next < 0) break;
    pos = next + 1;
  }
  return null;
}

/** True when the text opens a front-matter region that has not closed yet (a streaming prefix). */
export function hasUnclosedFrontmatter(source: string): boolean {
  if (!/^(---|\+\+\+)(\r?\n|$)/.test(source)) return false;
  return splitFrontmatter(source) === null;
}

export type DocumentProperties = Record<string, unknown>;

export interface DocumentPropertiesResult {
  /** Parsed properties; `{}` when the document has none. */
  properties: DocumentProperties;
  format: FrontmatterFormat | null;
  /** The front matter text exactly as stored (fences included), or null. */
  raw: string | null;
  /** A sentence saying why the front matter could not be read, or null. */
  error: string | null;
}

const EMPTY: DocumentPropertiesResult = { properties: {}, format: null, raw: null, error: null };

/** Read a document's front matter as properties. Never throws. */
export function extractFrontmatter(source: string): DocumentPropertiesResult {
  const split = splitFrontmatter(source);
  if (!split) return EMPTY;
  try {
    const parsed: unknown =
      split.format === "yaml" ? parseYaml(split.inner) : parseToml(split.inner);
    if (parsed === null || parsed === undefined) {
      return { properties: {}, format: split.format, raw: split.raw, error: null };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        properties: {},
        format: split.format,
        raw: split.raw,
        error: `The ${split.format.toUpperCase()} front matter is not a set of "key: value" properties.`,
      };
    }
    return {
      properties: parsed as DocumentProperties,
      format: split.format,
      raw: split.raw,
      error: null,
    };
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      properties: {},
      format: split.format,
      raw: split.raw,
      error: `The ${split.format.toUpperCase()} front matter could not be read: ${why}`,
    };
  }
}
