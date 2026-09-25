"use client";

// The single compiled CLIENT home of react-markdown + every remark/rehype
// plugin. Import ONLY via the MarkdownCore front door (see its header). The
// presets themselves live in markdown-core-presets.ts, shared with the server
// renderer (MarkdownCoreServer) so both sides parse identically.

import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import { MARKDOWN_PRESETS, prepareCoreSource, rehypeWithNumbering, remarkWithNumbering } from "./markdown-core-presets";
import { useDocumentNumbering } from "./syntax/elements/DocumentNumbering";
import type { MarkdownCoreProps } from "./markdown-core-types";
import { withCoreSyntaxElements } from "./syntax/elements/core-syntax-elements";

export default function MarkdownCoreImpl({
  children,
  preset = "gfm",
  components,
}: MarkdownCoreProps) {
  const plugins = MARKDOWN_PRESETS[preset];
  // Document-wide figure / table / equation numbers from the document root.
  const numbering = useDocumentNumbering();
  return (
    <ReactMarkdown
      remarkPlugins={remarkWithNumbering(plugins.remark, numbering)}
      rehypePlugins={rehypeWithNumbering(plugins.rehype, numbering)}
      components={withCoreSyntaxElements(components)}
    >
      {prepareCoreSource(children, preset)}
    </ReactMarkdown>
  );
}
