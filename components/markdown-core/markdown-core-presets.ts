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
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkMatrxVariable from "@/components/mardown-display/chat-markdown/matrx-variables/remarkMatrxVariable";
import remarkMatrxCite from "@/components/mardown-display/chat-markdown/citations/remarkMatrxCite";
import rehypeSafeRawHtml from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";
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

/** Module-scope arrays so plugin identity is stable across renders. */
export const MARKDOWN_PRESETS: Record<MarkdownPreset, MarkdownPluginSet> = {
  plain: { remark: [], rehype: [], math: false },
  gfm: { remark: [remarkGfm], rehype: [], math: false },
  "gfm-breaks": { remark: [remarkGfm, remarkBreaks], rehype: [], math: false },
  math: { remark: [MATH], rehype: [KATEX], math: true },
  "gfm-math": { remark: [remarkGfm, MATH], rehype: [KATEX], math: true },
  rich: {
    remark: [remarkGfm, remarkBreaks, MATH],
    rehype: [KATEX],
    math: true,
  },
  chat: {
    remark: [remarkGfm, remarkBreaks, MATH, remarkMatrxVariable, remarkMatrxCite],
    // Parse + sanitize allow-listed raw HTML BEFORE KaTeX, so KaTeX's
    // rendered output is never sanitized and matrx-variable / math element
    // nodes are never touched.
    rehype: [rehypeSafeRawHtml, KATEX],
    math: true,
  },
  message: {
    remark: [remarkGfm, MATH, remarkBreaks],
    rehype: [rehypeRaw, KATEX],
    math: true,
  },
};

/** The source a preset parses: math presets run the one normalizer. */
export function prepareCoreSource(source: string, preset: MarkdownPreset): string {
  return MARKDOWN_PRESETS[preset].math ? normalizeMathDelimiters(source) : source;
}
