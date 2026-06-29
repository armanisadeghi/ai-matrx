"use client";
import React, { useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, TestTube, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import LinesViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer";
import SectionViewerV2 from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/section-viewer-V2";
import SectionGroupTab from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionGroupTab";
import SectionsViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer";
import SectionViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewer";
import SectionViewerWithSidebar from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar";
import IntelligentViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer";
import FlatSectionViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer";

// Error Boundary Component
interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

class ViewerErrorBoundary extends React.Component<
    React.PropsWithChildren<{ onError?: (error: Error) => void; resetKey?: string | number }>,
    ErrorBoundaryState
> {
    constructor(props: React.PropsWithChildren<{ onError?: (error: Error) => void; resetKey?: string | number }>) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Viewer component error:", error, errorInfo);
        this.props.onError?.(error);
    }

    override componentDidUpdate(prevProps: React.PropsWithChildren<{ onError?: (error: Error) => void; resetKey?: string | number }>) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: undefined });
        }
    }

    override render() {
        if (this.state.hasError) {
            return (
                <div className="h-full flex items-center justify-center text-red-500 p-6">
                    <div className="text-center max-w-md">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                        <p className="font-medium mb-2">Component Error</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            This viewer component crashed when trying to render the data.
                        </p>
                        {this.state.error && (
                            <details className="text-xs text-left bg-red-50 dark:bg-red-900/20 p-2 rounded border">
                                <summary className="cursor-pointer font-medium">Error Details</summary>
                                <pre className="mt-2 whitespace-pre-wrap">{this.state.error.message}</pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Viewer options (excluding text-based ones)
const VIEWER_OPTIONS = [
    {
        value: "RawJsonExplorer",
        label: "Raw JSON Explorer",
        componentName: "RawJsonExplorer",
        filename: "json-explorer/RawJsonExplorer",
        description: "Interactive JSON tree viewer",
    },
    {
        value: "LinesViewer",
        label: "Lines Viewer",
        componentName: "LinesViewer",
        filename: "analyzer-options/lines-viewer",
        description: "Line-by-line data display",
    },
    {
        value: "SectionViewerV2",
        label: "Section Viewer V2",
        componentName: "SectionViewerV2",
        filename: "analyzer-options/section-viewer-V2",
        description: "Enhanced section-based view",
    },
    {
        value: "SectionGroupTab",
        label: "Section Group Tab",
        componentName: "SectionGroupTab",
        filename: "analyzer-options/SectionGroupTab",
        description: "Grouped section tabs",
    },
    {
        value: "SectionsViewer",
        label: "Sections Viewer",
        componentName: "SectionsViewer",
        filename: "analyzer-options/sections-viewer",
        description: "Multi-section display",
    },
    {
        value: "SectionViewer",
        label: "Section Viewer",
        componentName: "SectionViewer",
        filename: "analyzer-options/SectionViewer",
        description: "Single section view",
    },
    {
        value: "SectionViewerWithSidebar",
        label: "Section Viewer + Sidebar",
        componentName: "SectionViewerWithSidebar",
        filename: "analyzer-options/SectionViewerWithSidebar",
        description: "Section view with navigation",
    },
    {
        value: "IntelligentViewer",
        label: "Intelligent Viewer",
        componentName: "IntelligentViewer",
        filename: "analyzer-options/IntelligentViewer",
        description: "Smart adaptive viewer",
    },
    {
        value: "FlatSectionViewer",
        label: "Flat Section Viewer",
        componentName: "FlatSectionViewer",
        filename: "analyzer-options/FlatSectionViewer",
        description: "Flat section viewer",
    },
] as const;

type ViewerType = (typeof VIEWER_OPTIONS)[number]["value"];

interface DynamicViewerTesterProps {
    data: any;
    className?: string;
    bookmark?: string;
}

export const DynamicViewerTester: React.FC<DynamicViewerTesterProps> = ({ data, className = "", bookmark }) => {
    const [selectedViewer, setSelectedViewer] = useState<ViewerType>("IntelligentViewer");
    const [errorHistory, setErrorHistory] = useState<Record<ViewerType, string | null>>({} as Record<ViewerType, string | null>);
    const [resetKey, setResetKey] = useState(0);
    const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);

    const handleError = useCallback(
        (error: Error) => {
            setErrorHistory((prev) => ({
                ...prev,
                [selectedViewer]: error.message,
            }));
        },
        [selectedViewer]
    );

    const handleViewerChange = (value: ViewerType) => {
        setSelectedViewer(value);
        setResetKey((prev) => prev + 1); // Reset error boundary
    };

    const handleRetry = () => {
        setResetKey((prev) => prev + 1);
        setErrorHistory((prev) => ({
            ...prev,
            [selectedViewer]: null,
        }));
    };

    const renderViewer = () => {
        switch (selectedViewer) {
            case "RawJsonExplorer":
                return <RawJsonExplorer pageData={data} />;
            case "LinesViewer":
                return <LinesViewer data={data} />;
            case "SectionViewerV2":
                return <SectionViewerV2 data={data} />;
            case "SectionGroupTab":
                return <SectionGroupTab data={data} />;
            case "SectionsViewer":
                return <SectionsViewer data={data} />;
            case "SectionViewer":
                return <SectionViewer data={data} />;
            case "SectionViewerWithSidebar":
                return <SectionViewerWithSidebar data={data} />;
            case "IntelligentViewer":
                return <IntelligentViewer data={data} bookmark={bookmark} />;
            case "FlatSectionViewer":
                return <FlatSectionViewer data={data} bookmark={bookmark} />;
            default:
                return (
                    <div className="h-full flex items-center justify-center text-gray-500">
                        <p>Unknown viewer type</p>
                    </div>
                );
        }
    };

    const currentOption = VIEWER_OPTIONS.find((opt) => opt.value === selectedViewer);
    const hasError = errorHistory[selectedViewer];
    const hasAnyErrors = Object.entries(errorHistory).some(([_, error]) => error);
    const errorCount = Object.values(errorHistory).filter(Boolean).length;
    const successCount = VIEWER_OPTIONS.length - errorCount;

    return (
        <div className={`h-full flex flex-col overflow-hidden ${className}`}>
            {/* Header with Viewer Selector */}
            <div className="flex-shrink-0 mb-4 space-y-4 px-4">
                <div className="flex items-center justify-between">
                    {hasError && (
                        <Button variant="outline" size="sm" onClick={handleRetry} className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <Select value={selectedViewer} onValueChange={handleViewerChange}>
                        <SelectTrigger className="w-64">
                            <SelectValue placeholder="Select a viewer" />
                        </SelectTrigger>
                        <SelectContent>
                            {VIEWER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    <div className="py-1">
                                        <div className="font-medium">{option.label}</div>
                                        <div className="text-xs text-muted-foreground">{option.description}</div>
                                        <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-1">
                                            {option.componentName} - {option.filename}
                                        </div>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                            {currentOption?.componentName}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-mono">
                            {currentOption?.filename}
                        </Badge>
                        {hasError && (
                            <Badge variant="destructive" className="text-xs">
                                Error
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Collapsible Error Summary */}
                {hasAnyErrors && (
                    <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                        <CardHeader
                            className="pb-2 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                            onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                        >
                            <CardTitle className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                                    Viewer Compatibility Analysis
                                    <Badge variant="outline" className="text-xs">
                                        {successCount}/{VIEWER_OPTIONS.length} working
                                    </Badge>
                                </div>
                                {isAnalysisExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-orange-600" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-orange-600" />
                                )}
                            </CardTitle>
                        </CardHeader>
                        {isAnalysisExpanded && (
                            <CardContent className="pt-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {VIEWER_OPTIONS.map((option) => {
                                        const hasThisError = errorHistory[option.value];
                                        return (
                                            <div
                                                key={option.value}
                                                className={`p-2 rounded border text-xs ${
                                                    hasThisError
                                                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                                                        : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                                                }`}
                                            >
                                                <div className="font-medium">{option.componentName}</div>
                                                <div className="text-xs opacity-75 font-mono">{option.filename}</div>
                                                <div className="text-xs opacity-60 mt-1">{option.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Red indicates viewers that failed to render this data. Green indicates successful rendering.
                                </p>
                            </CardContent>
                        )}
                    </Card>
                )}
            </div>

            {/* Viewer Content */}
            <div className="flex-1 overflow-hidden px-4 pb-4">
                <Card className="h-full overflow-hidden">
                    <CardContent className="h-full p-0 overflow-hidden">
                        <ViewerErrorBoundary onError={handleError} resetKey={resetKey}>
                            <div className="h-full overflow-auto">{renderViewer()}</div>
                        </ViewerErrorBoundary>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default DynamicViewerTester;
