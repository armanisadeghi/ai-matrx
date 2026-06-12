"use client";
import React, { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Import our utility functions
import {
    safeParseJSON,
    copyToClipboard,
    extractScraperData,
    filterContentResponses,
    extractPageTitle,
    processOrganizedData,
    formatTextData,
    safeStringify,
    truncateText,
    isScraperLoading,
} from "@/features/scraper/utils/scraper-utils";

/**
 * Component for displaying scraper results using utility functions
 */
const ScraperResultsComponent = ({ socketHook }) => {
    const { streamingResponse, responses, responseRef } = socketHook;
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [activeTab, setActiveTab] = useState("organized");
    const [expandedSection, setExpandedSection] = useState(null);

    // Filter out initialization messages using our utility
    const contentResponses = useMemo(() => {
        return filterContentResponses(responses);
    }, [responses]);

    // Check if we have any responses
    if (!contentResponses || contentResponses.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center p-4">
                <Alert className="w-full max-w-2xl">
                    <AlertDescription>
                        {isScraperLoading(streamingResponse) ? "Processing web page..." : "No page content available."}
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    // Function to render organized data
    const renderOrganizedData = (organizedData) => {
        const processedData = processOrganizedData(organizedData);

        if (processedData.length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No organized content available</div>;
        }

        return (
            <div className="space-y-6 p-4">
                {processedData.map((section, index) => {
                    // Calculate class based on heading level
                    const headingClass =
                        section.heading.level === 1
                            ? "text-2xl font-bold"
                            : section.heading.level === 2
                            ? "text-xl font-semibold"
                            : section.heading.level === 3
                            ? "text-lg font-medium"
                            : section.heading.level === 4
                            ? "text-base font-medium"
                            : "text-sm font-medium";

                    return (
                        <div key={index} className="mb-4">
                            <h3 className={`${headingClass} mb-2 dark:text-white text-gray-800`}>{section.heading.text}</h3>

                            <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
                                {section.content.map((item, contentIndex) => {
                                    if (item.type === "paragraph") {
                                        return (
                                            <p key={contentIndex} className="text-gray-700 dark:text-gray-300">
                                                {item.content}
                                            </p>
                                        );
                                    } else if (item.type === "list") {
                                        return (
                                            <ul key={contentIndex} className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                                                {item.items.map((listItem, itemIndex) => (
                                                    <li key={itemIndex}>{listItem}</li>
                                                ))}
                                            </ul>
                                        );
                                    } else {
                                        return (
                                            <div key={contentIndex} className="text-gray-500 dark:text-gray-400">
                                                {item.keys.join(", ")}
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Function to render structured data
    const renderStructuredData = (structuredData) => {
        if (!structuredData || Object.keys(structuredData).length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No structured data available</div>;
        }

        return (
            <div className="p-4">
                <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-auto">
                    {safeStringify(structuredData)}
                </pre>
            </div>
        );
    };

    // Function to render text data
    const renderTextData = (textData) => {
        const lines = formatTextData(textData);

        if (lines.length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No text content available</div>;
        }

        return (
            <div className="p-4 space-y-4">
                <div className="mb-4 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(textData)}>
                        Copy Text
                    </Button>
                </div>

                <div className="space-y-4">
                    {lines.map((line, index) => (
                        <p key={index} className="text-gray-700 dark:text-gray-300">
                            {line}
                        </p>
                    ))}
                </div>
            </div>
        );
    };

    // Function to render metadata
    const renderMetadata = (overview) => {
        if (!overview || Object.keys(overview).length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No metadata available</div>;
        }

        return (
            <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(overview).map(([key, value], index) => {
                        // Handle different types safely
                        let displayValue = "";

                        if (typeof value === "object" && value !== null) {
                            displayValue = Array.isArray(value)
                                ? `[Array with ${value.length} items]`
                                : `{Object with ${Object.keys(value).length} properties}`;
                        } else {
                            displayValue = String(value);
                        }

                        return (
                            <Card key={index} className="overflow-hidden">
                                <CardContent className="p-4">
                                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-1">{key}</h4>
                                    <div className="text-gray-500 dark:text-gray-400 text-sm">{displayValue}</div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Function to render removal details
    const renderRemovalDetails = (details, title) => {
        if (!details || details.length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No {title} available</div>;
        }

        return (
            <div className="p-4">
                <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">{title}</h3>
                <div className="space-y-2">
                    {details.map((item, index) => (
                        <Collapsible
                            key={index}
                            open={expandedSection === `${title}-${index}`}
                            onOpenChange={() => setExpandedSection(expandedSection === `${title}-${index}` ? null : `${title}-${index}`)}
                            className="border-border rounded-md overflow-hidden"
                        >
                            <CollapsibleTrigger className="w-full p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 text-left">
                                <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{item.type}</span>
                                    <span className="ml-2 text-gray-500 dark:text-gray-400">({item.details})</span>
                                </div>
                                <span>{expandedSection === `${title}-${index}` ? "−" : "+"}</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 border-t border-border bg-gray-50 dark:bg-gray-800">
                                <div className="text-gray-700 dark:text-gray-300">{item.text || "No content details available"}</div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </div>
            </div>
        );
    };

    // Function to render hashes
    const renderHashes = (hashes) => {
        if (!hashes || hashes.length === 0) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No hashes available</div>;
        }

        return (
            <div className="p-4">
                <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Content Hashes</h3>
                <div className="space-y-2">
                    {hashes.map((hash, index) => (
                        <div
                            key={index}
                            className="font-mono text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md text-gray-700 dark:text-gray-300"
                        >
                            {hash}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Function to render raw JSON
    const renderRawJSON = (pageData) => {
        if (!pageData) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No raw data available</div>;
        }

        const jsonStr = safeStringify(pageData);

        return (
            <div className="p-4">
                <div className="mb-4 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(jsonStr)}>
                        Copy JSON
                    </Button>
                </div>
                <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-auto max-h-[70dvh]">
                    {jsonStr}
                </pre>
            </div>
        );
    };

    // Function to render a single page's content
    const renderPageContent = (pageData, index) => {
        if (!pageData) {
            return <div className="p-4 text-gray-500 dark:text-gray-400">No data available for this page</div>;
        }

        // Use our utility to extract all data safely
        const data = extractScraperData(pageData);

        if (data.isError) {
            return (
                <Alert className="m-4">
                    <AlertDescription>{data.error}</AlertDescription>
                </Alert>
            );
        }

        const { statusValue, overview, textData, organizedData, structuredData, contentFilterDetails, noiseRemoverDetails, hashes } = data;

        return (
            <div className="h-full flex flex-col">
                {/* Page info and status */}
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <div>
                        <h1 className="text-2xl font-bold truncate dark:text-white text-gray-800">
                            {overview?.page_title || "Untitled Page"}
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300">{overview?.url || "No URL"}</p>
                    </div>
                    <Badge className={statusValue === "success" ? "bg-green-500 dark:bg-green-600" : "bg-red-500 dark:bg-red-600"}>
                        {statusValue}
                    </Badge>
                </div>

                {/* Content tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="p-2 flex flex-wrap border-b border-border gap-1">
                        <TabsTrigger value="organized">Organized Content</TabsTrigger>
                        <TabsTrigger value="structured">Structured Data</TabsTrigger>
                        <TabsTrigger value="text">Text Content</TabsTrigger>
                        <TabsTrigger value="metadata">Metadata</TabsTrigger>
                        <TabsTrigger value="content-filter">Content Filter</TabsTrigger>
                        <TabsTrigger value="noise-remover">Noise Remover</TabsTrigger>
                        <TabsTrigger value="hashes">Hashes</TabsTrigger>
                        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-auto">
                        <TabsContent value="organized" className="m-0 h-full overflow-auto">
                            {renderOrganizedData(organizedData)}
                        </TabsContent>

                        <TabsContent value="structured" className="m-0 h-full overflow-auto">
                            {renderStructuredData(structuredData)}
                        </TabsContent>

                        <TabsContent value="text" className="m-0 h-full overflow-auto">
                            {renderTextData(textData)}
                        </TabsContent>

                        <TabsContent value="metadata" className="m-0 h-full overflow-auto">
                            {renderMetadata(overview)}
                        </TabsContent>

                        <TabsContent value="content-filter" className="m-0 h-full overflow-auto">
                            {renderRemovalDetails(contentFilterDetails, "Content Filter Removals")}
                        </TabsContent>

                        <TabsContent value="noise-remover" className="m-0 h-full overflow-auto">
                            {renderRemovalDetails(noiseRemoverDetails, "Noise Remover Details")}
                        </TabsContent>

                        <TabsContent value="hashes" className="m-0 h-full overflow-auto">
                            {renderHashes(hashes)}
                        </TabsContent>

                        <TabsContent value="raw" className="m-0 h-full overflow-auto">
                            {renderRawJSON(pageData)}
                        </TabsContent>
                    </div>
                </Tabs>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 p-4 border-t border-border">
                    {overview?.url && (
                        <Button variant="outline" onClick={() => window.open(overview.url, "_blank")}>
                            Visit Website
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Page tabs - Only show if multiple pages */}
            {contentResponses.length > 1 && (
                <div className="border-b border-border p-2">
                    <Tabs value={String(activePageIndex)} onValueChange={(value) => setActivePageIndex(parseInt(value))}>
                        <TabsList className="flex flex-wrap gap-1">
                            {contentResponses.map((response, idx) => {
                                const pageTitle = extractPageTitle(response, idx);
                                return (
                                    <TabsTrigger key={idx} value={String(idx)}>
                                        {truncateText(pageTitle, 25)}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {/* Main content area */}
            <div className="flex-1 h-full overflow-hidden">
                {contentResponses.length > 0 && activePageIndex < contentResponses.length ? (
                    renderPageContent(contentResponses[activePageIndex], activePageIndex)
                ) : (
                    <div className="p-4 text-gray-500 dark:text-gray-400">No content available</div>
                )}
            </div>
        </div>
    );
};

export default ScraperResultsComponent;
