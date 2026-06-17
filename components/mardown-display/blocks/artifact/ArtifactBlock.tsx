"use client";

import React, { Suspense, lazy, useMemo } from "react";
import { Layers, Maximize2 } from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCanvasIsAvailable } from "@/features/canvas/redux/canvasSlice";
import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import BasicMarkdownContent from "../../chat-markdown/BasicMarkdownContent";
import { safeJsonParse } from "../../chat-markdown/block-registry/json-parse-utils";
import { InlineMediaRef } from "@/features/files";
import SandboxedHtml from "../common/SandboxedHtml";

// Lazy load block renderers — only the ones that accept raw content strings
const CodeBlock = lazy(() => import("@/features/code-editor/components/code-block/CodeBlock"));
const FlashcardsBlock = lazy(() => import("../flashcards/FlashcardsBlock"));
const MermaidView = lazy(() =>
    import("@/components/mermaid/MermaidView").then((m) => ({ default: m.MermaidView })),
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
    isStreamActive?: boolean;
    messageId?: string;
    taskId?: string;
}

/** Maps artifact type string to CanvasContentType. */
const ARTIFACT_TO_CANVAS_TYPE: Record<string, CanvasContentType> = {
    iframe: "iframe",
    html: "html",
    code: "code",
    diagram: "diagram",
    flashcards: "flashcards",
    quiz: "quiz",
    presentation: "presentation",
    timeline: "timeline",
    research: "research",
    comparison: "comparison",
    image: "image",
    troubleshooting: "troubleshooting",
    "decision-tree": "decision-tree",
    decision_tree: "decision-tree",
    recipe: "recipe",
    cooking_recipe: "recipe",
    resources: "resources",
    progress: "progress",
    progress_tracker: "progress",
    math_problem: "math_problem",
    mermaid: "mermaid",
};

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

    const canvasType = ARTIFACT_TO_CANVAS_TYPE[artifactType] || "html";
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
        // preview for it.
        if (artifactType === "mermaid") {
            return (
                <Suspense fallback={<MatrxMiniLoader />}>
                    <MermaidView
                        source={content}
                        isStreamActive={!isComplete && isStreamActive}
                        viewportMaxHeight={560}
                    />
                </Suspense>
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

        switch (artifactType) {
            // ---- Direct rendering types (no parsing needed) ----

            case "iframe":
                // allow-scripts WITHOUT allow-same-origin: interactive app
                // artifacts run in a unique opaque origin and cannot reach the
                // parent (aimatrx.com) origin. Combining the two would let the
                // framed content remove its own sandbox = XSS in shared/forked
                // conversations.
                return (
                    <iframe
                        srcDoc={content}
                        className="w-full border-0"
                        style={{ minHeight: "300px", height: "400px" }}
                        title={artifactTitle}
                        sandbox="allow-scripts allow-forms"
                    />
                );

            case "html":
                // Model/user-authored HTML → fully sandboxed iframe, never
                // dangerouslySetInnerHTML (conversations can be shared/forked,
                // making this cross-user stored XSS).
                return (
                    <SandboxedHtml html={content} title={artifactTitle} height={400} />
                );

            case "code":
                return (
                    <Suspense fallback={<MatrxMiniLoader />}>
                        <CodeBlock code={content} language="text" fontSize={14} className="my-0" isStreamActive={isStreamActive} />
                    </Suspense>
                );

            case "image":
                return (
                    <div className="flex items-center justify-center p-4 bg-muted/30">
                        <InlineMediaRef
                            ref={content}
                            alt={artifactTitle}
                            size="fill"
                            fit="contain"
                            rounded="md"
                            className="max-w-full max-h-[400px]"
                        />
                    </div>
                );

            // ---- FlashcardsBlock accepts raw content string ----

            case "flashcards":
                return (
                    <Suspense fallback={<MatrxMiniLoader />}>
                        <FlashcardsBlock content={content} taskId={dedupKey} />
                    </Suspense>
                );

            // ---- Types that need markdown parsing ----
            // Use the same React.lazy(async () => { import parser; parse; return component }) pattern
            // that BlockRenderer uses. This avoids loading parsers until needed.

            case "timeline": {
                const TimelineWithParser = React.lazy(async () => {
                    const { parseTimelineMarkdown } = await import("../timeline/parseTimelineMarkdown");
                    const { default: TimelineBlock } = await import("../timeline/TimelineBlock");
                    const data = parseTimelineMarkdown(content);
                    if (!data) throw new Error("Failed to parse timeline");
                    return { default: () => <TimelineBlock timeline={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><TimelineWithParser /></Suspense>;
            }

            case "research": {
                const ResearchWithParser = React.lazy(async () => {
                    const { parseResearchMarkdown } = await import("../research/parseResearchMarkdown");
                    const { default: ResearchBlock } = await import("../research/ResearchBlock");
                    const data = parseResearchMarkdown(content);
                    if (!data) throw new Error("Failed to parse research");
                    return { default: () => <ResearchBlock research={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><ResearchWithParser /></Suspense>;
            }

            case "resources": {
                const ResourcesWithParser = React.lazy(async () => {
                    const { parseResourcesMarkdown } = await import("../resources/parseResourcesMarkdown");
                    const { default: ResourceCollectionBlock } = await import("../resources/ResourceCollectionBlock");
                    const data = parseResourcesMarkdown(content);
                    if (!data) throw new Error("Failed to parse resources");
                    return { default: () => <ResourceCollectionBlock collection={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><ResourcesWithParser /></Suspense>;
            }

            case "progress":
            case "progress_tracker": {
                const ProgressWithParser = React.lazy(async () => {
                    const { parseProgressMarkdown } = await import("../progress/parseProgressMarkdown");
                    const { default: ProgressTrackerBlock } = await import("../progress/ProgressTrackerBlock");
                    const data = parseProgressMarkdown(content);
                    if (!data) throw new Error("Failed to parse progress");
                    return { default: () => <ProgressTrackerBlock tracker={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><ProgressWithParser /></Suspense>;
            }

            case "troubleshooting": {
                const TroubleshootingWithParser = React.lazy(async () => {
                    const { parseTroubleshootingMarkdown } = await import("../troubleshooting/parseTroubleshootingMarkdown");
                    const { default: TroubleshootingBlock } = await import("../troubleshooting/TroubleshootingBlock");
                    const data = parseTroubleshootingMarkdown(content);
                    if (!data) throw new Error("Failed to parse troubleshooting");
                    return { default: () => <TroubleshootingBlock troubleshooting={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><TroubleshootingWithParser /></Suspense>;
            }

            case "recipe":
            case "cooking_recipe": {
                const RecipeWithParser = React.lazy(async () => {
                    const { parseRecipeMarkdown } = await import("../cooking-recipes/parseRecipeMarkdown");
                    const { default: RecipeViewer } = await import("../cooking-recipes/cookingRecipeDisplay");
                    const data = parseRecipeMarkdown(content);
                    if (!data) throw new Error("Failed to parse recipe");
                    return { default: () => <RecipeViewer recipe={data} taskId={dedupKey} /> };
                });
                return <Suspense fallback={<MarkdownPreview content={content} />}><RecipeWithParser /></Suspense>;
            }

            // ---- Types that need JSON parsing ----

            case "quiz": {
                const quizData = safeJsonParse(content) as any;
                if (quizData) {
                    const normalised = quizData.quizTitle
                        ? quizData
                        : quizData.quiz_title
                            ? { quizTitle: quizData.quiz_title, category: quizData.category, multipleChoice: quizData.multiple_choice }
                            : null;
                    if (normalised?.quizTitle && Array.isArray(normalised.multipleChoice)) {
                        const QuizWithData = React.lazy(async () => {
                            const { default: MultipleChoiceQuiz } = await import("../quiz/MultipleChoiceQuiz");
                            return { default: () => <MultipleChoiceQuiz quizData={normalised} taskId={dedupKey} /> };
                        });
                        return <Suspense fallback={<MatrxMiniLoader />}><QuizWithData /></Suspense>;
                    }
                }
                return <JsonFallback content={content} />;
            }

            case "presentation": {
                const presData = safeJsonParse(content) as any;
                const slides = presData?.presentation?.slides || presData?.slides;
                if (slides && Array.isArray(slides)) {
                    const theme = presData?.presentation?.theme || presData?.theme;
                    const SlideshowWithData = React.lazy(async () => {
                        const { default: Slideshow } = await import("../presentations/Slideshow");
                        return { default: () => <Slideshow slides={slides} taskId={dedupKey} theme={theme} /> };
                    });
                    return <Suspense fallback={<MatrxMiniLoader />}><SlideshowWithData /></Suspense>;
                }
                return <JsonFallback content={content} />;
            }

            case "mermaid": {
                // Render a materialized mermaid artifact (artifact_ref → here)
                // through the SAME MermaidBlock used in chat, so a reloaded
                // diagram looks identical and isn't lost.
                const MermaidArtifact = React.lazy(
                    () => import("../mermaid/MermaidBlock"),
                );
                return (
                    <Suspense fallback={<MatrxMiniLoader />}>
                        <MermaidArtifact
                            content={content}
                            taskId={dedupKey}
                            artifactId={serverData?.artifactId ?? metadata?.artifactId}
                        />
                    </Suspense>
                );
            }

            case "diagram": {
                const diagramData = safeJsonParse(content) as any;
                if (diagramData?.diagram) {
                    const DiagramWithData = React.lazy(async () => {
                        const { parseDiagramJSON } = await import("../diagram/parseDiagramJSON");
                        const { default: InteractiveDiagramBlock } = await import("../diagram/InteractiveDiagramBlock");
                        const parsed = parseDiagramJSON(JSON.stringify(diagramData));
                        if (!parsed) throw new Error("Failed to parse diagram");
                        return { default: () => <InteractiveDiagramBlock diagram={parsed} taskId={dedupKey} /> };
                    });
                    return <Suspense fallback={<MatrxMiniLoader />}><DiagramWithData /></Suspense>;
                }
                return <JsonFallback content={content} />;
            }

            case "comparison": {
                const compData = safeJsonParse(content) as any;
                if (compData?.comparison) {
                    const ComparisonWithData = React.lazy(async () => {
                        const { parseComparisonJSON } = await import("../comparison/parseComparisonJSON");
                        const { default: ComparisonTableBlock } = await import("../comparison/ComparisonTableBlock");
                        const parsed = parseComparisonJSON(JSON.stringify(compData));
                        if (!parsed) throw new Error("Failed to parse comparison");
                        return { default: () => <ComparisonTableBlock comparison={parsed} taskId={dedupKey} /> };
                    });
                    return <Suspense fallback={<MatrxMiniLoader />}><ComparisonWithData /></Suspense>;
                }
                return <JsonFallback content={content} />;
            }

            case "decision_tree":
            case "decision-tree": {
                const treeData = safeJsonParse(content) as any;
                if (treeData?.decision_tree) {
                    const TreeWithData = React.lazy(async () => {
                        const { parseDecisionTreeJSON } = await import("../decision-tree/parseDecisionTreeJSON");
                        const { default: DecisionTreeBlock } = await import("../decision-tree/DecisionTreeBlock");
                        const parsed = parseDecisionTreeJSON(JSON.stringify(treeData));
                        if (!parsed) throw new Error("Failed to parse decision tree");
                        return { default: () => <DecisionTreeBlock decisionTree={parsed} taskId={dedupKey} /> };
                    });
                    return <Suspense fallback={<MatrxMiniLoader />}><TreeWithData /></Suspense>;
                }
                return <JsonFallback content={content} />;
            }

            case "math_problem": {
                const mathData = safeJsonParse(content) as any;
                if (mathData?.math_problem) {
                    const MathWithData = React.lazy(async () => {
                        const { default: MathProblemBlock } = await import("../math/MathProblemBlock");
                        return { default: () => <MathProblemBlock problemData={mathData} /> };
                    });
                    return <Suspense fallback={<MatrxMiniLoader />}><MathWithData /></Suspense>;
                }
                return <JsonFallback content={content} />;
            }

            // ---- Fallback: render as markdown ----
            default:
                return (
                    <div className="p-3 text-sm">
                        <BasicMarkdownContent content={content} isStreamActive={isStreamActive} />
                    </div>
                );
        }
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
