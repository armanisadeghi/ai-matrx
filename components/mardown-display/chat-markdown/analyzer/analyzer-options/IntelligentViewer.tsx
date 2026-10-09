import { Button, Badge, Chip, Tile } from "@ai-matrx/design-system/controls";
import React, { useState } from "react";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { AlertTriangle, Lightbulb, Eye, FileJson, Copy, Check } from "lucide-react";
import {
    JsonFallback,
    getSectionTypeIcon,
    getSectionTypeLabel,
    extractSummaryFromContent,
    isValidString,
    isValidStringArray,
    hasEnhancedContent,
    getEnhancedContent,
    normalizeDynamicKey,
    groupDynamicKeys,
    detectSectionType,
    preprocessContentForLineBreaks,
} from "./viewer-utilities";
import { BasicMarkdownContent } from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";
import { getViewerRecommendation, analyzeDataStructure, type ViewerRecommendation } from "./viewer-recommendation-utility";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";

// Fallback icon for unknown types
const UnknownIcon = () => <AlertTriangle size={16} className="text-red-500" />;

// Data structure interfaces
interface ChildItem {
    type: string;
    content: string;
}

interface SectionWithChildren {
    type: string;
    children: ChildItem[];
}

interface ProcessedSection {
    id: string;
    title: string;
    icon: React.ReactNode;
    content: string;
    rawData?: unknown;
    isUnknown?: boolean;
    bookmarkPath?: string; // Path to this specific section for bookmarking
}

// Structure detection functions
const isKeyValueObject = (data: unknown): data is Record<string, unknown> => {
    return (
        !!data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        Object.keys(data).length > 0 &&
        Object.values(data as Record<string, unknown>).every(
            (value) =>
                typeof value === "string" ||
                (typeof value === "object" && value !== null && ("parsed_json" in value || "parsed_table" in value || "content" in value))
        )
    );
};

const isSectionWithChildrenArray = (data: unknown): data is SectionWithChildren[] => {
    return (
        Array.isArray(data) &&
        data.length > 0 &&
        data.every(
            (item) =>
                item &&
                typeof item === "object" &&
                typeof (item as Record<string, unknown>).type === "string" &&
                Array.isArray((item as Record<string, unknown>).children) &&
                ((item as Record<string, unknown>).children as unknown[]).every(
                    (child: unknown) =>
                        child &&
                        typeof child === "object" &&
                        typeof (child as Record<string, unknown>).type === "string" &&
                        typeof (child as Record<string, unknown>).content === "string"
                )
        )
    );
};

// Line break preprocessing function is now imported from viewer-utilities

// Content processing functions
const convertChildrenToMarkdown = (children: ChildItem[]): string => {
    return children
        .map((child) => {
            switch (child.type) {
                case "header_h1":
                    return `# ${child.content}`;
                case "header_h2":
                    return `## ${child.content}`;
                case "header_h3":
                    return `### ${child.content}`;
                case "header_h4":
                    return `#### ${child.content}`;
                case "header_h5":
                    return `##### ${child.content}`;
                case "header_h6":
                    return `###### ${child.content}`;
                case "bullet":
                    return `- ${child.content}`;
                case "numbered_list_item":
                    return `1. ${child.content}`;
                case "paragraph":
                    return child.content;
                case "line_break":
                    return "\n";
                case "thematic_break":
                    return "\n---\n";
                case "bold_text":
                    return `**${child.content}**`;
                case "italic_text":
                    return `*${child.content}*`;
                case "quote":
                    return `> ${child.content}`;
                case "code":
                case "code_block":
                    return `\`\`\`\n${child.content}\n\`\`\``;
                case "link":
                    return `[${child.content}](${child.content})`;
                default:
                    return child.content;
            }
        })
        .join("\n");
};

