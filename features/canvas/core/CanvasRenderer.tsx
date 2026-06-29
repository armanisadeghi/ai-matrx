"use client";

import React, { useState, isValidElement } from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeCanvas,
  clearCanvas,
  setCurrentItem,
  removeCanvasItem,
  selectCurrentCanvasItem,
  selectCanvasItems,
  selectCurrentItemId,
  type CanvasItem,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { CanvasHeader, ViewMode } from "./CanvasHeader";
import { CanvasNavigation } from "./CanvasNavigation";
import type { CanvasType } from "@/types/canvas-social";

// next/dynamic requires inline object literals for options — no variable references allowed.
// All blocks use ssr: false so they are completely excluded from SSR module analysis.
const SavedCanvasItems = dynamic(
  () => import("./SavedCanvasItems").then((m) => m.SavedCanvasItems),
  { ssr: false },
);
const CanvasShareSheet = dynamic(
  () =>
    import("@/features/canvas/social/CanvasShareSheet").then(
      (m) => m.CanvasShareSheet,
    ),
  { ssr: false },
);
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
const FlashcardsBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
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

interface CanvasRendererProps {
  // Props are now optional - component gets data from Redux
  content?: CanvasContent | null;
  // Style variant for compact displays
  variant?: "default" | "compact";
}

/**
 * CanvasRenderer - Universal renderer for canvas content
 *
 * Handles rendering of different interactive content types in the canvas panel.
 * Each block type is rendered with appropriate props and full interactivity.
 * Now supports multiple canvas items with navigation and history.
 */
export function CanvasRenderer({
  content: propContent,
  variant = "default",
}: CanvasRendererProps) {
  const dispatch = useAppDispatch();
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);

  // Get canvas state from Redux
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const allItems = useAppSelector(selectCanvasItems);
  const currentItemId = useAppSelector(selectCurrentItemId);

  // Use prop content if provided, otherwise use Redux state
  const content = propContent || currentItem?.content;

  if (!content) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
        <p className="text-sm">No content to display</p>
      </div>
    );
  }

  const handleClose = () => {
    dispatch(closeCanvas());
  };

  const handleNavigate = (itemId: string) => {
    dispatch(setCurrentItem(itemId));
    // Reset view mode when switching items
    setViewMode("preview");
  };

  const handleRemove = (itemId: string) => {
    dispatch(removeCanvasItem(itemId));
  };

  const handleClearAll = () => {
    dispatch(clearCanvas());
  };

  const handleShare = () => {
    setIsShareSheetOpen(true);
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (!content || !currentItem) return;

    setIsSyncing(true);

    // Import the service dynamically to avoid circular dependencies
    const { canvasArtifactService } =
      await import("@/features/canvas/services/canvasArtifactService");
    const { ensureArtifactPersisted } =
      await import("@/features/canvas/materialization/ensureArtifactPersisted");
    const { markItemSynced } =
      await import("@/features/canvas/redux/canvasSlice");
    const { isMaterializedArtifactId } =
      await import("@/features/canvas/artifact-types/artifactId");

    const existingId =
      content.metadata?.canvasItemId ?? currentItem.savedItemId;
    let rawContent = typeof content.data === "string" ? content.data : "";
    if (!rawContent && isMaterializedArtifactId(existingId)) {
      const row = await canvasArtifactService.getById(existingId!);
      if (
        row?.content &&
        typeof row.content === "object" &&
        "data" in row.content
      ) {
        const d = (row.content as { data?: unknown }).data;
        rawContent = typeof d === "string" ? d : JSON.stringify(d ?? "");
      }
    }

    const result = await ensureArtifactPersisted({
      canvasType: content.type,
      title:
        typeof content.metadata?.title === "string"
          ? content.metadata.title
          : content.type,
      content: rawContent,
      messageId:
        content.metadata?.messageId ?? content.metadata?.sourceMessageId,
      conversationId: content.metadata?.conversationId,
      artifactId: existingId,
    });

    if (result.ok && result.artifactId) {
      dispatch(
        markItemSynced({
          sessionItemId: currentItem.id,
          artifactId: result.artifactId,
          artifactDebug: {
            steps: result.steps,
            errors: result.errors,
            ensuredAt: Date.now(),
            wasCreated: result.wasCreated,
          },
        }),
      );
    }

    setIsSyncing(false);
  };

  // All canvas types now have sync support
  const hasSyncSupport = true;
  const isSynced = currentItem?.isSynced || false;

  return (
    <div className="h-full flex flex-col bg-textured overflow-hidden">
      {/* Canvas Header */}
      <CanvasHeader
        title={
          viewMode === "library"
            ? "Saved Items"
            : content.metadata?.title || getDefaultTitle(content.type)
        }
        subtitle={
          viewMode === "library"
            ? "Manage your saved canvas items"
            : getSubtitle(content.type)
        }
        onClose={handleClose}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showLibraryToggle={true}
        isSynced={isSynced}
        isSyncing={isSyncing}
        onSync={hasSyncSupport ? handleSync : undefined}
        hideSync={!hasSyncSupport}
        onShare={handleShare}
        hideViewToggle={viewMode === "library"}
        variant={variant}
        customActions={
          viewMode !== "library" && (
            <CanvasNavigation
              items={allItems}
              currentItemId={currentItemId}
              onNavigate={handleNavigate}
              onRemove={handleRemove}
              onClearAll={handleClearAll}
            />
          )
        }
      />

      {/* Canvas Content */}
      <div className="flex-1 overflow-y-auto scrollbar-overlay">
        {viewMode === "library" ? (
          <SavedCanvasItems />
        ) : viewMode === "preview" ? (
          renderContent(content)
        ) : (
          <div className="h-full p-0 sm:p-2">
            <pre className="text-xs text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 p-2 rounded-lg overflow-auto h-full border border-zinc-200 dark:border-zinc-800 scrollbar-thin">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Share Sheet */}
      <CanvasShareSheet
        open={isShareSheetOpen}
        onOpenChange={setIsShareSheetOpen}
        canvasData={content.data}
        canvasType={content.type as CanvasType}
        defaultTitle={
          titleToString(content.metadata?.title) ||
          getDefaultTitle(content.type)
        }
        hasScoring={content.type === "quiz" || content.type === "flashcards"}
      />
    </div>
  );
}

