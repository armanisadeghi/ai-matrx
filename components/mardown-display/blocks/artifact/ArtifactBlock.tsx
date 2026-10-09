"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import React, { Suspense, lazy, useMemo, useState } from "react";
import { Copy, History, Maximize2, Unlink } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { artifactContentToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import { useUnbindArtifact } from "@/features/canvas/materialization/useUnbindArtifact";
import { ArtifactVersionHistory } from "@/features/canvas/components/ArtifactVersionHistory";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { useArtifactContentToggle } from "@/features/canvas/host/useArtifactCanvas";
import { cn } from "@/lib/utils";
import { artifactTitleRepeatsCard } from "./artifact-own-title";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";
import type { CanvasContentType } from "@/features/canvas/canvasContent";
import { resolveCanvasType } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import BasicMarkdownContent from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";
import { safeJsonParse } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/json-parse-utils";
import { Button } from "@ai-matrx/design-system/controls";
import { HtmlPreviewChromeProvider } from "@/features/html-pages/components/HtmlPreviewChrome";
// Lazy load block renderers — only the ones that accept raw content strings
const CodeBlock = lazy(
  () => import("@ai-matrx/rich-content/code-block/CodeBlock"),
);

interface ArtifactBlockProps {
  content: string;
  metadata?: {
    isComplete?: boolean;
    artifactId?: string;
    artifactIndex?: number;
    artifactType?: string;
    artifactTitle?: string;
    rawXml?: string;
  };
  serverData?: {
    artifactId?: string;
    artifactIndex?: number;
    artifactType?: string;
    title?: string;
    content?: string;
  } | null;
  /**
   * serverData derived from a STRUCTURED (kind-IR) stored payload (Track 2B —
   * `kindServerDataFromStoredValue`). Used as the renderer's serverData when
   * the stream-shaped `serverData` prop is absent; the type-specific renderer
   * (e.g. FlashcardsArtifact) narrows it.
   */
  structuredServerData?: Record<string, unknown> | null;
  isStreamActive?: boolean;
  messageId?: string;
  conversationId?: string;
  taskId?: string;
}

/**
 * ArtifactBlock — renders model-produced `<artifact>` blocks.
 *
 * Routes artifact content to the REAL renderer for that type (iframe, code
 * editor, flashcards, quiz, diagram, etc.) and wraps it with artifact
 * metadata (ID, title, "open in canvas" button).
 *
 * For types that need parsed data (timeline, research, quiz, etc.), this
 * component dynamically imports the correct parser and parses the raw
 * content before handing it to the renderer — exactly like BlockRenderer does.
 */
const ArtifactBlock: React.FC<ArtifactBlockProps> = ({
  content,
  metadata,
  serverData,
  structuredServerData,
  isStreamActive,
  messageId,
  conversationId,
  taskId,
}) => {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const { open } = useCanvas();
  const { openArtifact } = useOpenArtifactInCanvas();
  const { isCanvasAvailable } = useCanvasOpenGuard();

  const artifactTitle =
    serverData?.title || metadata?.artifactTitle || "Artifact";
  const artifactType =
    serverData?.artifactType || metadata?.artifactType || "text";
  const artifactIndex =
    serverData?.artifactIndex ?? metadata?.artifactIndex ?? 0;
  const artifactId =
    serverData?.artifactId ||
    metadata?.artifactId ||
    `artifact-${artifactIndex}`;
  const isComplete = metadata?.isComplete !== false;

  const canvasType: CanvasContentType =
    resolveCanvasType("artifact", artifactType) || "html";
  // The finished card prints the payload's own title: the muted label above it would repeat it.
  const payloadTitle =
    (structuredServerData?.title as unknown) ??
    (safeJsonParse(content) as { title?: unknown } | null)?.title;
  const showTitleLabel = !(
    isComplete && artifactTitleRepeatsCard(canvasType, artifactTitle, payloadTitle)
  );
  const dedupKey = taskId || `artifact:${artifactId}`;

  /** Build the canvas data shape. JSON types get parsed, strings pass through. */
  const canvasData = useMemo(() => {
    switch (artifactType) {
      case "quiz":
      case "presentation":
      case "diagram":
      case "comparison":
      case "decision-tree":
      case "decision_tree":
      case "math_problem": {
        const parsed = safeJsonParse(content);
        return parsed || content;
      }
      default:
        return content;
    }
  }, [content, artifactType]);

  /**
   * "Copy as Markdown" — the forward leg of artifact ⇄ markdown (see
   * /Users/armanisadeghi/code/common-docs/systems/publish/artifacts/TWO-WAY-BINDING.md). Structured (kind) payloads
   * render through the kind registry's toMarkdown facet; string payloads
   * copy as-is (they ARE markdown / wire text). Works identically for
   * inline artifacts and materialized refs — both hand this component the
   * raw payload string.
   */
  const handleCopyMarkdown = async () => {
    if (!(await copyText(
      artifactContentToMarkdown(content, artifactType), "Copied as Markdown",
    ))) return;
  };

  /**
   * "Detach as text" — the UNBIND leg (/Users/armanisadeghi/code/common-docs/systems/publish/artifacts/TWO-WAY-BINDING.md
   * § b). Replaces this ref with the artifact's markdown export in the source
   * surface (chat message, or a note via UnbindSurfaceContext); the saved
   * artifact row is KEPT in the canvas library. Inertness-gated inside the
   * primitive — types that would re-materialize refuse with a toast.
   */
  const {
    canUnbind,
    busy: unbindBusy,
    unbind,
    surfaceNoun,
  } = useUnbindArtifact({
    artifactId: isMaterializedArtifactId(artifactId) ? artifactId : null,
    messageId,
    conversationId,
  });
  // A phone-width html card carries version history in its "More" menu; the entry opens this.
  const [historyFromMenu, setHistoryFromMenu] = useState(false);

  const handleUnbind = async () => {
    const ok = await confirm({
      title: "Detach as text?",
      description: `Replaces this artifact with plain Markdown in the ${surfaceNoun}. The saved artifact stays in your canvas library.`,
      confirmLabel: "Detach",
    });
    if (!ok) return;
    await unbind();
  };

  // The tab this block opens as — the same identity both open paths give it
  // (a saved artifact's id, else this block's task key) — so the button shows
  // pressed while that tab is in front and the next press closes it.
  const canvasToggle = useArtifactContentToggle({
    type: canvasType,
    data: canvasData,
    metadata: {
      title: artifactTitle,
      sourceMessageId: messageId,
      sourceTaskId: dedupKey,
      canvasItemId: isMaterializedArtifactId(artifactId) ? artifactId : undefined,
    },
  });

  const handleOpenCanvas = () => {
    if (canvasToggle.closeIfVisible()) return;
    const rawPayload =
      typeof canvasData === "string" ? canvasData : JSON.stringify(canvasData);
    const def = getArtifactDef(canvasType);
    const useArtifactPath =
      def?.materializable &&
      (canvasType === "flashcards" || isMaterializedArtifactId(artifactId));

    if (useArtifactPath) {
      void openArtifact({
        canvasType,
        title: artifactTitle,
        content: rawPayload,
        messageId,
        artifactId: isMaterializedArtifactId(artifactId)
          ? artifactId
          : undefined,
        artifactIndex: artifactIndex > 0 ? artifactIndex : 1,
      });
      return;
    }

    open({
      type: canvasType,
      data: canvasData,
      metadata: {
        title: artifactTitle,
        sourceMessageId: messageId,
        sourceTaskId: dedupKey,
        canvasItemId: isMaterializedArtifactId(artifactId)
          ? artifactId
          : undefined,
      },
    });
  };

  /** Render the actual content using the correct component for this type. */
  const renderContent = () => {
    // Mermaid renders progressively during streaming (last-good-render
    // semantics live inside the renderer) — never fall back to a markdown
    // preview for it. Routed through the unified renderer (MermaidBlock).
    if (canvasType === "mermaid" && hasArtifactRenderer("mermaid")) {
      return (
        <ArtifactRender
          canvasType="mermaid"
          mode="artifact"
          raw={content}
          serverData={serverData}
          metadata={metadata as Record<string, unknown> | undefined}
          artifactId={serverData?.artifactId ?? metadata?.artifactId}
          isStreamActive={isStreamActive}
          taskId={taskId}
          messageId={messageId}
          conversationId={conversationId}
        />
      );
    }

    // Still streaming — show progressive markdown preview
    if (!isComplete && isStreamActive) {
      return (
        <div className="p-3 text-sm">
          <BasicMarkdownContent imagePolicy="inherit"
            content={content}
            isStreamActive={isStreamActive}
          />
        </div>
      );
    }

    // ── Unified artifact renderer (Wave B) ───────────────────────────
    // Types with a unified renderer registered render through the single
    // shared path; the rest fall through to the legacy switch below.
    if (hasArtifactRenderer(canvasType)) {
      return (
        <ArtifactRender
          canvasType={canvasType}
          mode="artifact"
          raw={content}
          serverData={serverData ?? structuredServerData ?? undefined}
          metadata={metadata as Record<string, unknown> | undefined}
          artifactId={artifactId}
          messageId={messageId}
          conversationId={conversationId}
          taskId={dedupKey}
          isStreamActive={isStreamActive}
        />
      );
    }

    // All unified types (iframe, html, code, image, flashcards, timeline,
    // research, resources, progress/progress_tracker, troubleshooting,
    // recipe/cooking_recipe, quiz, presentation, mermaid, diagram,
    // decision_tree/decision-tree, math_problem) are handled by the
    // hasArtifactRenderer early-branch above (Wave F removal).
    // Fallback: render as markdown for any unregistered type.
    return (
      <div className="p-3 text-sm">
        <BasicMarkdownContent imagePolicy="inherit"
          content={content}
          isStreamActive={isStreamActive}
        />
      </div>
    );
  };

  // A finished html page carries ONE header — the page preview's own (title,
  // Code, Copy, Download, Open in canvas). This block hands it its title,
  // its extra actions and its canvas opener instead of stacking a label row
  // on top of it.
  // (An `html` artifact whose body is a `{"__kind": …}` value is not a page —
  // HtmlArtifact sends it to the kind front door — so it keeps this block's row.)
  if (canvasType === "html" && isComplete && !/^\s*\{\s*"__kind"\s*:/.test(content)) {
    return (
      <HtmlPreviewChromeProvider
        value={{
          title: artifactTitle,
          openInCanvas: isCanvasAvailable ? handleOpenCanvas : undefined,
          canvasOpen: canvasToggle.isVisible,
          actions: (
            <>
              {isMaterializedArtifactId(artifactId) && (
                <ArtifactVersionHistory
                  canvasItemId={artifactId}
                  triggerClassName="rounded p-0.5 text-muted-foreground hover:text-foreground"
                />
              )}
              {canUnbind && (
                <Button variant="quiet" icon={<Unlink />} onClick={() => void handleUnbind()} disabled={unbindBusy} title="Detach as text" aria-label="Detach as text" />
              )}
            </>
          ),
          menuItems: [
            ...(isMaterializedArtifactId(artifactId)
              ? [{
                  key: "versions",
                  label: "Version history",
                  icon: <History />,
                  // After the menu has closed and handed focus back, or its close takes the popover with it.
                  onSelect: () => window.setTimeout(() => setHistoryFromMenu(true), 0),
                }]
              : []),
            ...(canUnbind
              ? [{ key: "detach", label: "Detach as text", icon: <Unlink />, onSelect: () => void handleUnbind(), disabled: unbindBusy }]
              : []),
          ],
          menuAnchors: isMaterializedArtifactId(artifactId) ? (
            <ArtifactVersionHistory
              canvasItemId={artifactId}
              anchorOnly
              open={historyFromMenu}
              onOpenChange={setHistoryFromMenu}
            />
          ) : null,
        }}
      >
        <div className="relative my-2" data-artifact-type="html">
          {renderContent()}
        </div>
      </HtmlPreviewChromeProvider>
    );
  }

  return (
    <div className="group/artifact relative my-2">
      {/* Whisper-quiet affordance row: a muted label + a hover-reveal
                "open in canvas" icon. No background, no border, no x-padding — the
                artifact blends into the message and uses the full content width
                (the content provides its own structure). */}
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {showTitleLabel && (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {artifactTitle}
            </span>
          )}
          {!isComplete && isStreamActive && (
            <span className="shrink-0 animate-pulse text-xs text-muted-foreground">
              streaming…
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isMaterializedArtifactId(artifactId) && (
            <ArtifactVersionHistory
              canvasItemId={artifactId}
              triggerClassName="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/artifact:opacity-100 data-[state=open]:opacity-100"
            />
          )}
          {canUnbind && (
            <Button variant="quiet" icon={<Unlink />} onClick={() => void handleUnbind()} disabled={unbindBusy} title="Detach as text" aria-label="Detach as text" className="opacity-0 focus-visible:opacity-100 group-hover/artifact:opacity-100" />
          )}
          {isComplete && content.trim() !== "" && (
            <Button variant="quiet" icon={<Copy />} onClick={handleCopyMarkdown} title="Copy as Markdown" aria-label="Copy as Markdown" className="opacity-0 focus-visible:opacity-100 group-hover/artifact:opacity-100" />
          )}
          {isCanvasAvailable && (
            <button
              type="button"
              onClick={handleOpenCanvas}
              aria-pressed={canvasToggle.isVisible}
              className={cn(
                "rounded p-0.5 transition-opacity focus-visible:opacity-100 group-hover/artifact:opacity-100",
                canvasToggle.isVisible
                  ? "bg-accent text-foreground opacity-100"
                  : "text-muted-foreground opacity-0 hover:text-foreground",
              )}
              title="Open in canvas"
              aria-label="Open in canvas"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content — routes to the real renderer by type. Full width, no chrome. */}
      <div className="overflow-hidden">{renderContent()}</div>
    </div>
  );
};

/** Fallback: render markdown preview while parser is loading */
const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => (
  <div className="p-3 text-sm">
    <BasicMarkdownContent imagePolicy="inherit" content={content} />
  </div>
);

/** Fallback: render JSON as syntax-highlighted code */
const JsonFallback: React.FC<{ content: string }> = ({ content }) => (
  <Suspense fallback={<MatrxMiniLoader />}>
    <CodeBlock showSource code={content} language="json" fontSize={14} />
  </Suspense>
);

export default ArtifactBlock;
