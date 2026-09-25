"use client";

import type React from "react";

// ─────────────────────────────────────────────────────────────────────────
// The prose leaf rendered STATICALLY inside a client component — for public
// client surfaces (share lenses, public resource views) whose text must be in
// the server-rendered HTML. MarkdownCore (the normal front door) is
// `ssr: false`, so these surfaces used to import react-markdown themselves
// with their own plugins; now they render the SAME core the server level
// does: preprocessProse + delimiter guard, preset "chat", the shared prose
// element map and frame. Markup is identical to server/RichContentServer's
// ProseServer (guard: __tests__/server-level-parity.test.tsx).
//
// BUILD GRAPH: imports MarkdownCoreImpl statically, so react-markdown enters
// the caller's chunk. Use it ONLY on public pages that need SSR text; every
// in-app surface uses <RichContent> (one lazy edge).
// ─────────────────────────────────────────────────────────────────────────

import { guardMarkdownDelimiters } from "@ai-matrx/kit/delimiter-guard";
import MarkdownCoreImpl from "@/components/markdown-core/MarkdownCoreImpl";
import { cn } from "@/lib/utils";
import { detectTextDirection, preprocessProse } from "./prose/prose-prepare";
import {
  INLINE_LEVEL_WRAPPER_CLASS,
  inlineLevelElements,
  type InlineLinks,
} from "./prose/inline-level-elements";
import {
  proseElementsWithNested,
  PROSE_FRAME_CSS,
  proseFrameClass,
} from "./prose/prose-block-elements";
import { DelimiterViolationReport } from "./server/DelimiterViolationReport";
import { RichContentVariantRoot } from "./prose/variant-root";
import {
  DEFAULT_RICH_CONTENT_DEPTH_CAP,
  type RichContentVariant,
} from "./rich-content-types";
import { StaticStandard } from "./standard/static-standard";
import { ImagePolicyProvider } from "@/components/rich-content/prose/remote-image-policy";

/** The prose leaf alone (frame + one prose map), statically. */
export function StaticProseLeaf({
  content,
  renderNested,
}: {
  content: string;
  /** Accepted for the StaticProse contract; the client core reads the numbering from DocumentNumberingProvider. */
  numbering?: unknown;
  /** Block bodies of directive containers, rendered by the static root. */
  renderNested?: (source: string) => React.ReactNode;
}) {
  if (!content.trim()) return null;
  const direction = detectTextDirection(content);
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(content));
  return (
    <>
      <div className={proseFrameClass(direction)} dir={direction}>
        <style dangerouslySetInnerHTML={{ __html: PROSE_FRAME_CSS }} />
        <MarkdownCoreImpl preset="chat" components={proseElementsWithNested(renderNested)}>
          {text}
        </MarkdownCoreImpl>
      </div>
      {violations.length > 0 ? (
        <DelimiterViolationReport
          violations={violations}
          renderPath="RichContentStaticProse"
        />
      ) : null}
    </>
  );
}

/**
 * Prose ONLY — one prose leaf, no block splitting. For text that is known to
 * be a single prose block. A document (a note, a shared body, anything that
 * may hold fences or XML sections) uses RichContentStaticStandard.
 */
export function RichContentStaticProse({
  source,
  variant,
}: {
  source: string;
  variant?: RichContentVariant;
}) {
  if (!source.trim()) return null;
  return (
    <ImagePolicyProvider value="other">
      <RichContentVariantRoot variant={variant}>
        <StaticProseLeaf content={source} />
      </RichContentVariantRoot>
    </ImagePolicyProvider>
  );
}

/**
 * The `standard` level, statically (SSR'd client) — the SAME block routing as
 * the server level (standard/static-standard.tsx): the one splitter and
 * nested-fence rule, sections to the depth cap, engine blocks through the
 * client StandardBlock. Markup identical to RichContentServer
 * level="standard" (parity guard, incl. a ```markdown fence with an inner
 * fence). For share pages, public resources and signed documents.
 */
export function RichContentStaticStandard({
  source,
  variant,
  depthCap = DEFAULT_RICH_CONTENT_DEPTH_CAP,
  className,
}: {
  source: string;
  variant?: RichContentVariant;
  depthCap?: number;
  className?: string;
}) {
  return (
    <ImagePolicyProvider value="other">
      <RichContentVariantRoot variant={variant}>
        <StaticStandard
          source={source}
          depth={0}
          cap={depthCap}
          className={className}
          Prose={StaticProseLeaf}
        />
      </RichContentVariantRoot>
    </ImagePolicyProvider>
  );
}

/**
 * The `inline` level, statically (SSR'd) — phrasing only, valid inside a <p>.
 * Markup identical to RichContentServer level="inline" (parity guard).
 * Inside a link, pass `links="text"` (no nested anchor).
 */
export function RichContentStaticInline({
  source,
  className,
  links,
}: {
  source: string;
  className?: string;
  /** `text` when the content sits inside a link. */
  links?: InlineLinks;
}) {
  if (!source.trim()) return null;
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(source));
  return (
    <ImagePolicyProvider value="other">
      <span
        data-rich-content="inline"
        className={cn(INLINE_LEVEL_WRAPPER_CLASS, className)}
      >
        <MarkdownCoreImpl preset="chat" components={inlineLevelElements(links)}>
          {text}
        </MarkdownCoreImpl>
      </span>
      {violations.length > 0 ? (
        <DelimiterViolationReport
          violations={violations}
          renderPath="RichContentStaticInline"
        />
      ) : null}
    </ImagePolicyProvider>
  );
}

export default RichContentStaticProse;