/**
 * Convert ReactNode title to string for components that need plain text
 * Recursively extracts text content from React elements
 */
function titleToString(title: string | React.ReactNode | undefined): string {
  if (!title) return "";
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  if (typeof title === "boolean") return String(title);

  // Handle arrays (e.g., fragments with multiple children)
  if (Array.isArray(title)) {
    return title.map(titleToString).filter(Boolean).join(" ");
  }

  // For React elements, try to extract text from children
  if (isValidElement(title)) {
    const children = (title.props as any)?.children;

    if (children) {
      // Recursively extract text from children
      const extracted = titleToString(children);
      if (extracted) return extracted;
    }

    // If no children or couldn't extract text, use fallback
    return "Canvas Content";
  }

  // For any other type, use fallback
  return "Canvas Content";
}

/**
 * Get default title based on content type
 */
function getDefaultTitle(type: string): string {
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
    code_preview: "Code Preview",
    code_edit_error: "Code Edit Error",
  };
  return titles[type] || "Canvas View";
}

/**
 * Get subtitle based on content type
 */
function getSubtitle(type: string): string | undefined {
  const subtitles: Record<string, string> = {
    quiz: "Interactive quiz",
    presentation: "Slideshow presentation",
    code: "Code snippet",
    diagram: "Interactive diagram",
    math_problem: "Step-by-step solution",
  };
  return subtitles[type];
}

/**
 * Renders the appropriate component based on content type
 */
function renderContent(content: CanvasContent): React.ReactNode {
  const { type, data } = content;

  switch (type) {
    // ✅ FULLY IMPLEMENTED BLOCKS
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

    case "comparison":
      return (
        <div className="h-full p-0">
          <ComparisonTableBlock comparison={data} />
        </div>
      );

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

    // 🚧 SIMPLE CONTENT TYPES
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
        <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 p-4">
          <div className="text-center">
            <p className="text-sm mb-2">❌ Unsupported content type: {type}</p>
            <p className="text-xs">
              Add a renderer for this type in CanvasRenderer.tsx
            </p>
          </div>
        </div>
      );
  }
}