const processKeyValueData = (data: Record<string, unknown>, bookmark?: string): ProcessedSection[] => {
    return Object.entries(data).map(([key, value], index) => {
        const itemData = { [key]: value };
        const detectedType = detectSectionType(itemData);
        const { baseKey } = normalizeDynamicKey(key);
        const title = getSectionTypeLabel(key);
        const icon = getSectionTypeIcon(key);
        const isKnownType = detectedType !== "unknown_section" && baseKey !== "unknown_section";

        // Use enhanced content processing
        let content: string;
        if (typeof value === "object" && value !== null) {
            content = getEnhancedContent(value);
        } else {
            content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        }

        // Construct bookmark path for this section
        const bookmarkPath = bookmark ? `${bookmark}["${key}"]` : `["${key}"]`;

        return {
            id: `section-${index}`,
            title,
            icon: isKnownType ? icon : <UnknownIcon />,
            content: preprocessContentForLineBreaks(content),
            rawData: itemData,
            isUnknown: !isKnownType,
            bookmarkPath,
        };
    });
};

const processSectionWithChildrenData = (data: SectionWithChildren[], bookmark?: string): ProcessedSection[] => {
    return data.map((section, index) => {
        const detectedType = detectSectionType(section);
        const { baseKey } = normalizeDynamicKey(section.type);
        const title = getSectionTypeLabel(section.type);
        const icon = getSectionTypeIcon(section.type);
        const isKnownType = detectedType !== "unknown_section" && baseKey !== "unknown_section";

        const markdownContent = convertChildrenToMarkdown(section.children);

        // Construct bookmark path for this section (array index)
        const bookmarkPath = bookmark ? `${bookmark}[${index}]` : `[${index}]`;

        return {
            id: `section-${index}`,
            title,
            icon: isKnownType ? icon : <UnknownIcon />,
            content: markdownContent,
            rawData: section,
            isUnknown: !isKnownType,
            bookmarkPath,
        };
    });
};

// Fallback processor for unknown structures
const processUnknownData = (data: unknown, bookmark?: string): ProcessedSection[] => {
    // Try to find content-like structures
    if (Array.isArray(data)) {
        return data.map((item: unknown, index) => {
            if (item && typeof item === "object") {
                const itemRecord = item as Record<string, unknown>;
                // Look for content key
                const contentKey = Object.keys(itemRecord).find(
                    (key) =>
                        key.toLowerCase().includes("content") ||
                        key.toLowerCase().includes("text") ||
                        key.toLowerCase().includes("description")
                );

                if (contentKey && typeof itemRecord[contentKey] === "string") {
                    const typeKey = Object.keys(itemRecord).find(
                        (key) =>
                            key.toLowerCase().includes("type") ||
                            key.toLowerCase().includes("kind") ||
                            key.toLowerCase().includes("category")
                    );

                    const typeKeyValue = typeKey ? itemRecord[typeKey] : undefined;
                    const title = typeof typeKeyValue === "string" ? getSectionTypeLabel(typeKeyValue) : `Item ${index + 1}`;
                    const bookmarkPath = bookmark ? `${bookmark}[${index}]` : `[${index}]`;

                    return {
                        id: `unknown-${index}`,
                        title,
                        icon: <UnknownIcon />,
                        content: itemRecord[contentKey] as string,
                        rawData: item,
                        isUnknown: true,
                        bookmarkPath,
                    };
                }
            }

            // Fallback to JSON display
            const bookmarkPath = bookmark ? `${bookmark}[${index}]` : `[${index}]`;
            return {
                id: `unknown-${index}`,
                title: `Unknown Item ${index + 1}`,
                icon: <UnknownIcon />,
                content: "",
                rawData: item,
                isUnknown: true,
                bookmarkPath,
            };
        });
    }

    // Single unknown object
    const bookmarkPath = bookmark || "data";
    return [
        {
            id: "unknown-0",
            title: "Unknown Data Structure",
            icon: <UnknownIcon />,
            content: "",
            rawData: data,
            isUnknown: true,
            bookmarkPath,
        },
    ];
};

interface IntelligentViewerProps {
    data: unknown;
    bookmark?: string; // Optional bookmark path for navigation tracking
}

