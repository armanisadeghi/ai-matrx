"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatJson, getDataAtPath } from "./utils/json-path-navigation-util";
import { PathArray } from "./types";
import { 
  processDataWithHiddenPaths, 
  normalizeHiddenPaths, 
  isPathHidden as checkPathHidden, 
} from "./utils/hidden-path-utils";
import { extractValueByPath } from "./utils/wildcard-utils";
import { Button } from "@/components/ui/ButtonMine";

// Import extracted components
import NavigationRows from "./NavigationRows";
import PathManagement from "./path-management/PathManagement";
import SplitView from "./path-management/SplitView";

interface ProcessorExtractorProps {
    jsonData: any;
    configKey?: string;
}

// Helper function to convert UI path to extractor path
const convertUiPathToExtractorPath = (uiPath: PathArray): string => {
    // Skip the "All" entry at the beginning and filter out other "All" entries
    const pathParts = uiPath
        .map(([_, key]) => key)
        .filter(key => key !== "All");
    
    // Replace "*" with wildcard notation
    const formattedPath = pathParts.map(part => 
        part === "*" ? "*" : part
    );
    
    return "data." + formattedPath.join(".");
};

const ProcessorExtractor = ({ jsonData, configKey }: ProcessorExtractorProps) => {
    const [originalData, setOriginalData] = useState<unknown>(null);
    const [currentPath, setCurrentPath] = useState<PathArray>([[0, "All"]]); // [[rowIndex, selectedKey], ...]
    const [displayData, setDisplayData] = useState<unknown>(null);
    const [hiddenPaths, setHiddenPaths] = useState<string[]>([]);
    const [contextMenu, setContextMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        path: string | null;
    }>({ open: false, x: 0, y: 0, path: null });
    const [hasWildcard, setHasWildcard] = useState(false);
    const [wildcardPath, setWildcardPath] = useState("");

    useEffect(() => {
        if (jsonData) {
            try {
                const cleanedData = JSON.parse(formatJson(jsonData, 2));
                setOriginalData(cleanedData);
                setDisplayData(cleanedData);

                setCurrentPath([[0, "All"]]);
            } catch (error) {
                console.error("Error parsing JSON data:", error);
            }
        }
    }, [jsonData]);

    const handleKeySelect = (rowIndex: number, key: string) => {
        const newPath: PathArray = currentPath.slice(0, rowIndex + 1).map((item, idx) => (idx === rowIndex ? [rowIndex, key] : item));
        
        // Find any wildcard in the path
        const wildcardIndex = newPath.findIndex(([_, key]) => key === "*");
        const hasWildcardInPath = wildcardIndex !== -1;
        
        // Check if this selection is a wildcard
        if (key === "*") {
            // Create proper wildcardPath using the utility
            const extractorPath = convertUiPathToExtractorPath(newPath);
            
            // Store the wildcard path and update state
            setWildcardPath(extractorPath);
            setHasWildcard(true);
            
            // If this is a new wildcard at the end of the path, add a new row
            // to allow continued navigation
            if (wildcardIndex === newPath.length - 1) {
                setCurrentPath([...newPath, [rowIndex + 1, "All"] as [number, string]]);
            } else {
                setCurrentPath(newPath);
            }
            return;
        }
        
        // If the new path contains a wildcard but it's not the current selection,
        // we still need to keep the wildcard state active
        if (hasWildcardInPath) {
            // Get the path up to and including the wildcard
            const pathParts = newPath.map(([_, k]) => k).filter(k => k !== "All");
            const pathToWildcard = pathParts.slice(0, pathParts.findIndex(k => k === "*") + 1);
            const wildcardExtractorPath = "data." + pathToWildcard.join(".");
            
            // Update the UI state
            setCurrentPath(newPath);
            setWildcardPath(wildcardExtractorPath);
            setHasWildcard(true);
            
            // When navigating deeper past a wildcard, we don't need to update displayData
            // as the SplitView component will handle showing the data
            return;
        }
        
        // If we previously had a wildcard but now have a selection that removes the wildcard,
        // clear the wildcard flag
        if (hasWildcard && !hasWildcardInPath) {
            setHasWildcard(false);
            setWildcardPath("");
        }
        
        const dataPath = newPath.map(([_, key]) => key).filter((k) => k !== "All");
        setCurrentPath(newPath);
        
        const newData = dataPath.length > 0 ? getDataAtPath(originalData, dataPath) : originalData;
        setDisplayData(newData);
        setContextMenu({ open: false, x: 0, y: 0, path: null });
    };

    // Reset explorer to initial state
    const handleReset = () => {
        setCurrentPath([[0, "All"]]);
        setDisplayData(originalData);
        setHasWildcard(false);
        setWildcardPath("");
    };

    // Context menu handlers
    const handleContextMenu = (e, path) => {
        e.preventDefault();

        // Get the key name from the path
        const keyName = path[path.length - 1][1];

        // Generate path in the simple dot notation format that matches our processing
        const relativePath = `data.${keyName}`;

        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            path: relativePath,
        });
    };

    const handleHideToggle = () => {
        const menuPath = contextMenu.path;
        if (!menuPath) return;

        const isCurrentlyHidden = hiddenPaths.includes(menuPath);

        setHiddenPaths((prev) => {
            const newPaths = isCurrentlyHidden ? prev.filter((p) => p !== menuPath) : [...prev, menuPath];
            return newPaths;
        });

        setContextMenu({ open: false, x: 0, y: 0, path: null });
    };

    // Close context menu on click outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.open) {
                setContextMenu({ open: false, x: 0, y: 0, path: null });
            }
        };

        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    }, [contextMenu.open]);

    // Check if we need to add a new row based on current selection
    useEffect(() => {
        if (!originalData || currentPath.length === 0) return;

        // Get the last selected key
        const [lastRowIndex, lastSelectedKey] = currentPath[currentPath.length - 1];

        // If 'All' is selected at any level, we don't add a new row for it
        if (lastSelectedKey === "All") return;

        // Calculate path for data extraction
        const dataPath = currentPath.map(([_, key]) => key).filter((k) => k !== "All");
        const currentData = getDataAtPath(originalData, dataPath);

        // Determine if we need to add a new row
        const shouldAddRow = () => {
            if (!currentData || typeof currentData !== "object") return false;

            if (Array.isArray(currentData)) {
                return currentData.length > 0;
            } else {
                return Object.keys(currentData).length > 0;
            }
        };

        if (shouldAddRow()) {
            // Check if we already have a row for this level
            if (currentPath.length <= lastRowIndex + 1) {
                setCurrentPath([...currentPath, [lastRowIndex + 1, "All"] as [number, string]]);
            }
        }
    }, [originalData, currentPath]);

    // Reset hidden paths when navigating to a new section
    useEffect(() => {
        setHiddenPaths([]);
    }, [currentPath.length]);

    if (!jsonData) {
        return <div className="p-4 text-gray-500 dark:text-gray-400">No raw data available</div>;
    }

    // Memoize the normalized hidden paths to avoid unnecessary recalculations
    const normalizedHiddenPaths = useMemo(() => {
        return normalizeHiddenPaths(hiddenPaths);
    }, [hiddenPaths]);

    // Process data with hidden paths using the utility function
    const processedDisplayData = useMemo(() => {
        return processDataWithHiddenPaths(displayData, hiddenPaths);
    }, [displayData, hiddenPaths]);

    // Format the current display data for rendering
    const jsonStr = displayData ? formatJson(displayData, 2) : "";

    // Create a separate processed copy for display that includes the hidden paths
    const displayJsonStr = processedDisplayData ? formatJson(processedDisplayData, 2) : "";

    // Wrapper around isPathHidden from utilities
    const isPathHidden = useCallback((path) => {
        return checkPathHidden(path, hiddenPaths);
    }, [hiddenPaths]);

    return (
        <div className="w-full p-3">
            <PathManagement
                jsonStr={jsonStr}
                configKey={configKey}
                currentPath={currentPath}
                originalData={originalData}
                onReset={handleReset}
                onDataChange={(newData, newPath) => {
                    setDisplayData(newData);
                    setCurrentPath(newPath);
                    setHasWildcard(false);
                    setWildcardPath("");
                }}
            />

            <NavigationRows
                originalData={originalData}
                currentPath={currentPath}
                onKeySelect={handleKeySelect}
                onContextMenu={handleContextMenu}
                hiddenPaths={hiddenPaths}
                isPathHidden={isPathHidden}
                hasWildcard={hasWildcard}
                wildcardPath={wildcardPath}
            />

            {/* Conditional rendering based on whether we have a wildcard path */}
            {hasWildcard ? (
                <div className="mb-4">
                    <h3 className="text-sm font-medium mb-2">Multiple Items For Wildcard Path: {wildcardPath}</h3>
                    <SplitView 
                        originalData={originalData} 
                        wildcardPath={wildcardPath}
                        maxItems={5}
                        currentPath={currentPath}
                    >
                        {(item, index) => (
                            <div>
                                <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-auto max-h-[300px]">
                                    {formatJson(item, 2)}
                                </pre>
                                <div className="mt-2 flex justify-end">
                                    <Button 
                                        size="xs" 
                                        variant="outline"
                                        onClick={() => {
                                            // Convert wildcard path back to a specific path with this index
                                            const specificPath = wildcardPath.replace('.*', `[${index}]`);
                                            console.log('Navigating to specific item path:', specificPath);
                                            
                                            // Extract this specific item
                                            const specificItem = extractValueByPath(originalData, specificPath);
                                            console.log('Extracted specific item:', specificItem);
                                            
                                            // Create a new UI path
                                            const lastWildcardIndex = currentPath.findIndex(([_, key]) => key === "*");
                                            console.log('Last wildcard index in path:', lastWildcardIndex);
                                            console.log('Current path before update:', currentPath);
                                            
                                            if (lastWildcardIndex >= 0) {
                                                // Create properly typed path segments
                                                const newUIPath: PathArray = currentPath.map((pathItem, idx) => {
                                                    if (idx === lastWildcardIndex) {
                                                        return [pathItem[0], `Item ${index}`] as [number, string];
                                                    }
                                                    return pathItem;
                                                });
                                                console.log('New UI path:', newUIPath);
                                                
                                                setCurrentPath(newUIPath);
                                                setDisplayData(specificItem);
                                                setHasWildcard(false);
                                                setWildcardPath("");
                                            }
                                        }}
                                    >
                                        Navigate to Item {index}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </SplitView>
                </div>
            ) : (
                <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-auto max-h-[60dvh]">
                    {displayJsonStr}
                </pre>
            )}

            {/* Context Menu */}
            {contextMenu.open && (
                <div
                    className="fixed bg-textured shadow-md rounded border border-border z-50"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                        onClick={handleHideToggle}
                    >
                        {isPathHidden(contextMenu.path) ? "Show content" : "Hide content"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProcessorExtractor;
