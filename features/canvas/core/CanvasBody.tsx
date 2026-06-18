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

// All blocks load lazily — keeps the canvas itself small and only pays for
// the block types the user actually opens.
const MultipleChoiceQuiz = dynamic(
  () => import("@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz"),
  { ssr: false },
);
const Slideshow = dynamic(
  () => import("@/components/mardown-display/blocks/presentations/Slideshow"),
  { ssr: false },
);
const RecipeViewer = dynamic(
  () =>
    import("@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay"),
  { ssr: false },
);
const TimelineBlock = dynamic(
  () => import("@/components/mardown-display/blocks/timeline/TimelineBlock"),
  { ssr: false },
);
const ResearchBlock = dynamic(
  () => import("@/components/mardown-display/blocks/research/ResearchBlock"),
  { ssr: false },
);
const ResourceCollectionBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/resources/ResourceCollectionBlock"),
  { ssr: false },
);
const ProgressTrackerBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/progress/ProgressTrackerBlock"),
  { ssr: false },
);
const ComparisonTableBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/comparison/ComparisonTableBlock"),
  { ssr: false },
);
const TroubleshootingBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock"),
  { ssr: false },
);
const DecisionTreeBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock"),
  { ssr: false },
);
const InteractiveDiagramBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock"),
  { ssr: false },
);
const CanvasFlashcardsView = dynamic(
  () =>
    import("@/features/flashcards/components/CanvasFlashcardsView").then(
      (m) => ({ default: m.CanvasFlashcardsView }),
    ),
  { ssr: false },
);
const CodeBlock = dynamic(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
  { ssr: false },
);
const MathProblem = dynamic(
  () => import("@/features/math/components/MathProblem"),
  { ssr: false },
);
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
const MermaidWorkbench = dynamic(
  () => import("@/components/mermaid/workbench/MermaidWorkbench"),
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

  switch (type) {
    case "quiz":
      return (
        <div className="h-full p-0">
          <MultipleChoiceQuiz quizData={data} />
        </div>
      );

    case "presentation":
      return (
        <div className="h-full">
          <Slideshow
            slides={data.slides || data}
            theme={
              data.theme || {
                primaryColor: "#2563eb",
                secondaryColor: "#1e40af",
              }
            }
          />
        </div>
      );

    case "recipe":
      return (
        <div className="h-full p-0">
          <RecipeViewer recipe={data} />
        </div>
      );

    case "timeline":
      return (
        <div className="h-full p-0">
          <TimelineBlock timeline={data} />
        </div>
      );

    case "research":
      return (
        <div className="h-full p-0">
          <ResearchBlock research={data} />
        </div>
      );

    case "resources":
      return (
        <div className="h-full p-0">
          <ResourceCollectionBlock collection={data} />
        </div>
      );

    case "progress":
      return (
        <div className="h-full p-0">
          <ProgressTrackerBlock tracker={data} />
        </div>
      );

    // comparison → unified renderer (handled by the early-branch above)

    case "troubleshooting":
      return (
        <div className="h-full p-0">
          <TroubleshootingBlock troubleshooting={data} />
        </div>
      );

    case "decision-tree":
      return (
        <div className="h-full p-0">
          <DecisionTreeBlock decisionTree={data} />
        </div>
      );

    case "diagram":
      return (
        <div className="h-full p-0">
          <InteractiveDiagramBlock diagram={data} />
        </div>
      );

    case "flashcards":
      return (
        <div className="h-full">
          <CanvasFlashcardsView
            content={typeof data === "string" ? data : undefined}
            serverData={typeof data === "object" ? data : undefined}
            conversationId={
              content.metadata?.conversationId as string | undefined
            }
            messageId={content.metadata?.messageId as string | undefined}
          />
        </div>
      );

    case "math_problem":
      return (
        <div className="h-full p-0">
          <MathProblem id="canvas-preview" {...data.math_problem} />
        </div>
      );

    case "mermaid":
      return (
        <MermaidWorkbench
          source={typeof data === "string" ? data : String((data as { data?: unknown })?.data ?? "")}
          metadata={content.metadata}
        />
      );

    case "code":
      return (
        <div className="h-full p-0">
          <CodeBlock
            code={data.code || data}
            language={data.language || "javascript"}
          />
        </div>
      );

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

    case "iframe":
      return (
        <iframe
          src={data.url || data}
          className="w-full h-full border-0"
          title={titleToString(content.metadata?.title) || "Canvas Content"}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      );

    case "html":
      return (
        <div
          className="p-4 prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: data.html || data }}
        />
      );

    case "image":
      return (
        <div className="h-full flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
          <img
            src={data.url || data}
            alt={titleToString(content.metadata?.title) || "Canvas Image"}
            className="max-w-full max-h-full object-contain"
          />
        </div>
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
