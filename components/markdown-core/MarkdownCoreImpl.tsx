"use client";

// The single compiled home of react-markdown + every remark/rehype plugin.
// Import ONLY via the MarkdownCore front door (see its header). Preset
// arrays are module-scope constants so plugin identity is stable across
// renders (react-markdown re-runs the pipeline when the array identity
// changes).

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import remarkMatrxVariable from "@/components/mardown-display/chat-markdown/matrx-variables/remarkMatrxVariable";
import remarkMatrxCite from "@/components/mardown-display/chat-markdown/citations/remarkMatrxCite";
import rehypeSafeRawHtml from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";
import type { Options } from "react-markdown";
import {
  normalizeMathDelimiters,
  REHYPE_KATEX_OPTIONS,
  REMARK_MATH_OPTIONS,
} from "./math-normalizer";
import type { MarkdownCoreProps, MarkdownPreset } from "./markdown-core-types";

type PluginSet = {
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

const PRESETS: Record<MarkdownPreset, PluginSet> = {
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

export default function MarkdownCoreImpl({
  children,
  preset = "gfm",
  components,
}: MarkdownCoreProps) {
  const plugins = PRESETS[preset];
  const source = plugins.math ? normalizeMathDelimiters(children) : children;
  return (
    <ReactMarkdown
      remarkPlugins={plugins.remark}
      rehypePlugins={plugins.rehype}
      components={components}
    >
      {source}
    </ReactMarkdown>
  );
}
