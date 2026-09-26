// ─────────────────────────────────────────────────────────────────────────
// THE PLUGIN PRESETS of the one markdown core — environment-neutral.
//
// No "use client": the client edge (MarkdownCoreImpl, reached through the
// MarkdownCore front door) and the server renderer (MarkdownCoreServer) both
// read THIS table, so a preset means the same plugins, the same math dialect
// and the same raw-HTML sanitizer on either side of the wire. Adding a preset
// or a plugin? Add it here once; both sides get it.
//
// Never import this from a client component directly — go through the
// MarkdownCore front door (the plugin graph must stay behind its one edge).
// ─────────────────────────────────────────────────────────────────────────

import remarkGfm from "remark-gfm";
import remarkTableCodePipes from "./syntax/remark-table-code-pipes";
import remarkInlineOnly from "./syntax/remark-inline-only";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkMatrxVariable from "@/components/mardown-display/chat-markdown/matrx-variables/remarkMatrxVariable";
import remarkMatrxCite from "@/components/mardown-display/chat-markdown/citations/remarkMatrxCite";
import rehypeSafeRawHtml from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";
import remarkMatrxPageBreak, {
  isolatePageBreakLines,
} from "@/components/mardown-display/chat-markdown/page-break/remarkMatrxPageBreak";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
import { remarkDefinitionList } from "remark-definition-list";
import remarkGemoji from "remark-gemoji";
import rehypeSlug from "rehype-slug";
// Chemistry (`\ce{H2O}`, `\pu{…}`) for every KaTeX render — registers on the shared katex instance.
import "katex/contrib/mhchem";
import remarkMatrxSyntax from "./syntax/remark-matrx-syntax";
import rehypeMatrxSyntax from "./syntax/rehype-matrx-syntax";
import { rewriteContainerSpellings } from "./syntax/prepare-syntax-source";
import type { DocumentNumbering } from "./syntax/document-numbering";
import type { Options } from "react-markdown";
import {
  normalizeMathDelimiters,
  REHYPE_KATEX_OPTIONS,
  REMARK_MATH_OPTIONS,
} from "./math-normalizer";
import type { MarkdownPreset } from "./markdown-core-types";

export type MarkdownPluginSet = {
  remark: Options["remarkPlugins"];
  rehype: Options["rehypePlugins"];
  /** Math-capable presets run the ONE math normalizer on their source. */
  math: boolean;
};

// Every math-capable preset uses these two entries — never a bare
// `remarkMath` / `rehypeKatex` with other options (see math-normalizer.ts).
type Plugin = NonNullable<Options["remarkPlugins"]>[number];
const MATH: Plugin = [remarkMath, REMARK_MATH_OPTIONS];
const KATEX: Plugin = [rehypeKatex, REHYPE_KATEX_OPTIONS];

// The print system's page break (`<!-- pagebreak -->`, `\newpage`, …) previews
// as a dashed "Page break" divider in every preset but `plain`, so any surface
// that shows markdown shows the break the printer will honour.
const PAGE_BREAK: Plugin = remarkMatrxPageBreak;

// THE EXTENDED SYNTAX (components/markdown-core/syntax/): front matter,
// directives (callouts, tabs, columns, details, figures, TOC), GitHub /
// Obsidian / MkDocs callouts, definition lists, wikilinks + embeds,
// ==highlight==, ^sup^ / ~sub~, abbreviations, emoji shortcodes, heading ids
// + anchors, cross-references, equation numbering, CSV fences, footnotes
// across blocks, interactive task lists. Every GFM-based preset carries it.
//
// `singleTilde: false` — a single `~` is Pandoc subscript (`H~2~O`);
// strikethrough is `~~x~~`, as on GitHub.
const GFM: Plugin = [remarkGfm, { singleTilde: false }];
const SYNTAX_PARSE: Plugin[] = [[remarkFrontmatter, ["yaml", "toml"]], remarkDirective, remarkDefinitionList];
// remarkTableCodePipes: GFM's `\|`-in-code-in-a-table rule (verify-RC-B4 R4-3).
const SYNTAX_TRANSFORM: Plugin[] = [remarkTableCodePipes, remarkMatrxSyntax, remarkGemoji];
const SYNTAX_REHYPE: Plugin[] = [rehypeSlug, rehypeMatrxSyntax];

