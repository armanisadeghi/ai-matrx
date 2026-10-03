"use client";

import { Suspense } from "react";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import SandboxedHtml from "@/components/mardown-display/blocks/common/SandboxedHtml";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../types";
import HtmlInlinePreview from "@/features/html-pages/components/HtmlInlinePreview";

/**
 * Unified renderer for `html` artifacts (chat / canvas / artifact-card / public).
 *
 * OWNER view → the rich HtmlInlinePreview (live webpage preview + convert-to-page;
 * scripts enabled — the author runs THEIR OWN html in THEIR OWN session, same as
 * inline chat).
 * PUBLIC view → SandboxedHtml (empty sandbox: no scripts, no same-origin) so an
 * anonymous visitor NEVER executes attacker-authored html in their session — the
 * Wave-0 stored-XSS guard. Driven by `isPublic` (set by PublicCanvasRenderer).
 */
export default function HtmlArtifact({
  mode,
  raw,
  data,
  metadata,
  messageId,
  conversationId,
  isStreamActive,
  isPublic,
}: ArtifactRendererProps) {
  // Inside a canvas tab the page is an APP: it fills the tab body edge to
  // edge, live with the pane's size. Everywhere else (chat, artifact cards)
  // keeps the bounded card preview.
  const presentation = useCanvasPresentation();
  const fill = mode === "canvas" && presentation !== null;
  const html =
    typeof data === "string"
      ? data
      : ((data as { html?: string })?.html ?? raw ?? "");

  if (isPublic) {
    const title = (metadata?.title as string) || "Content";
    const height = mode === "canvas" ? "100%" : 400;
    return <SandboxedHtml html={html} title={title} height={height} />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <HtmlInlinePreview
        code={html}
        language="html"
        isComplete={!isStreamActive}
        messageId={messageId}
        conversationId={conversationId}
        fill={fill}
      />
    </Suspense>
  );
}
