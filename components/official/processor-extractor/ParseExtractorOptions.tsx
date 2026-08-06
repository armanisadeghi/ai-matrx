"use client";
import React, { useState, useMemo } from "react";
import ProcessorExtractor from "./ProcessorExtractor";
import { useDebounce } from "@/hooks/usehooks";

// Type for a processing function that takes content and returns JSON
type ProcessingFunction = {
    name: string;
    label: string;
    fn: (content: string) => any;
};

interface ParseExtractorOptionsProps {
    content: string;
    processors: ProcessingFunction[];
    configKey?: string;
}

const ParseExtractorOptions = ({ content, processors, configKey }: ParseExtractorOptionsProps) => {
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    // Process content with all functions and memoize results
    const processedResults = useMemo(() => {
        return processors.map(processor => {
            try {
                const result = processor.fn(content);
                return {
                    name: processor.name,
                    label: processor.label,
                    data: result,
                    error: null
                };
            } catch (error) {
                console.error(`Error processing with ${processor.name}:`, error);
                return {
                    name: processor.name,
                    label: processor.label,
                    data: null,
                    error: error instanceof Error ? error.message : "Unknown error"
                };
            }
        });
    }, [content, processors]);

    if (!processors || processors.length === 0) {
        return (
            <div className="p-4 text-gray-500 dark:text-gray-400">
                No processing functions provided
            </div>
        );
    }

    const debouncedResults = useDebounce(processedResults, 1000);

    // If only one processor, don't show tabs
    if (processors.length === 1) {
        const result = debouncedResults[0];
        if (result.error) {
            return (
                <div className="p-4 text-red-500 dark:text-red-400">
                    Error processing content: {result.error}
                </div>
            );
        }
        return (
            <div className="w-full">
                <div className="mb-3">
                    <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
                        {result.label}
                    </h3>
                </div>
                <ProcessorExtractor 
                    jsonData={result.data} 
                    configKey={configKey || result.name}
                />
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Tab Navigation */}
            <div className="border-b border-border mb-4">
                <nav className="-mb-px flex space-x-8">
                    {debouncedResults.map((result, index) => (
                        <button
                            key={result.name}
                            onClick={() => setActiveTabIndex(index)}
                            className={`
                                py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                                ${activeTabIndex === index
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
                                }
                                ${result.error ? 'text-red-500 dark:text-red-400' : ''}
                            `}
                        >
                            {result.label}
                            {result.error && (
                                <span className="ml-1 text-xs">⚠️</span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content - Render all tabs but hide inactive ones to preserve state */}
            <div className="tab-content">
                {debouncedResults.map((result, index) => (
                    <div 
                        key={result.name}
                        className={`${activeTabIndex === index ? 'block' : 'hidden'}`}
                    >
                        {result.error ? (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                <h4 className="text-red-800 dark:text-red-300 font-medium mb-2">
                                    Processing Error
                                </h4>
                                <p className="text-red-600 dark:text-red-400 text-sm">
                                    {result.error}
                                </p>
                            </div>
                        ) : (
                            <ProcessorExtractor 
                                jsonData={result.data} 
                                configKey={configKey || result.name}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ParseExtractorOptions;
