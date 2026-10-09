"use client";

import { Suspense } from "react";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import SandboxedHtml from "@ai-matrx/rich-content/display/blocks/common/SandboxedHtml";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../types";
import HtmlInlinePreview from "@/features/html-pages/components/HtmlInlinePreview";
import KindValueFrontDoor from "@/components/official/structured-value/KindValueFrontDoor";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { FileCode } from "lucide-react";
import { EmptyState } from "@ai-matrx/design-system/controls";

/**
 * An artifact whose subtype nobody registered (an agent's own `checklist`) falls
 * to this renderer, and its body is a `{"__kind": …}` JSON value, never a page.
 * Returns that value so it goes to the ONE kind front door (the honest "no custom
 * view yet" floor for an unregistered kind) instead of being drawn as HTML text.
 */
const KIND_BODY_PREFIX = /^\s*\{\s*"__kind"\s*:/;

export function kindValueOfHtmlBody(body: string): Record<string, unknown> | null {
  const text = body.trim();
  if (!text.startsWith("{") || !text.includes(KIND_KEY)) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[KIND_KEY] === "string") {
      return value as Record<string, unknown>;
    }
  } catch {
    // Still arriving, or simply not JSON: it is HTML.
  }
  return null;
}

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
  artifactId,
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

  // A page with no markup is never a blank pane: say so (a still-streaming one is
  // not empty yet — it is arriving).
  if (!html.trim() && !isStreamActive) {
    return (
      <div className={fill ? "flex h-full items-center justify-center" : "p-3"} data-empty-html="">
        <EmptyState icon={<FileCode className="size-5" />} title="This page is empty" line="It has no content to show yet." />
      </div>
    );
  }

  const kindValue = kindValueOfHtmlBody(html);
  // A `{"__kind": …` body that has not finished arriving is never shown as text.
  if (!kindValue && isStreamActive && KIND_BODY_PREFIX.test(html)) return <MatrxMiniLoader />;
  if (kindValue) {
    return (
      <div className={fill ? "h-full overflow-auto p-3" : "p-3"} data-unregistered-kind={String(kindValue[KIND_KEY])}>
        <KindValueFrontDoor value={kindValue} />
      </div>
    );
  }

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
        artifactId={
          artifactId ??
          (typeof metadata?.canvasItemId === "string" ? metadata.canvasItemId : undefined)
        }
      />
    </Suspense>
  );
}
