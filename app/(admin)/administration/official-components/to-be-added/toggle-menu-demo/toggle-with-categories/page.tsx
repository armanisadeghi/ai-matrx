"use client";
import React, { useState, useEffect } from "react";
import HierarchicalToggleMenu from "@/components/matrx/toggles/HierarchicalToggleMenu";
import { programmingLibraries } from "./constants";
import { Code, Braces, FileJson } from "lucide-react";

const HierarchicalExample = () => {
    // Separate state for each demo section
    const [singleSelectLibrary, setSingleSelectLibrary] = useState<string[]>([]);
    const [multiSelectLibrary, setMultiSelectLibrary] = useState<string[]>([]);
    const [topDirectionLibrary, setTopDirectionLibrary] = useState<string[]>([]);
    const [rightDirectionLibrary, setRightDirectionLibrary] = useState<string[]>([]);
    const [noIconsLibrary, setNoIconsLibrary] = useState<string[]>([]);
    const [nonCollapsibleLibrary, setNonCollapsibleLibrary] = useState<string[]>([]);
    
    // Debug state to track all selected values
    const [debugInfo, setDebugInfo] = useState({
        showDebug: false,
        allSelections: {
            singleSelect: [] as string[],
            multiSelect: [] as string[],
            topDirection: [] as string[],
            rightDirection: [] as string[],
            noIcons: [] as string[],
            nonCollapsible: [] as string[]
        }
    });

    // Update debug info whenever any selection changes
    useEffect(() => {
        setDebugInfo(prev => ({
            ...prev,
            allSelections: {
                singleSelect: singleSelectLibrary,
                multiSelect: multiSelectLibrary,
                topDirection: topDirectionLibrary,
                rightDirection: rightDirectionLibrary,
                noIcons: noIconsLibrary,
                nonCollapsible: nonCollapsibleLibrary
            }
        }));
    }, [
        singleSelectLibrary, 
        multiSelectLibrary, 
        topDirectionLibrary, 
        rightDirectionLibrary,
        noIconsLibrary,
        nonCollapsibleLibrary
    ]);

    // Get the full hierarchical path of a selected library
    const getSelectedPath = (selectedId: string) => {
        if (!selectedId) return "None";
        
        const findItem = (options: any[], id: string, path: string[] = []): string[] | null => {
            for (const option of options) {
                const currentPath = [...path, option.label];
                
                if (option.id === id) {
                    return currentPath;
                }
                
                if ("items" in option && option.items) {
                    const result = findItem(option.items, id, currentPath);
                    if (result) return result;
                }
            }
            
            return null;
        };
        
        const path = findItem(programmingLibraries, selectedId);
        return path ? path.join(" → ") : selectedId;
    };

    // Toggle debug info display
    const toggleDebugInfo = () => {
        setDebugInfo(prev => ({
            ...prev,
            showDebug: !prev.showDebug
        }));
    };

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Hierarchical Menu Examples</h1>
                <button 
                    onClick={toggleDebugInfo}
                    className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                    <Braces size={16} />
                    {debugInfo.showDebug ? "Hide Debug Info" : "Show Debug Info"}
                </button>
            </div>

            {/* Debug Panel */}
            {debugInfo.showDebug && (
                <div className="rounded-md border-border bg-gray-50 dark:bg-gray-900 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                        <FileJson size={18} />
                        <h3 className="font-medium">Component State Debug Info</h3>
                    </div>
                    <pre className="text-xs bg-textured rounded p-3 overflow-auto max-h-80">
                        {JSON.stringify(debugInfo.allSelections, null, 2)}
                    </pre>
                </div>
            )}

            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Hierarchical Programming Libraries</h2>
                <p className="text-gray-600 dark:text-gray-300">
                    This example shows a fully hierarchical menu with multiple levels of nesting.
                </p>
                
                <div className="flex flex-wrap gap-6 items-start">
                    {/* Single select example */}
                    <div className="space-y-2 max-w-sm">
                        <h3 className="font-medium">Single Selection</h3>
                        <HierarchicalToggleMenu
                            label="Libraries"
                            defaultIcon={<Code />}
                            enabledIcon={<Code />}
                            options={programmingLibraries}
                            selectedIds={singleSelectLibrary}
                            onSelectionChange={setSingleSelectLibrary}
                            tooltip="Select a library"
                            direction="bottom"
                            size="md"
                            maxHeight="400px"
                            minWidth="280px"
                            enableSearch={true}
                            collapsibleCategories={true}
                            defaultExpandedCategories={false}
                            showHierarchy={true}
                        />
                        
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded border-border">
                            <div className="font-medium mb-1">Selected ID:</div>
                            <div className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                                {singleSelectLibrary.length > 0 ? singleSelectLibrary[0] : "None"}
                            </div>
                            
                            <div className="font-medium mt-2 mb-1">Full Path:</div>
                            <div className="text-sm">
                                {singleSelectLibrary.length > 0 
                                    ? getSelectedPath(singleSelectLibrary[0]) 
                                    : "None"}
                            </div>
                        </div>
                    </div>
                    
                    {/* Multi select example */}
                    <div className="space-y-2 max-w-sm">
                        <h3 className="font-medium">Multiple Selection</h3>
                        <HierarchicalToggleMenu
                            label="Libraries"
                            defaultIcon={<Code />}
                            enabledIcon={<Code />}
                            options={programmingLibraries}
                            selectedIds={multiSelectLibrary}
                            onSelectionChange={setMultiSelectLibrary}
                            tooltip="Select libraries"
                            direction="bottom"
                            size="md"
                            maxHeight="400px"
                            minWidth="280px"
                            enableSearch={true}
                            selectionMode="multiple"
                            collapsibleCategories={true}
                            defaultExpandedCategories={true}
                        />
                        
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded border-border">
                            <div className="font-medium mb-1">Selected IDs:</div>
                            {multiSelectLibrary.length > 0 ? (
                                <div>
                                    <ul className="list-disc pl-5 text-sm">
                                        {multiSelectLibrary.map((id) => (
                                            <li key={id} className="mb-1">
                                                <span className="font-mono text-blue-600 dark:text-blue-400">{id}</span>
                                                <div className="text-xs text-gray-600 dark:text-gray-400 ml-1">
                                                    {getSelectedPath(id)}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <span className="text-sm">None</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="space-y-3 p-4 rounded-lg border-border">
                    <h3 className="font-semibold">Direction: Top</h3>
                    <HierarchicalToggleMenu
                        label="Libraries"
                        defaultIcon={<Code />}
                        enabledIcon={<Code />}
                        options={programmingLibraries}
                        selectedIds={topDirectionLibrary}
                        onSelectionChange={setTopDirectionLibrary}
                        direction="top"
                        maxHeight="300px"
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Selection: {topDirectionLibrary.length > 0 ? topDirectionLibrary[0] : "None"}
                    </div>
                </div>
                
                <div className="space-y-3 p-4 rounded-lg border-border">
                    <h3 className="font-semibold">Direction: Right</h3>
                    <HierarchicalToggleMenu
                        label="Libraries"
                        defaultIcon={<Code />}
                        enabledIcon={<Code />}
                        options={programmingLibraries}
                        selectedIds={rightDirectionLibrary}
                        onSelectionChange={setRightDirectionLibrary}
                        direction="right"
                        maxHeight="300px"
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Selection: {rightDirectionLibrary.length > 0 ? rightDirectionLibrary[0] : "None"}
                    </div>
                </div>
                
                <div className="space-y-3 p-4 rounded-lg border-border">
                    <h3 className="font-semibold">Without Icons</h3>
                    <HierarchicalToggleMenu
                        label="Libraries"
                        defaultIcon={<Code />}
                        enabledIcon={<Code />}
                        options={programmingLibraries}
                        selectedIds={noIconsLibrary}
                        onSelectionChange={setNoIconsLibrary}
                        showIcons={false}
                        maxHeight="300px"
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Selection: {noIconsLibrary.length > 0 ? noIconsLibrary[0] : "None"}
                    </div>
                </div>
                
                <div className="space-y-3 p-4 rounded-lg border-border">
                    <h3 className="font-semibold">Non-Collapsible Categories</h3>
                    <HierarchicalToggleMenu
                        label="Libraries"
                        defaultIcon={<Code />}
                        enabledIcon={<Code />}
                        options={programmingLibraries}
                        selectedIds={nonCollapsibleLibrary}
                        onSelectionChange={setNonCollapsibleLibrary}
                        collapsibleCategories={false}
                        maxHeight="300px"
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Selection: {nonCollapsibleLibrary.length > 0 ? nonCollapsibleLibrary[0] : "None"}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HierarchicalExample;