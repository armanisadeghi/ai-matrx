"use client";

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
import { detectTextDirection, preprocessProse } from "./prose/prose-prepare";
import {
  PROSE_BLOCK_ELEMENTS,
  PROSE_FRAME_CSS,
  proseFrameClass,
} from "./prose/prose-block-elements";
import { DelimiterViolationReport } from "./server/DelimiterViolationReport";

export function RichContentStaticProse({ source }: { source: string }) {
  if (!source.trim()) return null;
  const direction = detectTextDirection(source);
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(source));
  return (
    <>
      <div className={proseFrameClass(direction)} dir={direction}>
        <style dangerouslySetInnerHTML={{ __html: PROSE_FRAME_CSS }} />
        <MarkdownCoreImpl preset="chat" components={PROSE_BLOCK_ELEMENTS}>
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

export default RichContentStaticProse;
