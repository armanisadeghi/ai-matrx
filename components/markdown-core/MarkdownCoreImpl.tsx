"use client";

// The single compiled CLIENT home of react-markdown + every remark/rehype
// plugin. Import ONLY via the MarkdownCore front door (see its header). The
// presets themselves live in markdown-core-presets.ts, shared with the server
// renderer (MarkdownCoreServer) so both sides parse identically.

import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import { MARKDOWN_PRESETS, prepareCoreSource } from "./markdown-core-presets";
import type { MarkdownCoreProps } from "./markdown-core-types";

export default function MarkdownCoreImpl({
  children,
  preset = "gfm",
  components,
}: MarkdownCoreProps) {
  const plugins = MARKDOWN_PRESETS[preset];
  return (
    <ReactMarkdown
      remarkPlugins={plugins.remark}
      rehypePlugins={plugins.rehype}
      components={components}
    >
      {prepareCoreSource(children, preset)}
    </ReactMarkdown>
  );
}
