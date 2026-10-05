"use client";

/**
 * KindTextGate — the bottom-layer refusal for the plain markdown leaves
 * (`BasicMarkdownContent`, `ConfigurableMarkdownContent`, `MarkdownRenderer`,
 * `MarkdownWithPlugins`). Each of them draws a ```json fence as a code card and
 * a bare object as prose, so text carrying a `__kind` key (Arman, 2026-09-30:
 * a kind is never drawn as raw JSON) is handed to the canonical pipeline,
 * `MarkdownStream`, instead — and the caller is filed in the Error Inspector.
 *
 * Recursion: `MarkdownStream` itself draws prose through `BasicMarkdownContent`.
 * Every rerouted text is recorded in context; a leaf below handed that same
 * text (or a slice of it) renders it itself, so the pipeline never loops back.
 */

import React, { createContext, useContext } from "react";
import MarkdownStream from "@/components/MarkdownStream";
import {
  firstKindSlug,
  isKindJsonText,
  markdownCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { KindSourceView, useKindSourceView } from "./kind-source-view";
import { spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { useReportKindAtRawRenderer } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";
import type { ImagePolicyDeclaration } from "@/components/rich-content/prose/remote-image-policy";

/** Texts an ancestor gate already handed to the pipeline. */
const ReroutedTextsContext = createContext<readonly string[]>([]);

// The source-view context lives in its own module (read by leaves that must
// not import the pipeline); re-exported here for existing callers.
export { KindSourceView, useKindSourceView } from "./kind-source-view";

export interface KindTextGateProps {
  /** The leaf's own name, for the report. */
  component: string;
  content: string;
  isStreamActive?: boolean;
  imagePolicy?: ImagePolicyDeclaration;
  /** A deliberate source view (docs, authoring) keeps the leaf's own rendering. */
  showSource?: boolean;
  /** Whether the pipeline shows its copy control (the leaf's own setting). */
  showCopyButton?: boolean;
  children: React.ReactNode;
}

/** Whether a leaf should hand this text to the pipeline instead of drawing it. */
export function textNeedsKindPipeline(
  content: string,
  rerouted: readonly string[],
): boolean {
  // A kind spelled so no JSON reader opens it (escaped, smart quotes, entities,
  // Python repr) is not a region the pipeline lifts: the prose leaf reads it
  // as its one-line label (K4b round 7, round 8), so it never reroutes.
  if (!content || !markdownCarriesKind(spelledKindsAsOneLine(content))) return false;
  const own = content.trim();
  return !rerouted.some((text) => text.includes(own));
}

export function KindTextGate({
  component,
  content,
  isStreamActive,
  imagePolicy,
  showSource = false,
  showCopyButton = false,
  children,
}: KindTextGateProps) {
  const rerouted = useContext(ReroutedTextsContext);
  const sourceView = useKindSourceView();
  const reroute =
    !showSource && !sourceView && textNeedsKindPipeline(content, rerouted);
  useReportKindAtRawRenderer(
    component,
    reroute ? firstKindSlug(content) : null,
    reroute,
  );
  // A deliberate source view reaches the leaves below it too (the compact
  // code snippet honours it), so the text stays exactly as written.
  if (!reroute) return showSource ? <KindSourceView>{children}</KindSourceView> : <>{children}</>;
  // A whole-text kind object has no fence for the pipeline to find — give it one.
  const trimmed = content.trim();
  const pipelineText = isKindJsonText(trimmed)
    ? `\u0060\u0060\u0060json\n${trimmed}\n\u0060\u0060\u0060`
    : content;
  // Both forms: a leaf below may be handed either one (or a slice of it).
  const nextRerouted = [...rerouted, trimmed, pipelineText.trim()];
  return (
    <ReroutedTextsContext.Provider value={nextRerouted}>
      <MarkdownStream
        content={pipelineText}
        isStreamActive={isStreamActive}
        imagePolicy={imagePolicy ?? "inherit"}
        hideCopyButton={!showCopyButton}
      />
    </ReroutedTextsContext.Provider>
  );
}

export default KindTextGate;
