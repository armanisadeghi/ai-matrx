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
import {
  NO_SPLITTER_ENVELOPES,
  splitContentIntoBlocksWith,
  type SplitterBlock,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-core";
import { cn } from "@/lib/utils";
import { RichContentDepthProvider } from "../depth";
import { StandardBlock } from "../standard/StandardBlocks";
import {
  DEFAULT_RICH_CONTENT_DEPTH_CAP,
  type RichContentVariant,
} from "../rich-content-types";
import { RichContentVariantRoot } from "../prose/variant-root";
import { detectTextDirection, preprocessProse } from "../prose/prose-prepare";
import {
  INLINE_LEVEL_ELEMENTS,
  INLINE_LEVEL_WRAPPER_CLASS,
} from "../prose/inline-level-elements";
import {
  PROSE_BLOCK_ELEMENTS,
  PROSE_FRAME_CSS,
  proseFrameClass,
} from "../prose/prose-block-elements";
import { DelimiterViolationReport } from "./DelimiterViolationReport";

export type RichContentServerLevel = "inline" | "standard";

export interface RichContentServerProps {
  source: string;
  level: RichContentServerLevel;
  className?: string;
  /** Nested-rendering depth cap (standard). */
  depthCap?: number;
  /** Typography variant (standard); `reading` for long-form public pages. */
  variant?: RichContentVariant;
}

/** XML control sections whose body is prose — the same set StandardBlock nests. */
const SECTION_TYPES = new Set([
  "info",
  "task",
  "plan",
  "database",
  "private",
  "event",
  "tool",
  "thinking",
  "reasoning",
  "consolidated_reasoning",
]);

const MUTED_SECTIONS = new Set([
  "thinking",
  "reasoning",
  "consolidated_reasoning",
]);

function guarded(source: string, renderPath: string) {
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(source));
  const report =
    violations.length > 0 ? (
      <DelimiterViolationReport violations={violations} renderPath={renderPath} />
    ) : null;
  return { text, report };
}

/** The server twin of BasicMarkdownContent's static markup (same frame, same map). */
export function ProseServer({ content }: { content: string }) {
  const direction = detectTextDirection(content);
  const { text, report } = guarded(content, "RichContentServer.prose");
  return (
    <>
      <div className={proseFrameClass(direction)} dir={direction}>
        <style dangerouslySetInnerHTML={{ __html: PROSE_FRAME_CSS }} />
        <MarkdownCoreServer preset="chat" components={PROSE_BLOCK_ELEMENTS}>
          {text}
        </MarkdownCoreServer>
      </div>
      {report}
    </>
  );
}

function InlineServer({ source, className }: { source: string; className?: string }) {
  if (!source.trim()) return null;
  const { text, report } = guarded(source, "RichContentServer.inline");
  return (
    <>
      <span
        data-rich-content="inline"
        className={cn(INLINE_LEVEL_WRAPPER_CLASS, className)}
      >
        <MarkdownCoreServer preset="chat" components={INLINE_LEVEL_ELEMENTS}>
          {text}
        </MarkdownCoreServer>
      </span>
      {report}
    </>
  );
}

function ServerBlock({
  block,
  depth,
  cap,
}: {
  block: SplitterBlock;
  depth: number;
  cap: number;
}) {
  const { type, content } = block;

  if (type === "text" || type === "table") {
    if (!content.trim()) return null;
    return <ProseServer content={content} />;
  }

  if (SECTION_TYPES.has(type) && depth + 1 <= cap) {
    if (!content.trim()) return null;
    return (
      <div
        data-rich-content-section={type}
        className={
          MUTED_SECTIONS.has(type)
            ? "my-2 border-l-2 border-border pl-3 text-muted-foreground"
            : "my-2"
        }
      >
        <StandardServer source={content} depth={depth + 1} cap={cap} />
      </div>
    );
  }

  if (type === "image" && block.src) {
    return (
      <img
        src={block.src}
        alt={block.alt || ""}
        className="my-2 h-auto max-w-full rounded-md object-contain"
      />
    );
  }

  if (type === "accent-divider" || type === "heavy-divider") {
    return <hr className="my-4 border-border" />;
  }

  // Interactive or engine-backed blocks: the client StandardBlock, told how
  // deep it sits so its own nesting (and the capped "Render it" view past
  // the cap) behaves exactly as it does on the client. Only the fields it
  // reads cross the wire.
  return (
    <RichContentDepthProvider depth={depth} cap={cap}>
      <StandardBlock
        block={{
          type,
          content,
          language: block.language,
          src: block.src,
          alt: block.alt,
        }}
      />
    </RichContentDepthProvider>
  );
}

function StandardServer({
  source,
  depth,
  cap,
  className,
}: {
  source: string;
  depth: number;
  cap: number;
  className?: string;
}) {
  // The same splitter as the client levels, minus the kind-envelope hooks
  // (metadata only — block types and boundaries are identical).
  const blocks = splitContentIntoBlocksWith(source, NO_SPLITTER_ENVELOPES);
  return (
    <div data-rich-content="standard" className={className ?? "min-w-0"}>
      {blocks.map((block, index) => (
        <ServerBlock key={index} block={block} depth={depth} cap={cap} />
      ))}
    </div>
  );
}

export function RichContentServer({
  source,
  level,
  className,
  depthCap = DEFAULT_RICH_CONTENT_DEPTH_CAP,
  variant,
}: RichContentServerProps) {
  if (level === "inline") {
    return <InlineServer source={source} className={className} />;
  }
  return (
    <RichContentVariantRoot variant={variant}>
      <StandardServer
        source={source}
        depth={0}
        cap={depthCap}
        className={className}
      />
    </RichContentVariantRoot>
  );
}

export default RichContentServer;