/** Module-scope arrays so plugin identity is stable across renders. */
export const MARKDOWN_PRESETS: Record<MarkdownPreset, MarkdownPluginSet> = {
  plain: { remark: [], rehype: [], math: false },
  gfm: { remark: [GFM, ...SYNTAX_PARSE, PAGE_BREAK, ...SYNTAX_TRANSFORM], rehype: [...SYNTAX_REHYPE], math: false },
  "gfm-breaks": {
    remark: [GFM, remarkBreaks, ...SYNTAX_PARSE, PAGE_BREAK, ...SYNTAX_TRANSFORM],
    rehype: [...SYNTAX_REHYPE],
    math: false,
  },
  math: { remark: [MATH, PAGE_BREAK], rehype: [KATEX], math: true },
  "gfm-math": {
    remark: [GFM, MATH, ...SYNTAX_PARSE, PAGE_BREAK, ...SYNTAX_TRANSFORM],
    rehype: [...SYNTAX_REHYPE, KATEX],
    math: true,
  },
  rich: {
    remark: [GFM, remarkBreaks, MATH, ...SYNTAX_PARSE, PAGE_BREAK, ...SYNTAX_TRANSFORM],
    rehype: [...SYNTAX_REHYPE, KATEX],
    math: true,
  },
  chat: {
    remark: [
      GFM,
      remarkBreaks,
      MATH,
      ...SYNTAX_PARSE,
      remarkMatrxVariable,
      remarkMatrxCite,
      PAGE_BREAK,
      ...SYNTAX_TRANSFORM,
    ],
    // Parse + sanitize allow-listed raw HTML BEFORE KaTeX, so KaTeX's
    // rendered output is never sanitized and matrx-variable / math element
    // nodes are never touched.
    rehype: [rehypeSafeRawHtml, ...SYNTAX_REHYPE, KATEX],
    math: true,
  },
  // One GFM table cell: the chat preset with every block construct off
  // (verify-RC-B4 R6-1) — `> 90%` / `- n/a` / `# 3` read as the text they are.
  "chat-cell": {
    remark: [
      remarkInlineOnly,
      GFM,
      remarkBreaks,
      MATH,
      ...SYNTAX_PARSE,
      remarkMatrxVariable,
      remarkMatrxCite,
      PAGE_BREAK,
      ...SYNTAX_TRANSFORM,
    ],
    rehype: [rehypeSafeRawHtml, ...SYNTAX_REHYPE, KATEX],
    math: true,
  },
  message: {
    remark: [GFM, MATH, remarkBreaks, ...SYNTAX_PARSE, PAGE_BREAK, ...SYNTAX_TRANSFORM],
    rehype: [rehypeRaw, ...SYNTAX_REHYPE, KATEX],
    math: true,
  },
};

/**
 * A preset's remark list with the document-wide numbering handed to the
 * extended-syntax pass, so every block of a split document numbers figures,
 * tables and equations the same way. No numbering → the module-scope list.
 */
export function remarkWithNumbering(
  remark: Options["remarkPlugins"],
  numbering: DocumentNumbering | null | undefined,
): Options["remarkPlugins"] {
  if (!numbering || !remark) return remark;
  return remark.map((plugin) => (plugin === remarkMatrxSyntax ? ([remarkMatrxSyntax, { numbering }] as Plugin) : plugin));
}

/** A preset's rehype list with the document-wide numbering (footnotes) handed to the extended-syntax pass. */
export function rehypeWithNumbering(
  rehype: Options["rehypePlugins"],
  numbering: DocumentNumbering | null | undefined,
): Options["rehypePlugins"] {
  if (!numbering || !rehype) return rehype;
  return rehype.map((plugin) => (plugin === rehypeMatrxSyntax ? ([rehypeMatrxSyntax, { numbering }] as Plugin) : plugin));
}

/** The source a preset parses: math presets run the one normalizer. */
export function prepareCoreSource(source: string, preset: MarkdownPreset): string {
  if (preset === "plain") return source;
  // Page-break lines get their own block before parsing (remarkMatrxPageBreak).
  // MkDocs `!!! note` / Docusaurus `:::note Title` → the one directive grammar.
  const isolated = isolatePageBreakLines(rewriteContainerSpellings(source));
  return MARKDOWN_PRESETS[preset].math ? normalizeMathDelimiters(isolated) : isolated;
}
