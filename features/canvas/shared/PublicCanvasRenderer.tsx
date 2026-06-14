'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { CanvasContent } from '@/features/canvas/redux/canvasSlice';
import SandboxedHtml from '@/components/mardown-display/blocks/common/SandboxedHtml';

/** Only http(s) embeds are allowed for iframe `src` — blocks javascript:/data: URIs. */
function safeEmbedUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const u = new URL(value, 'https://invalid.local');
        return u.protocol === 'http:' || u.protocol === 'https:' ? value : null;
    } catch {
        return null;
    }
}

// next/dynamic with ssr:false — blocks are excluded from SSR module analysis.
// None are needed until the canvas content type is determined on the client.
const MultipleChoiceQuiz = dynamic(() => import('@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz'), { ssr: false });
const Slideshow = dynamic(() => import('@/components/mardown-display/blocks/presentations/Slideshow'), { ssr: false });
const RecipeViewer = dynamic(() => import('@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay'), { ssr: false });
const TimelineBlock = dynamic(() => import('@/components/mardown-display/blocks/timeline/TimelineBlock'), { ssr: false });
const ResearchBlock = dynamic(() => import('@/components/mardown-display/blocks/research/ResearchBlock'), { ssr: false });
const ResourceCollectionBlock = dynamic(() => import('@/components/mardown-display/blocks/resources/ResourceCollectionBlock'), { ssr: false });
const ProgressTrackerBlock = dynamic(() => import('@/components/mardown-display/blocks/progress/ProgressTrackerBlock'), { ssr: false });
const ComparisonTableBlock = dynamic(() => import('@/components/mardown-display/blocks/comparison/ComparisonTableBlock'), { ssr: false });
const TroubleshootingBlock = dynamic(() => import('@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock'), { ssr: false });
const DecisionTreeBlock = dynamic(() => import('@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock'), { ssr: false });
const InteractiveDiagramBlock = dynamic(() => import('@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock'), { ssr: false });
const StandaloneMermaidView = dynamic(() => import('@/components/mermaid/MermaidView').then((m) => ({ default: m.StandaloneMermaidView })), { ssr: false });
const FlashcardsBlock = dynamic(() => import('@/components/mardown-display/blocks/flashcards/FlashcardsBlock'), { ssr: false });
const CodeBlock = dynamic(() => import('@/features/code-editor/components/code-block/CodeBlock'), { ssr: false });

interface PublicCanvasRendererProps {
    content: CanvasContent | any;
}

/**
 * Public Canvas Renderer
 *
 * Simplified renderer for public shared canvases.
 * No Redux dependencies - works standalone.
 */
export function PublicCanvasRenderer({ content }: PublicCanvasRendererProps) {
    if (!content) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
                <p className="text-sm">No content to display</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-auto">
            {renderContent(content)}
        </div>
    );
}

/**
 * Renders the appropriate component based on content type
 */
