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
import type { MarkdownCoreProps, MarkdownPreset } from "./markdown-core-types";

type PluginSet = {
  remark: Options["remarkPlugins"];
  rehype: Options["rehypePlugins"];
};

const PRESETS: Record<MarkdownPreset, PluginSet> = {
  plain: { remark: [], rehype: [] },
  gfm: { remark: [remarkGfm], rehype: [] },
  "gfm-breaks": { remark: [remarkGfm, remarkBreaks], rehype: [] },
  math: { remark: [remarkMath], rehype: [rehypeKatex] },
  rich: {
    remark: [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]],
    rehype: [[rehypeKatex, { strict: "ignore" }]],
  },
  chat: {
    remark: [
      remarkGfm,
      remarkBreaks,
      [remarkMath, { singleDollarTextMath: false }],
      remarkMatrxVariable,
      remarkMatrxCite,
    ],
    // Parse + sanitize allow-listed raw HTML BEFORE KaTeX, so KaTeX's
    // rendered output is never sanitized and matrx-variable / math element
    // nodes are never touched.
    rehype: [rehypeSafeRawHtml, [rehypeKatex, { strict: "ignore" }]],
  },
  message: {
    remark: [remarkGfm, remarkMath, remarkBreaks],
    rehype: [rehypeRaw],
  },
};

export default function MarkdownCoreImpl({
  children,
  preset = "gfm",
  components,
}: MarkdownCoreProps) {
  const plugins = PRESETS[preset];
  return (
    <ReactMarkdown
      remarkPlugins={plugins.remark}
      rehypePlugins={plugins.rehype}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
