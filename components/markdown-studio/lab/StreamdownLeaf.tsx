"use client";

// The Streamdown 2 leaf for the RC-B7 renderer trial (RendererTrialView) —
// loaded only there. Fenced code renders through OUR CodeBlock (every
// CodeBlock feature intact); math through the same remark-math/KaTeX pair
// the core uses.

import React from "react";
import {
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
  type Components,
} from "streamdown";
import type { PluggableList } from "unified";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import {
  REHYPE_KATEX_OPTIONS,
  REMARK_MATH_OPTIONS,
  normalizeMathDelimiters,
} from "@/components/markdown-core/math-normalizer";

const REMARK: PluggableList = [
  ...Object.values(defaultRemarkPlugins),
  [remarkMath, REMARK_MATH_OPTIONS],
];
const REHYPE: PluggableList = [
  ...Object.values(defaultRehypePlugins),
  [rehypeKatex, REHYPE_KATEX_OPTIONS],
];

const FencedOrInlineCode: NonNullable<Components["code"]> = ({
  className,
  children,
}) => {
  const language = /language-([\w+#-]+)/.exec(className ?? "")?.[1];
  const text = String(children ?? "");
  if (!language && !text.includes("\n")) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
        {children}
      </code>
    );
  }
  return <CodeBlock code={text.replace(/\n$/, "")} language={language ?? "text"} />;
};

const COMPONENTS: Components = {
  pre: ({ children }) => <>{children}</>,
  code: FencedOrInlineCode,
};

export default function StreamdownLeaf({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
        components={COMPONENTS}
      >
        {normalizeMathDelimiters(text)}
      </Streamdown>
    </div>
  );
}