function renderContent(content: CanvasContent | any): React.ReactNode {
    const { type, data } = content;

    switch (type) {
        case 'quiz':
            return (
                <div className="h-full p-4">
                    <MultipleChoiceQuiz quizData={data} />
                </div>
            );

        case 'presentation':
            return (
                <div className="h-full">
                    <Slideshow
                        slides={data.slides || data}
                        theme={data.theme || {
                            primaryColor: '#2563eb',
                            secondaryColor: '#1e40af',
                        }}
                    />
                </div>
            );

        case 'recipe':
            return (
                <div className="h-full p-4">
                    <RecipeViewer recipe={data} />
                </div>
            );

        case 'timeline':
            return (
                <div className="h-full p-4">
                    <TimelineBlock timeline={data} />
                </div>
            );

        case 'research':
            return (
                <div className="h-full p-4">
                    <ResearchBlock research={data} />
                </div>
            );

        case 'resources':
            return (
                <div className="h-full p-4">
                    <ResourceCollectionBlock collection={data} />
                </div>
            );

        case 'progress':
            return (
                <div className="h-full p-4">
                    <ProgressTrackerBlock tracker={data} />
                </div>
            );

        case 'comparison':
            return (
                <div className="h-full p-4">
                    <ComparisonTableBlock comparison={data} />
                </div>
            );

        case 'troubleshooting':
            return (
                <div className="h-full p-4">
                    <TroubleshootingBlock troubleshooting={data} />
                </div>
            );

        case 'decision-tree':
            return (
                <div className="h-full p-4">
                    <DecisionTreeBlock decisionTree={data} />
                </div>
            );

        case 'diagram':
            return (
                <div className="h-full p-4">
                    <InteractiveDiagramBlock diagram={data} />
                </div>
            );

        case 'mermaid':
            return (
                <div className="h-full p-4">
                    <StandaloneMermaidView
                        source={typeof data === 'string' ? data : String(data?.data ?? '')}
                        metadata={content.metadata?.mermaid as Record<string, unknown> | undefined}
                        fillHeight
                    />
                </div>
            );

        case 'flashcards':
            return (
                <div className="h-full p-4">
                    <FlashcardsBlock content={data} />
                </div>
            );

        case 'code':
            return (
                <div className="h-full p-4">
                    <CodeBlock
                        code={data.code || data}
                        language={data.language || 'javascript'}
                    />
                </div>
            );

        case 'iframe': {
            // Public page: never grant allow-same-origin to author-supplied
            // embeds (it would give the framed page access to aimatrx.com).
            // Restrict to http(s) URLs to block javascript:/data: payloads.
            const src = safeEmbedUrl(data?.url ?? data);
            if (!src) {
                return (
                    <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 p-4 text-sm">
                        This embed URL is not allowed.
                    </div>
                );
            }
            return (
                <iframe
                    src={src}
                    className="w-full h-full border-0"
                    title={content.metadata?.title || 'Canvas Content'}
                    sandbox="allow-scripts allow-popups allow-forms"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
            );
        }

        case 'html':
            // Author-supplied HTML on a PUBLIC page → fully sandboxed iframe,
            // never dangerouslySetInnerHTML (stored XSS).
            return (
                <SandboxedHtml
                    html={data?.html || data}
                    title={content.metadata?.title || 'Canvas Content'}
                    height="100%"
                    className="w-full h-full"
                />
            );

        case 'image':
            return (
                <div className="h-full flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
                    <img
                        src={data.url || data}
                        alt={content.metadata?.title || 'Canvas Image'}
                        className="max-w-full max-h-full object-contain"
                    />
                </div>
            );

        default: {
            // Try to render as iframe if it looks like a safe http(s) URL
            const maybeUrl = safeEmbedUrl(data);
            if (maybeUrl) {
                return (
                    <iframe
                        src={maybeUrl}
                        className="w-full h-full border-0"
                        title={content.metadata?.title || 'Canvas Content'}
                        sandbox="allow-scripts allow-popups allow-forms"
                    />
                );
            }

            // Try to render as HTML if it contains HTML tags — sandboxed (no XSS)
            if (typeof data === 'string' && (data.includes('<') || data.includes('>'))) {
                return (
                    <SandboxedHtml
                        html={data}
                        title={content.metadata?.title || 'Canvas Content'}
                        height="100%"
                        className="w-full h-full"
                    />
                );
            }

            return (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 p-4">
                    <div className="text-center max-w-lg">
                        <p className="text-lg mb-2">
                            Unsupported content type: <code className="text-red-500">{type}</code>
                        </p>
                        <p className="text-sm mb-4">This content type is not yet supported in public view</p>
                        <details className="text-left bg-gray-100 dark:bg-gray-800 p-4 rounded">
                            <summary className="cursor-pointer font-semibold mb-2">Debug Info</summary>
                            <pre className="text-xs overflow-auto">
                                {JSON.stringify({ type, dataType: typeof data, data }, null, 2)}
                            </pre>
                        </details>
                    </div>
                </div>
            );
        }
    }
}
