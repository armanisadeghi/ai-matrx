/**
 * Parse INLINE constructs only — what a GFM table cell is (verify-RC-B4 R6-1).
 *
 * GFM splits a table row into cells and parses each cell's text as INLINE
 * content: `> 90%` is the text "> 90%", `- n/a` is "- n/a", `# 3` is "# 3",
 * `1. first` is "1. first". The inline level of <RichContent> parses its source
 * as a document (then draws block elements as spans), so a cell starting with
 * block syntax lost its first characters. This turns every block-level
 * construct off in the parser for that one source, so the core reads a cell
 * exactly as GFM does — no stripping, no escaping of the source.
 *
 * Used by the `chat-cell` preset (markdown-core-presets.ts), reached through
 * `<RichContent level="inline" gfmCell>`.
 */
type ProcessorData = { micromarkExtensions?: unknown[] };

/** Block constructs a table cell never contains (names from micromark and its extensions). */
export const BLOCK_CONSTRUCTS = [
  "blockQuote",
  "codeFenced",
  "codeIndented",
  "definition",
  "headingAtx",
  "htmlFlow",
  "list",
  "setextUnderline",
  "thematicBreak",
  "gfmFootnoteDefinition",
  "mathFlow",
  "directiveContainer",
  "directiveLeaf",
  "frontmatter",
  "table",
] as const;

export default function remarkInlineOnly(this: { data: () => ProcessorData }) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ disable: { null: [...BLOCK_CONSTRUCTS] } });
}