const IntelligentViewer = ({ data, bookmark }: IntelligentViewerProps) => {
    const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
    const [showRecommendation, setShowRecommendation] = useState<boolean>(false);
    const [recommendation, setRecommendation] = useState<ViewerRecommendation | null>(null);
    const [showJsonExplorer, setShowJsonExplorer] = useState<boolean>(false);
    const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  const copy = async (text: string): Promise<boolean> => {
    if (!(await copyText(text, "Copied"))) return false;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    return true;
  };
    const [bookmarkCopied, setBookmarkCopied] = useState<boolean>(false);

    // Function to analyze data and get recommendation
    const analyzeAndRecommend = () => {
        const rec = getViewerRecommendation(data);
        const analysis = analyzeDataStructure(data);
        setRecommendation({ ...rec, ...analysis });
        setShowRecommendation(true);
    };

    // Process data based on structure
    let processedSections: ProcessedSection[] = [];

    if (isKeyValueObject(data)) {
        processedSections = processKeyValueData(data, bookmark);

        // Enhanced processing for dynamic keys with grouping
        const keys = Object.keys(data);
        const dynamicGroups = groupDynamicKeys(keys);

        // Add visual indicators for grouped dynamic keys
        const hasGroupedKeys = Object.values(dynamicGroups).some((group) => group.length > 1);
        if (hasGroupedKeys) {
            processedSections = processedSections.map((section, index) => {
                const key = keys[index];
                const { baseKey, number } = normalizeDynamicKey(key);
                const group = dynamicGroups[baseKey];

                if (group && group.length > 1) {
                    return {
                        ...section,
                        title: number > 0 ? `${section.title} (${number})` : section.title, // This modifies already processed titles
                        id: `${section.id}-grouped`,
                    };
                }

                return section;
            });
        }
    } else if (isSectionWithChildrenArray(data)) {
        processedSections = processSectionWithChildrenData(data, bookmark);
    } else {
        processedSections = processUnknownData(data, bookmark);
    }

    const selectedSection = processedSections[selectedSectionIndex] || processedSections[0];

    const handleCopy = async () => {
        if (!selectedSection) return;

        const textToCopy = selectedSection.content || JSON.stringify(selectedSection.rawData, null, 2);
        await copy(textToCopy);
    };

    const handleBookmarkCopy = async () => {
        if (!selectedSection?.bookmarkPath) return;

          if (!(await copyText(selectedSection.bookmarkPath))) return;
          setBookmarkCopied(true);
          setTimeout(() => setBookmarkCopied(false), 2000);
    };

    if (!processedSections || processedSections.length === 0) {
        return (
            <JsonFallback
                data={data}
                title="Raw Data (JSON)"
                subtitle="No recognizable structure"
                className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900"
            />
        );
    }

    return (
        <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
            <div className="h-full flex gap-4 max-w-7xl mx-auto">
                {/* Dynamic Sidebar */}
                <div className="w-80 flex-shrink-0 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                                    {showJsonExplorer ? "JSON Explorer" : "Content Sections"}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {showJsonExplorer ? (
                                        "Raw data structure view"
                                    ) : (
                                        <>
                                            {processedSections.length} section{processedSections.length !== 1 ? "s" : ""}
                                            {processedSections.some((s) => s.isUnknown) && (
                                                <span className="ml-2 text-red-500 text-xs">
                                                    ({processedSections.filter((s) => s.isUnknown).length} unknown)
                                                </span>
                                            )}
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="quiet" icon={<FileJson
                                        size={16}
                                        className={`${
                                            showJsonExplorer
                                                ? "text-blue-500"
                                                : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                                        }`}
                                    />} onClick={() => setShowJsonExplorer(!showJsonExplorer)} title={showJsonExplorer ? "Show content sections" : "View raw JSON data"} aria-label={showJsonExplorer ? "Show content sections" : "View raw JSON data"} />
                                <Button variant="quiet" icon={<Lightbulb size={16} />} glyphTone="warning" onClick={analyzeAndRecommend} title="Analyze data structure and get viewer recommendations" aria-label="Analyze data structure and get viewer recommendations" />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-y-auto" style={{ height: "calc(100% - 80px)" }}>
                        {processedSections.map((section, index) => {
                            const summary = section.content
                                ? extractSummaryFromContent(section.content, 50) || "Content Section"
                                : "Raw Data";

                            return (
                                <Tile
                                  key={section.id}
                                  variant="quiet"
                                  selected={selectedSectionIndex === index}
                                  onClick={() => setSelectedSectionIndex(index)}
                                  icon={section.icon}
                                  title={section.title}
                                  line={section.isUnknown ? `${summary} · Unknown structure` : summary}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    {selectedSection?.icon}
                                    <h3
                                        className={`font-semibold ${
                                            selectedSection?.isUnknown
                                                ? "text-red-600 dark:text-red-400"
                                                : "text-gray-800 dark:text-gray-200"
                                        }`}
                                    >
                                        {selectedSection?.title || "Unknown Section"}
                                    </h3>
                                    {selectedSection?.isUnknown && (
                                        <Badge tone="destructive">Needs Handler</Badge>
                                    )}
                                </div>

                                {/* Bookmark Path Display */}
                                {selectedSection?.bookmarkPath && (
                                    <div className="mt-1 flex items-center gap-2">
                                        <Chip label={selectedSection.bookmarkPath} />
                                        <Button variant="quiet" icon={bookmarkCopied ? (
                                                <Check  size={12} />
                                            ) : (
                                                <Copy  size={12} />
                                            )} glyphTone={bookmarkCopied ? "success" : undefined} onClick={handleBookmarkCopy} title="Copy bookmark path" aria-label="Copy bookmark path" />
                                    </div>
                                )}
                            </div>
                            <Button variant="quiet" icon={copied ? (
                                    <Check  size={16} />
                                ) : (
                                    <Copy  size={16} />
                                )} glyphTone={copied ? "success" : undefined} onClick={handleCopy} title="Copy section content" aria-label="Copy section content" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto" style={{ height: "calc(100% - 80px)" }}>
                        <div className="max-w-4xl">
                            {/* Viewer Recommendation Display */}
                            {showRecommendation && recommendation && !showJsonExplorer && (
                                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <Eye size={20} className="text-blue-500 mt-0.5" />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                                                    Recommended Viewer: {recommendation.viewerName}
                                                </h4>
                                                <Badge
                                                    tone={
                                                        recommendation.confidence === "high"
                                                            ? "success"
                                                            : recommendation.confidence === "medium"
                                                              ? "warning"
                                                              : "destructive"
                                                    }
                                                >
                                                    {`${recommendation.confidence} confidence`}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">{recommendation.reasoning}</p>
                                            <div className="text-xs text-blue-600 dark:text-blue-400">
                                                <span className="font-medium">Pattern:</span> {recommendation.matchedPattern}
                                                {recommendation.sampleCount && (
                                                    <span className="ml-3">
                                                        <span className="font-medium">Count:</span> {recommendation.sampleCount}
                                                    </span>
                                                )}
                                            </div>
                                            <Button variant="link" onClick={() => setShowRecommendation(false)} className="mt-3">
                                                Hide recommendation
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {showJsonExplorer ? (
                                <div>
                                    {bookmark && (
                                        <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg border">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-600 dark:text-gray-400">Root bookmark path:</span>
                                                <span className="text-xs text-gray-800 dark:text-gray-200 font-mono bg-textured px-2 py-1 rounded border">
                                                    {bookmark}
                                                </span>
                                                <Button variant="quiet" icon={<Copy
                                                        size={12}
                                                       
                                                    />} onClick={() => copyText(bookmark)} title="Copy root bookmark path" aria-label="Copy root bookmark path" />
                                            </div>
                                        </div>
                                    )}
                                    <RawJsonExplorer showSource pageData={data} />
                                </div>
                            ) : selectedSection ? (
                                selectedSection.content ? (
                                    <BasicMarkdownContent imagePolicy="self" content={selectedSection.content} showCopyButton={false} />
                                ) : (
                                    // Fallback to JSON display for unknown structures
                                    <div className="space-y-4">
                                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                            This structure is not recognized. Displaying raw data:
                                        </div>
                                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border-border">
                                            {JSON.stringify(selectedSection.rawData || selectedSection, null, 2)}
                                        </pre>
                                    </div>
                                )
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400">No content available</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IntelligentViewer;
export type { IntelligentViewerProps };
