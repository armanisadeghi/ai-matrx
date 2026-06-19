"use client";

import React, { Suspense, lazy } from "react";
import SandboxedHtml from "@/components/mardown-display/blocks/common/SandboxedHtml";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../artifact-renderers";

const HtmlInlinePreview = lazy(
  () => import("@/features/html-pages/components/HtmlInlinePreview"),
);

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
      />
    </Suspense>
  );
}
