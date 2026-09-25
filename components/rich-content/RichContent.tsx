"use client";

// ─────────────────────────────────────────────────────────────────────────
// <RichContent source level> — THE ONE ENTRY for rendering text that is more
// than plain text. A thin router over the one core; see rich-content-types.ts
// for the levels and components/rich-content/FEATURE.md for the contract.
//
// BUILD GRAPH (code-splitting skill, THE FRAGMENTATION LAW): one loading
// boundary per level, never stacked —
//   inline   → MarkdownCore's existing edge (the shared react-markdown chunk);
//              the kind registry and the block splitter never enter it.
//   standard → ONE dynamic edge here (RichContentStandardImpl).
//   full     → MarkdownStream's existing edge (the chat engine).
// Inside the engine, nested content uses standard/NestedRichContent
// statically — never this router — so no boundary stacks under MarkdownStream.
// ─────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import MarkdownStream from "@/components/MarkdownStream";
import { RichContentDepthProvider } from "./depth";
import { HeadingAnchorsProvider } from "@/components/markdown-core/heading-anchors-context";
import { RichContentInline } from "./RichContentInline";
import { RichContentVariantRoot } from "./prose/variant-root";
import type { RichContentProps } from "./rich-content-types";

const RichContentStandardImpl = dynamic(
  () => import("./RichContentStandardImpl"),
  { ssr: false, loading: () => null },
);

export function RichContent({
  source,
  level,
  isStreaming,
  className,
  depthCap,
  variant,
  links,
  headingAnchors = true,
  imagePolicy,
}: RichContentProps) {
  if (level === "inline") {
    return (
      <RichContentInline
        source={source}
        className={className}
        links={links}
        streaming={isStreaming}
        imagePolicy={imagePolicy}
      />
    );
  }
  if (!headingAnchors) {
    return (
      <HeadingAnchorsProvider value={false}>
        <RichContent
          source={source}
          level={level}
          isStreaming={isStreaming}
          className={className}
          depthCap={depthCap}
          variant={variant}
          imagePolicy={imagePolicy}
        />
      </HeadingAnchorsProvider>
    );
  }
  if (level === "standard") {
    return (
      <RichContentStandardImpl
        source={source}
        isStreaming={isStreaming}
        className={className}
        depthCap={depthCap}
        variant={variant}
        imagePolicy={imagePolicy}
      />
    );
  }
  const full = (
    <MarkdownStream
      imagePolicy={imagePolicy}
      content={source}
      isStreamActive={isStreaming}
      className={className}
    />
  );
  const rendered = (
    <RichContentVariantRoot variant={variant}>
      {depthCap === undefined ? (
        full
      ) : (
        <RichContentDepthProvider depth={0} cap={depthCap}>
          {full}
        </RichContentDepthProvider>
      )}
    </RichContentVariantRoot>
  );
  return rendered;
}

export default RichContent;
