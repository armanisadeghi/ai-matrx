"use client";

import { useState, useEffect, useMemo } from "react";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { markdownSamples, getAllMarkdownSampleIds } from "./sample-data/markdown-samples";
import { getCoordinatorSelectOptions, getCoordinatorConfig, getSampleDataIds, getDefaultViewId } from "./markdown-coordinator";
import { PROCESSOR_REGISTRY } from "./processors/processor-registry";
import { getConfigSelectOptions } from "./processors/json-config-system/config-registry";
import MarkdownInput from "./MarkdownInput";
import MarkdownProcessingTabs from "./MarkdownProcessingTabs";
import { ViewId, getViewSelectOptions } from "./custom-views/view-registry";
import { processMarkdownForRendering } from "./markdown-processor-util";
import { AstNode } from "./processors/types";
import { PROCESSOR_CONFIG_TYPE_MAP } from "./processors/processor-registry";


interface MarkdownClassificationTesterProps {
    initialMarkdown?: string;
    initialCoordinatorId?: string;
    showSelectors?: boolean;
}

const isClient = typeof window !== "undefined";


const MarkdownClassificationTester = ({
    initialMarkdown,
    initialCoordinatorId = "dynamic",
    showSelectors = true,
}: MarkdownClassificationTesterProps) => {
    const mode = useThemeMode();

    // Main state
    const [markdown, setMarkdown] = useState<string>(initialMarkdown || "");
    const [parsedMarkdown, setParsedMarkdown] = useState<string>(initialMarkdown || "");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Selection state
    const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string>(initialCoordinatorId);
    const [selectedSampleId, setSelectedSampleId] = useState<string>("");
    const [selectedProcessorId, setSelectedProcessorId] = useState<string>("");
    const [selectedConfigId, setSelectedConfigId] = useState<string>("");
    const [selectedViewId, setSelectedViewId] = useState<ViewId | null>(null);
    const [ast, setAst] = useState<AstNode | null>(null);
    const [processedData, setProcessedData] = useState<any | null>(null);

    // Use the hook for processing markdown
    useEffect(() => {
        if (!isClient) return;
        setIsLoading(true);
        const processMarkdown = async () => {
            const { ast, processedData } = await processMarkdownForRendering({
                markdown,
                processorId: selectedProcessorId,
                processorConfigId: selectedConfigId,
            });
            setAst(ast);
            setProcessedData(processedData);
            setIsLoading(false);
        };
        processMarkdown();
    }, [markdown, selectedProcessorId, selectedConfigId]);

    // Handle initial markdown if provided
    useEffect(() => {
        if (initialMarkdown) {
            setMarkdown(initialMarkdown);
            setParsedMarkdown(initialMarkdown);
        }
    }, [initialMarkdown]);

    // Update selected options when coordinator changes
    useEffect(() => {
        const coordinator = getCoordinatorConfig(selectedCoordinatorId);
        if (coordinator) {
            // Set defaults from coordinator
            setSelectedProcessorId(coordinator.processor);

            if (coordinator.config) {
                setSelectedConfigId(coordinator.config);
            }

            const defaultViewId = getDefaultViewId(selectedCoordinatorId);
            if (defaultViewId) {
                setSelectedViewId(defaultViewId);
            }

            // Only update sample data and markdown content when coordinator is explicitly changed by user
            // Not on initial load when initialMarkdown is provided
            const sampleIds = getSampleDataIds(selectedCoordinatorId);
            if (sampleIds.length > 0) {
                setSelectedSampleId(sampleIds[0]);
                // Only load sample data if no initialMarkdown was provided or coordinator was explicitly changed
                if (!initialMarkdown || selectedCoordinatorId !== initialCoordinatorId) {
                    if (markdownSamples[sampleIds[0]]) {
                        const sampleText = markdownSamples[sampleIds[0]];
                        setMarkdown(sampleText);
                        setParsedMarkdown(sampleText);
                    }
                }
            }
        }
    }, [selectedCoordinatorId, initialCoordinatorId, initialMarkdown]);

    // Reset config when processor changes if it's incompatible
    useEffect(() => {
        const requiredConfigType = PROCESSOR_CONFIG_TYPE_MAP[selectedProcessorId];
        // If the processor doesn't require a config or the selected config doesn't match the required type, reset it
        if (!requiredConfigType) {
            setSelectedConfigId("");
        } else {
            const allOptions = getConfigSelectOptions();
            const currentConfigOption = allOptions.find(option => option.value === selectedConfigId);
            
            if (!currentConfigOption || currentConfigOption.processorType !== requiredConfigType) {
                // Find the first matching config and select it
                const matchingOption = allOptions.find(option => option.processorType === requiredConfigType);
                if (matchingOption) {
                    setSelectedConfigId(matchingOption.value);
                } else {
                    setSelectedConfigId("");
                }
            }
        }
    }, [selectedProcessorId]);

    // Always update preview when markdown changes
    useEffect(() => {
        setParsedMarkdown(markdown);
    }, [markdown]);

    // Handle coordinator change
    function handleCoordinatorChange(value: string) {
        setProcessedData(null);
        setSelectedCoordinatorId(value);
    }

    // Handle sample selection
    function handleSampleSelect(sampleKey: string) {
        setProcessedData(null);
        setSelectedSampleId(sampleKey);
        if (markdownSamples[sampleKey]) {
            const newMarkdown = markdownSamples[sampleKey];
            setMarkdown(newMarkdown);
            setParsedMarkdown(newMarkdown);
        }
    }

    // Handle processor change
    function handleProcessorChange(value: string) {
        setProcessedData(null);
        setSelectedProcessorId(value);
    }

    // Handle config change
    function handleConfigChange(value: string) {
        setProcessedData(null);
        setSelectedConfigId(value);
    }

    // Handle view change
    function handleViewChange(value: ViewId) {
        setSelectedViewId(value);
    }

    // Handle manual parse button click (no longer needed for actual parsing, just for UX)
    function handleParseClick() {
        // Just add a small delay to show loading state for better UX
        setTimeout(() => setIsLoading(false), 300);
    }

    // Get all available sample IDs
    const allSampleIds = useMemo(() => {
        return getAllMarkdownSampleIds();
    }, []);

    // Get filtered config options based on selected processor
    const filteredConfigOptions = useMemo(() => {
        const requiredConfigType = PROCESSOR_CONFIG_TYPE_MAP[selectedProcessorId];
        if (!requiredConfigType) return [];
        
        return getConfigSelectOptions().filter(option => 
            option.processorType === requiredConfigType
        );
    }, [selectedProcessorId]);

    // Check if config selection should be disabled
    const isConfigDisabled = !PROCESSOR_CONFIG_TYPE_MAP[selectedProcessorId];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {/* Controls */}
            {showSelectors && (
                <div className="border-b border-border p-2 flex flex-wrap items-end gap-2 text-sm">
                    {/* Coordinator Selector */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Coordinator:</label>
                        <Select value={selectedCoordinatorId} onValueChange={handleCoordinatorChange}>
                            <SelectTrigger className="w-[170px] h-8 text-xs">
                                <SelectValue placeholder="Select a coordinator" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                {getCoordinatorSelectOptions().map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Sample Data Selector */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Sample Data:</label>
                        <Select value={selectedSampleId} onValueChange={handleSampleSelect}>
                            <SelectTrigger className="w-[170px] h-8 text-xs">
                                <SelectValue placeholder="Choose a sample" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                {allSampleIds.map((sampleId) => (
                                    <SelectItem key={sampleId} value={sampleId}>
                                        {sampleId.replace(/([A-Z])/g, " $1").trim()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Processor Selector */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Processor:</label>
                        <Select value={selectedProcessorId} onValueChange={handleProcessorChange}>
                            <SelectTrigger className="w-[170px] h-8 text-xs">
                                <SelectValue placeholder="Select a processor" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                {PROCESSOR_REGISTRY.map((processor) => (
                                    <SelectItem key={processor.id} value={processor.id}>
                                        {processor.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Config Selector */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Config:</label>
                        <Select 
                            value={selectedConfigId} 
                            onValueChange={handleConfigChange}
                            disabled={isConfigDisabled}
                        >
                            <SelectTrigger className={`w-[170px] h-8 text-xs ${isConfigDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <SelectValue placeholder={isConfigDisabled ? "No config needed" : "Select a config"} />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                {filteredConfigOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* View Selector */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">View:</label>
                        <Select value={selectedViewId || undefined} onValueChange={(value) => handleViewChange(value as ViewId)}>
                            <SelectTrigger className="w-[170px] h-8 text-xs">
                                <SelectValue placeholder="Select a view" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                {getViewSelectOptions().map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button onClick={handleParseClick} className="whitespace-nowrap h-8 text-xs" aria-label="Parse Markdown">
                        Reprocess
                    </Button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden p-2">
                {/* Left Side: Markdown Input & Preview */}
                <MarkdownInput markdown={markdown} parsedMarkdown={parsedMarkdown} onMarkdownChange={setMarkdown} mode={mode} />

                {/* Right Side: Processing Tabs */}

                <MarkdownProcessingTabs
                    ast={ast}
                    parsedMarkdown={parsedMarkdown}
                    processedData={processedData}
                    selectedCoordinatorId={selectedCoordinatorId}
                    selectedViewId={selectedViewId}
                    mode={mode}
                    onParse={handleParseClick}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
};

export default MarkdownClassificationTester;
