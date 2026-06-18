"use client";

import React, { Suspense, lazy, useMemo } from "react";
import { Layers, Maximize2 } from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCanvasIsAvailable } from "@/features/canvas/redux/canvasSlice";
import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";
import { resolveCanvasType } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
    ArtifactRender,
    hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import BasicMarkdownContent from "../../chat-markdown/BasicMarkdownContent";
import { safeJsonParse } from "../../chat-markdown/block-registry/json-parse-utils";
// Lazy load block renderers — only the ones that accept raw content strings
const CodeBlock = lazy(() => import("@/features/code-editor/components/code-block/CodeBlock"));

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
    isStreamActive?: boolean;
    messageId?: string;
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
    isStreamActive,
    messageId,
    taskId,
}) => {
    const { open } = useCanvas();
    const isCanvasAvailable = useAppSelector(selectCanvasIsAvailable);

    const artifactTitle = serverData?.title || metadata?.artifactTitle || "Artifact";
    const artifactType = serverData?.artifactType || metadata?.artifactType || "text";
    const artifactIndex = serverData?.artifactIndex ?? metadata?.artifactIndex ?? 0;
    const artifactId = serverData?.artifactId || metadata?.artifactId || `artifact-${artifactIndex}`;
    const isComplete = metadata?.isComplete !== false;

    const canvasType: CanvasContentType =
        resolveCanvasType("artifact", artifactType) || "html";
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

    const handleOpenCanvas = () => {
        open({
            type: canvasType,
            data: canvasData,
            metadata: {
                title: artifactTitle,
                sourceMessageId: messageId,
                sourceTaskId: dedupKey,
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
                />
            );
        }

        // Still streaming — show progressive markdown preview
        if (!isComplete && isStreamActive) {
            return (
                <div className="p-3 text-sm">
                    <BasicMarkdownContent content={content} isStreamActive={isStreamActive} />
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
                    serverData={serverData}
                    metadata={metadata as Record<string, unknown> | undefined}
                    artifactId={artifactId}
                    messageId={messageId}
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
                <BasicMarkdownContent content={content} isStreamActive={isStreamActive} />
            </div>
        );
    };

    return (
        <div className="my-3 rounded-lg border border-border bg-card overflow-hidden">
            {/* Artifact header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">
                        {artifactTitle}
                    </span>
                    {!isComplete && isStreamActive && (
                        <span className="text-xs text-muted-foreground animate-pulse shrink-0">
                            streaming...
                        </span>
                    )}
                </div>
                {isCanvasAvailable && (
                    <button
                        onClick={handleOpenCanvas}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors shrink-0"
                        title="Open in canvas panel"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                        <span>Canvas</span>
                    </button>
                )}
            </div>

            {/* Content — routes to real renderer by type */}
            <div className="overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};

/** Fallback: render markdown preview while parser is loading */
const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => (
    <div className="p-3 text-sm">
        <BasicMarkdownContent content={content} />
    </div>
);

/** Fallback: render JSON as syntax-highlighted code */
const JsonFallback: React.FC<{ content: string }> = ({ content }) => (
    <Suspense fallback={<MatrxMiniLoader />}>
        <CodeBlock code={content} language="json" fontSize={14} />
    </Suspense>
);

export default ArtifactBlock;
