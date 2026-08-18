import { useEffect, useState } from "react";
import { CheckCircle, ChevronDown, ChevronUp, Loader2, AlertCircle, ExternalLink, BookOpen } from 'lucide-react';
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";
import InlineMarkdownRenderer from "@/components/mardown-display/markdown-classification/custom-views/common/InlineMarkdownRenderer";

// Define interfaces based on provided structure
export interface ContentItem {
    id: number;
    title: string;
    text: string | string[];
}

export interface ContentSection {
    title: string;
    text: string;
}

export interface OutputContent {
    intro: ContentSection;
    items: ContentItem[];
    outro: ContentSection;
    hasNestedLists: boolean;
}

interface KeyPointsDisplayProps {
    data: OutputContent;
    isLoading?: boolean;
}

const KeyPointsNestedListDisplay = ({ data }: KeyPointsDisplayProps) => {
    const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
    const [activeItem, setActiveItem] = useState<number | null>(null);

    // Function to toggle expansion of items with array content
    const toggleExpand = (id: number) => {
        setExpandedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    // Function to set active item (highlight effect)
    const toggleActiveItem = (id: number) => {
        setActiveItem(activeItem === id ? null : id);
    };

    return (
        <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
            {/* Header */}
            <div className="px-8 py-10 bg-gradient-to-r from-blue-500/90 via-indigo-500/90 to-violet-500/90 text-white">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <BookOpen size={28} className="text-amber-300" />
                    {data?.intro?.title || "Key Points"}
                </h1>
                <p className="mt-3 text-lg font-light opacity-90">
                    <InlineMarkdownRenderer text={data?.intro?.text || ""} className="text-white/90" />
                </p>
            </div>

            {/* Content Items */}
            <div className="p-6 md:p-8 space-y-6">
                {data?.items?.length > 0 ? (
                    data?.items?.map((item) => {
                        const isArray = Array.isArray(item.text);
                        const isExpanded = expandedItems[item.id] || false;
                        const isActive = activeItem === item.id;

                        return (
                            <div
                                key={item.id}
                                className={`bg-slate-50 dark:bg-slate-800/50 hover:shadow-md transition-all duration-200 ${
                                    isActive
                                        ? "border-2 border-indigo-300 dark:border-indigo-700 rounded-3xl shadow-xl"
                                        : "border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm"
                                } overflow-hidden`}
                            >
                                <div className="p-6 md:p-7">
                                    <div
                                        className="flex items-start gap-4 cursor-pointer"
                                        onClick={() => toggleActiveItem(item.id)}
                                    >
                                        <div className="flex-none">
                                            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                                                isActive 
                                                    ? "bg-indigo-500 text-white" 
                                                    : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                                            }`}>
                                                <span className="font-semibold">{item.id}</span>
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <h2 className={`text-xl font-bold ${
                                                isActive
                                                    ? "text-indigo-600 dark:text-indigo-400"
                                                    : "text-slate-700 dark:text-slate-300"
                                            }`}>
                                                <InlineMarkdownRenderer text={item.title} />
                                            </h2>
                                            <div className="mt-2">
                                                {isArray ? (
                                                    <div className="space-y-3">
                                                        <p className="text-slate-600 dark:text-slate-400">
                                                            <InlineMarkdownRenderer text={item.text[0]} />
                                                        </p>
                                                        {item?.text?.length > 1 && (
                                                            <>
                                                                <div className={`space-y-2 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800 ${
                                                                    isExpanded ? "" : "hidden"
                                                                }`}>
                                                                    {Array.isArray(item.text) && item.text.slice(1).map((point, idx) => (
                                                                        <div key={idx} className="flex items-start gap-2">
                                                                            <CheckCircle size={16} className="mt-1 flex-shrink-0 text-indigo-500 dark:text-indigo-400" />
                                                                            <p className="text-slate-600 dark:text-slate-400">
                                                                                <InlineMarkdownRenderer text={point} />
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleExpand(item.id);
                                                                    }}
                                                                    className="flex items-center gap-1 text-sm font-medium text-indigo-500 dark:text-indigo-400 "
                                                                >
                                                                    {isExpanded ? (
                                                                        <>
                                                                            Show less <ChevronUp size={16} />
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            Show {item.text.length - 1} more points <ChevronDown size={16} />
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-slate-600 dark:text-slate-400">
                                                        <InlineMarkdownRenderer text={item.text as string} />
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-10">
                        <p className="text-slate-500 dark:text-slate-400">No items available</p>
                    </div>
                )}
            </div>

            {/* Outro Section */}
            {data.outro && (data.outro.title || data.outro.text) && (
                <div className="px-8 py-6 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                    <div className="max-w-3xl mx-auto">
                        {data?.outro?.title && (
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                                <InlineMarkdownRenderer text={data?.outro?.title} />
                            </h3>
                        )}
                        {data?.outro?.text && (
                            <p className="mt-2 text-slate-600 dark:text-slate-400">
                                <InlineMarkdownRenderer text={data?.outro?.text} />
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
                <p>{data?.items?.length || 0} Key Points • Focus on these for best results</p>
            </div>
        </div>
    );
};

export const KeyPointsLoading = () => {
    const [loadingStage, setLoadingStage] = useState(0);
    const [loadingProgress, setLoadingProgress] = useState(0);

    // Simulate multi-stage loading process
    useEffect(() => {
        const timer = setTimeout(() => {
            if (loadingStage < 3) {
                setLoadingStage(prev => prev + 1);
            }
        }, 3000); // Switch stages every 3 seconds
    
        return () => clearTimeout(timer);
    }, [loadingStage]);

    // Simulate progress percentage
    useEffect(() => {
        const interval = setInterval(() => {
            setLoadingProgress(prev => {
                const newProgress = prev + Math.random() * 5;
                return newProgress > 100 ? 100 : newProgress;
            });
        }, 300);
    
        return () => clearInterval(interval);
    }, []);

    // Loading stage labels
    const loadingStages = [
        "Analyzing content...",
        "Extracting key points...",
        "Organizing information...",
        "Finalizing content structure..."
    ];

    // Placeholder items for skeleton UI
    const placeholderItems = [
        { id: 1 },
        { id: 2 },
        { id: 3 }
    ];

    return (
        <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
            {/* Header with shimmer effect */}
            <div className="px-8 py-10 bg-gradient-to-r from-blue-500/90 via-indigo-500/90 to-violet-500/90 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer-animation"></div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <BookOpen size={28} className="text-amber-300 animate-pulse" />
                    Key Points
                </h1>
                <p className="mt-3 text-lg font-light opacity-90">
                    {loadingStages[loadingStage]}
                </p>
                {/* Progress bar */}
                <div className="mt-6 h-2 bg-white/30 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-amber-300 transition-all duration-300 ease-out"
                        style={{ width: `${loadingProgress}%` }}
                    ></div>
                </div>
                <p className="mt-2 text-sm font-light opacity-80 text-right">
                    {Math.round(loadingProgress)}% complete
                </p>
            </div>

            {/* Content Items with skeleton loading */}
            <div className="p-6 md:p-8 space-y-6">
                {placeholderItems.map((item) => (
                    <div 
                        key={item.id} 
                        className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden animate-pulse-subtle"
                        style={{ animationDelay: `${item.id * 200}ms` }}
                    >
                        <div className="p-6 md:p-7">
                            <div className="flex items-start gap-4">
                                <div className="flex-none">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 loading-shine"></div>
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/5 loading-shine"></div>
                                    
                                    {/* Animated loading lines for text */}
                                    {[...Array(3)].map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="h-4 bg-slate-200 dark:bg-slate-700 rounded loading-shine"
                                            style={{ 
                                                width: `${95 - (i * 15)}%`, 
                                                animationDelay: `${i * 150}ms` 
                                            }}
                                        ></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Skeleton Outro */}
            <div className="px-8 py-6 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                <div className="max-w-3xl mx-auto space-y-3">
                    <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 loading-shine"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full loading-shine"></div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <p>Loading content...</p>
                </div>
            </div>
        </div>
    );
};

// Combined and deduplicated styles
const styles = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.shimmer-animation {
  animation: shimmer 2s infinite linear;
}
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.loading-shine {
  position: relative;
  overflow: hidden;
}
.loading-shine::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.2) 20%,
    rgba(255, 255, 255, 0.5) 60%,
    rgba(255, 255, 255, 0)
  );
  animation: shimmer 2s infinite;
}
.dark .loading-shine::after {
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0)
  );
}
`;

export default function KeyPointsNestedListView({ data, isLoading = false }: KeyPointsDisplayProps) {
    const isMobile = useIsMobile();
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (isMobile) {
            console.log("This view adjusts for mobile with responsive design");
        }
    }, [isMobile]);

    useEffect(() => {
        setHasError(false);
    }, [data]);

    if (isLoading) {
        return <KeyPointsLoading />;
    }

    try {
        if (!data || hasError) {
            return <DefaultErrorFallback
                title="Key Points Error"
                message="There was an error displaying the key points content."
            />;
        }

        // Check for nested lists to enable special rendering if needed
        const hasNestedLists = data.items?.some(item => Array.isArray(item.text) && item.text.length > 1);
        const processedData = {
            ...data,
            hasNestedLists
        };

        return <KeyPointsNestedListDisplay data={processedData} isLoading={isLoading} />;
    } catch (error) {
        console.error("Error rendering KeyPointsDisplay:", error);
        setHasError(true);
        return <DefaultErrorFallback
            title="Key Points Error"
            message="There was an error displaying the key points content."
        />;
    }
}