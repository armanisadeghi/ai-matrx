import "server-only";

// ─────────────────────────────────────────────────────────────────────────
// The SERVER twin of MarkdownCoreImpl — the same react-markdown call over the
// same preset table (markdown-core-presets.ts), rendered synchronously in a
// React Server Component so the markup is in the HTML a crawler receives.
//
// Import ONLY from server components (the rich-content server level). Client
// code keeps using the MarkdownCore front door; this module never enters a
// client graph (`server-only` fails the build if it does).
// ─────────────────────────────────────────────────────────────────────────

import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import { MARKDOWN_PRESETS, prepareCoreSource, remarkWithNumbering } from "./markdown-core-presets";
import type { MarkdownCoreProps } from "./markdown-core-types";
import { withCoreSyntaxElements } from "./syntax/elements/core-syntax-elements";

export default function MarkdownCoreServer({
  children,
  preset = "gfm",
  components,
  numbering,
}: MarkdownCoreProps) {
  const plugins = MARKDOWN_PRESETS[preset];
  return (
    <ReactMarkdown
      remarkPlugins={remarkWithNumbering(plugins.remark, numbering)}
      rehypePlugins={plugins.rehype}
      components={withCoreSyntaxElements(components)}
    >
      {prepareCoreSource(children, preset)}
    </ReactMarkdown>
  );
}
