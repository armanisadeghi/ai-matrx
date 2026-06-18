"use client";

/**
 * CanvasBody — the type-keyed renderer switch, extracted so it can be
 * reused independently of any chrome (header, share sheet, sync controls).
 *
 * Two consumers today:
 *   1. `CanvasRenderer` — the legacy "full" renderer (header + body + share
 *      dialog) used by PromptRunnerModal, AdaptiveLayout, and other pre-
 *      existing surfaces. Kept intact for backward compatibility.
 *   2. `CanvasPane` — the new modern per-pane wrapper used by
 *      `CanvasSideSheetInner`, which provides its own pane-aware header
 *      and the optional split-view layout.
 *
 * If you're adding a new content type:
 *   - Add the case here (one place — both surfaces pick it up)
 *   - Register metadata in `canvas-block-meta.ts`
 *   - Update `CanvasContentType` in the slice
 *   - Remember: renderers MUST handle partial state during streaming.
 */

import React, { isValidElement } from "react";
import dynamic from "next/dynamic";
import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";

// Blocks that are NOT handled by the unified renderer (code_preview /
// code_edit_error are NON_PERSISTABLE and have no artifact renderer).
const CodePreviewCanvas = dynamic(
  () =>
    import("@/features/canvas/custom-components/CodePreviewCanvas").then(
      (m) => ({ default: m.CodePreviewCanvas }),
    ),
  { ssr: false },
);
const CodeEditErrorCanvas = dynamic(
  () =>
    import("@/features/canvas/custom-components/CodeEditErrorCanvas").then(
      (m) => ({ default: m.CodeEditErrorCanvas }),
    ),
  { ssr: false },
);

export interface CanvasBodyProps {
  content: CanvasContent;
}

export function CanvasBody({ content }: CanvasBodyProps) {
  return renderContent(content);
}

/** Convert a possibly-ReactNode title to plain text for fallback uses. */
export function titleToString(
  title: string | React.ReactNode | undefined,
): string {
  if (!title) return "";
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  if (typeof title === "boolean") return String(title);
  if (Array.isArray(title)) {
    return title.map(titleToString).filter(Boolean).join(" ");
  }
  if (isValidElement(title)) {
    const children = (title.props as { children?: React.ReactNode })?.children;
    if (children) {
      const extracted = titleToString(children);
      if (extracted) return extracted;
    }
    return "Canvas Content";
  }
  return "Canvas Content";
}

/** Canonical fallback titles per type. */
export function getDefaultTitle(type: string): string {
  const titles: Record<string, string> = {
    quiz: "Quiz",
    presentation: "Presentation",
    iframe: "Web View",
    html: "HTML View",
    code: "Code Viewer",
    image: "Image",
    diagram: "Diagram",
    comparison: "Comparison",
    timeline: "Timeline",
    research: "Research",
    troubleshooting: "Troubleshooting",
    "decision-tree": "Decision Tree",
    flashcards: "Flashcards",
    recipe: "Recipe",
    resources: "Resources",
    progress: "Progress Tracker",
    math_problem: "Math Problem",
    mermaid: "Diagram",
    code_preview: "Code Preview",
    code_edit_error: "Code Edit Error",
  };
  return titles[type] || "Canvas View";
}

/** Short subtitle per type — surfaces as the kind-of-thing label. */
export function getSubtitle(type: string): string | undefined {
  const subtitles: Record<string, string> = {
    quiz: "Interactive quiz",
    presentation: "Slideshow presentation",
    code: "Code snippet",
    diagram: "Interactive diagram",
    mermaid: "Editable diagram",
    math_problem: "Step-by-step solution",
  };
  return subtitles[type];
}

function renderContent(content: CanvasContent): React.ReactNode {
  const { type, data } = content;

  // ── Unified artifact renderer (Wave B) ───────────────────────────────────
  // Types with a unified renderer registered render through the single shared
  // path; the rest fall through to their legacy case below.
  const _def = getArtifactDef(type);
  if (_def && hasArtifactRenderer(_def.canvasType)) {
    const meta = content.metadata as
      | { conversationId?: string; messageId?: string }
      | undefined;
    return (
      <div className="h-full">
        <ArtifactRender
          canvasType={_def.canvasType}
          mode="canvas"
          data={data}
          metadata={content.metadata as Record<string, unknown> | undefined}
          conversationId={meta?.conversationId}
          messageId={meta?.messageId}
        />
      </div>
    );
  }

  // quiz, presentation, recipe, timeline, research, resources, progress,
  // troubleshooting, decision-tree, diagram, flashcards, math_problem,
  // mermaid, code, iframe, html, image → unified renderer via early-branch
  // (cases removed in Wave F; only NON_PERSISTABLE types remain below)
  switch (type) {
    case "code_preview":
      return (
        <CodePreviewCanvas
          originalCode={data.originalCode}
          modifiedCode={data.modifiedCode}
          language={data.language}
          edits={data.edits}
          explanation={data.explanation}
          onApply={data.onApply}
          onDiscard={data.onDiscard}
          onCloseModal={data.onCloseModal}
        />
      );

    case "code_edit_error":
      return (
        <CodeEditErrorCanvas
          errors={data.errors}
          warnings={data.warnings}
          rawResponse={data.rawResponse}
          onClose={data.onClose || (() => {})}
        />
      );

    default:
      return (
        <div className="h-full flex items-center justify-center p-6 text-center text-muted-foreground">
          <div>
            <p className="text-sm mb-2">
              Unsupported content type: <code>{type}</code>
            </p>
            <p className="text-xs">Add a renderer in CanvasBody.tsx.</p>
          </div>
        </div>
      );
  }
}
