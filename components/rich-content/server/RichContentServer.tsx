import "server-only";

// ─────────────────────────────────────────────────────────────────────────
// <RichContentServer source level> — the SERVER-RENDERED form of the
// `inline` and `standard` levels, for SEO and public pages (learn articles,
// share pages) whose text must be in the HTML a crawler receives.
//
// NOT a second renderer: it runs the SAME core as the client levels —
//   prose preparation   prose/prose-prepare.ts (preprocessProse)
//   delimiter guard     @ai-matrx/kit/delimiter-guard
//   plugins + math      markdown-core-presets.ts, preset "chat"
//   inline marks        prose/prose-inline-elements.tsx
//   inline level map    prose/inline-level-elements.tsx
//   prose leaf map      prose/prose-block-elements.tsx (+ its frame)
//   block splitter      content-splitter-core (the client's splitter, minus
//                       the kind-envelope hooks, which only add metadata)
// — only react-markdown runs here (MarkdownCoreServer) instead of behind the
// client edge. Shared constructs produce the same HTML as the client levels;
// guard: components/rich-content/__tests__/server-level-parity.test.tsx.
//
// What renders where at `standard`:
//   prose, tables, XML sections (to the depth cap), dividers, images → HERE,
//     on the server, in the HTML;
//   code, mermaid, XML/SVG cards, ```markdown fences, everything else → the
//     client `StandardBlock` (SSR'd where it can be, hydrated for its
//     interactions), inside a depth provider so nesting below it stays
//     bounded by the same cap.
// `full` (the chat engine, kinds, actions) is client-only by design.
// ─────────────────────────────────────────────────────────────────────────

import { guardMarkdownDelimiters } from "@ai-matrx/kit/delimiter-guard";
import MarkdownCoreServer from "@/components/markdown-core/MarkdownCoreServer";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { StaticStandard } from "../standard/static-standard";
import type { DocumentNumbering } from "@/components/markdown-core/syntax/document-numbering";
import {
  DEFAULT_RICH_CONTENT_DEPTH_CAP,
  type RichContentVariant,
} from "../rich-content-types";
import { RichContentVariantRoot } from "../prose/variant-root";
import { detectTextDirection, preprocessProse } from "../prose/prose-prepare";
import {
  INLINE_LEVEL_WRAPPER_CLASS,
  inlineLevelElements,
  type InlineLinks,
} from "../prose/inline-level-elements";
import {
  proseElementsWithNested,
  PROSE_FRAME_CSS,
  proseFrameClass,
} from "../prose/prose-block-elements";
import { DelimiterViolationReport } from "./DelimiterViolationReport";
import { ImagePolicyProvider } from "@/components/rich-content/prose/remote-image-policy";

export type RichContentServerLevel = "inline" | "standard";

export interface RichContentServerProps {
  source: string;
  level: RichContentServerLevel;
  className?: string;
  /** Nested-rendering depth cap (standard). */
  depthCap?: number;
  /** Typography variant (standard); `reading` for long-form public pages. */
  variant?: RichContentVariant;
  /** Inline only: `text` when the content sits inside a link (card previews). */
  links?: InlineLinks;
}

function guarded(source: string, renderPath: string) {
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(source));
  const report =
    violations.length > 0 ? (
      <DelimiterViolationReport violations={violations} renderPath={renderPath} />
    ) : null;
  return { text, report };
}

/** The server twin of BasicMarkdownContent's static markup (same frame, same map). */
export function ProseServer({
  content,
  numbering,
  renderNested,
}: {
  content: string;
  /** The whole document's numbering (from the static root); none for a lone leaf. */
  numbering?: DocumentNumbering | null;
  /** Block bodies of directive containers, rendered by the static root. */
  renderNested?: (source: string) => ReactNode;
}) {
  const direction = detectTextDirection(content);
  const { text, report } = guarded(content, "RichContentServer.prose");
  return (
    <>
      <div className={proseFrameClass(direction)} dir={direction}>
        <style dangerouslySetInnerHTML={{ __html: PROSE_FRAME_CSS }} />
        <MarkdownCoreServer
          preset="chat"
          components={proseElementsWithNested(renderNested)}
          numbering={numbering}
        >
          {text}
        </MarkdownCoreServer>
      </div>
      {report}
    </>
  );
}

function InlineServer({
  source,
  className,
  links,
}: {
  source: string;
  className?: string;
  links?: InlineLinks;
}) {
  if (!source.trim()) return null;
  const { text, report } = guarded(source, "RichContentServer.inline");
  return (
    <>
      <span
        data-rich-content="inline"
        className={cn(INLINE_LEVEL_WRAPPER_CLASS, className)}
      >
        <MarkdownCoreServer preset="chat" components={inlineLevelElements(links)}>
          {text}
        </MarkdownCoreServer>
      </span>
      {report}
    </>
  );
}

export function RichContentServer({
  source,
  level,
  className,
  depthCap = DEFAULT_RICH_CONTENT_DEPTH_CAP,
  variant,
  links,
}: RichContentServerProps) {
  // Public and shared pages show someone's text to a viewer: authorship "other" (remote images wait for a click).
  if (level === "inline") {
    return (
      <ImagePolicyProvider value="other">
        <InlineServer source={source} className={className} links={links} />
      </ImagePolicyProvider>
    );
  }
  return (
    <ImagePolicyProvider value="other">
      <RichContentVariantRoot variant={variant}>
        <StaticStandard
          source={source}
          depth={0}
          cap={depthCap}
          className={className}
          Prose={ProseServer}
        />
      </RichContentVariantRoot>
    </ImagePolicyProvider>
  );
}

export default RichContentServer;
