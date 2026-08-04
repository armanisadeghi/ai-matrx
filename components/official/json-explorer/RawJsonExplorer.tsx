"use client";
import React, { useState, useEffect, useCallback } from "react";
import { formatJson } from "@/utils/json/json-cleaner-utility";
import { copyToClipboard } from "@/features/scraper/utils/scraper-utils";
import {
  createPathBookmark,
  saveBookmarks,
  loadBookmarks,
  getValueByBookmark,
  exportBookmarks,
} from "@/features/scraper/utils/json-path-navigation-util";
import {
  getDataAtPath,
  generateAccessPath,
  generatePathDescription,
} from "./json-utils";
import { PathArray, Bookmark } from "./types";
import { isJsonArray, isJsonObject, isJsonPrimitive, type JsonValue } from "@/types/json";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { toast } from "@/lib/toast";

// Import extracted components
import BookmarkDialog from "./BookmarkDialog";
import BookmarksDialog from "./BookmarksDialog";
import NavigationRows from "./NavigationRows";
import NavigationSelects from "./NavigationSelects";
import ActionButtons from "./ActionButtons";
import CopyPathObjectDialog from "./CopyPathObjectDialog";

interface RawJsonExplorerProps {
  pageData: unknown;
  ignorePrefix?: string;
  withSelect?: boolean;
  onPathCopy?: (path: string) => void;
}

const RawJsonExplorer: React.FC<RawJsonExplorerProps> = ({
  pageData,
  ignorePrefix = undefined,
  withSelect = true,
  onPathCopy = undefined,
}) => {
  // Initialize with cleaned data
  const [originalData, setOriginalData] = useState<JsonValue | null>(null);
  const [currentPath, setCurrentPath] = useState<PathArray>([[0, "All"]]); // [[rowIndex, selectedKey], ...]
  const [displayData, setDisplayData] = useState<JsonValue | null>(null);

  // Bookmark-related state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState("");
  const [bookmarkDescription, setBookmarkDescription] = useState("");
  const [bookmarksDialogOpen, setBookmarksDialogOpen] = useState(false);

  // Copy Path Object dialog state
  const [copyPathObjectDialogOpen, setCopyPathObjectDialogOpen] =
    useState(false);

  // Ignore prefix state
  const [currentIgnorePrefix, setCurrentIgnorePrefix] = useState(
    ignorePrefix || "",
  );

  // Hidden paths feature
  const [hiddenPaths, setHiddenPaths] = useState<string[]>([]);
  // The nav key under the last right-click, resolved at menu-open time
  // (single-instance v3 delegation via resolveContextOnOpen).
  const [contextPath, setContextPath] = useState<string | null>(null);

  // Load bookmarks on component mount
  useEffect(() => {
    const savedBookmarks = loadBookmarks();
    setBookmarks(savedBookmarks);
  }, []);

  // Initialize component with cleaned data
  useEffect(() => {
    if (pageData) {
      try {
        const cleanedData = JSON.parse(formatJson(pageData));
        setOriginalData(cleanedData);
        setDisplayData(cleanedData);

        // Initialize with just the first row with 'All' selected
        setCurrentPath([[0, "All"]]);
      } catch (error) {
        console.error("Error parsing JSON data:", error);
      }
    }
  }, [pageData]);

  // Process data with hidden paths
  const processDataWithHiddenPaths = useCallback(
    (data: JsonValue | undefined, currentFullPath = "data"): JsonValue => {
      // Check if the current path itself should be hidden
      if (hiddenPaths.includes(currentFullPath)) {
        return Array.isArray(data)
          ? [{ hidden: true }]
          : typeof data === "object" && data !== null
            ? { hidden: true }
            : (data ?? null);
      }

      // Handle primitive values
      if (typeof data !== "object" || data === null) {
        return data ?? null;
      }

      // For arrays and objects, process each item
      if (Array.isArray(data)) {
        return data.map((item, idx) => {
          // For array items, we need to use bracket notation
          const childPath = `${currentFullPath}[${idx}]`;
          return processDataWithHiddenPaths(item, childPath);
        });
      } else {
        const result: Record<string, JsonValue> = {};

        // Process object properties
        for (const key in data) {
          // For object properties, use dot notation
          const childPath = `${currentFullPath}.${key}`;
          const value = data[key];

          // Check if this specific property is hidden
          if (hiddenPaths.includes(childPath)) {
            // Replace with placeholder indicating content is hidden
            result[key] = Array.isArray(value)
              ? [{ hidden: true }]
              : typeof value === "object" && value !== null
                ? { hidden: true }
                : (value ?? null);
          } else {
            // Process recursively
            result[key] = processDataWithHiddenPaths(value, childPath);
          }
        }
        return result;
      }
    },
    [hiddenPaths],
  );

  // Handle key selection in any row
  const handleKeySelect = (rowIndex: number, key: string) => {
    // Create a new path array by keeping all rows up to the current one
    // and updating the selection for the current row
    const newPath: PathArray = currentPath
      .slice(0, rowIndex + 1)
      .map((item, idx) => (idx === rowIndex ? [rowIndex, key] : item));

    // Calculate path for data extraction (exclude 'All' selections)
    const dataPath = newPath.map(([_, key]) => key).filter((k) => k !== "All");

    // Update the current path
    setCurrentPath(newPath);

    // Update the displayed data
    const newData =
      dataPath.length > 0
        ? getDataAtPath(originalData, dataPath)
        : originalData;
    setDisplayData(newData);
  };

  // Reset explorer to initial state
  const handleReset = () => {
    setCurrentPath([[0, "All"]]);
    setDisplayData(originalData);
  };

  const handleHideToggle = () => {
    const targetPath = contextPath;
    if (!targetPath) return;

    const isCurrentlyHidden = hiddenPaths.includes(targetPath);

    setHiddenPaths((prev) => {
      const newPaths = isCurrentlyHidden
        ? prev.filter((p) => p !== targetPath)
        : [...prev, targetPath];
      return newPaths;
    });
  };

  // Check if we need to add a new row based on current selection
  useEffect(() => {
    if (!originalData || currentPath.length === 0) return;

    // Get the last selected key
    const [lastRowIndex, lastSelectedKey] = currentPath[currentPath.length - 1];

    // If 'All' is selected at any level, we don't add a new row for it
    if (lastSelectedKey === "All") return;

    // Calculate path for data extraction
    const dataPath = currentPath
      .map(([_, key]) => key)
      .filter((k) => k !== "All");
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
        setCurrentPath([
          ...currentPath,
          [lastRowIndex + 1, "All"] as [number, string],
        ]);
      }
    }
  }, [originalData, currentPath]);

  // Reset hidden paths when navigating to a new section
  useEffect(() => {
    setHiddenPaths([]);
  }, [currentPath.length]);

  if (!pageData) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No raw data available
      </div>
    );
  }

  const handleSaveBookmark = () => {
    const pathString = generateAccessPath(currentPath);
    const newBookmark = createPathBookmark(
      pathString,
      bookmarkName || `Bookmark ${bookmarks.length + 1}`,
      bookmarkDescription,
    );

    const updatedBookmarks = [...bookmarks, newBookmark];
    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);

    // Reset form
    setBookmarkName("");
    setBookmarkDescription("");
    setBookmarkDialogOpen(false);
  };

  // Jump to a bookmarked path
  const jumpToBookmark = (bookmark: Bookmark) => {
    if (!originalData) return;

    try {
      // Get the value at the bookmarked path
      const value = getValueByBookmark(originalData, bookmark);
      if (value !== undefined && (isJsonObject(value) || isJsonArray(value) || isJsonPrimitive(value))) {
        setDisplayData(value);
        const newPath: PathArray = [[0, "All"]];
        if (bookmark.segments.length > 0) {
          bookmark.segments.forEach((segment, index) => {
            let key: string;
            if (segment.type === "key") {
              key = segment.value;
            } else if (segment.type === "index") {
              key = `Item ${segment.value}`;
            } else {
              key = "All";
            }
            newPath.push([index + 1, key]);
          });
        }

        setCurrentPath(newPath);
      }
    } catch (error) {
      console.error("Error jumping to bookmark:", error);
    }

    setBookmarksDialogOpen(false);
  };

  const deleteBookmark = (index: number) => {
    const updatedBookmarks = [...bookmarks];
    updatedBookmarks.splice(index, 1);
    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);
  };

  // Function for copying access path to clipboard
  const copyAccessPath = () => {
    copyToClipboard(generateAccessPath(currentPath));
    if (onPathCopy) {
      onPathCopy(generateAccessPath(currentPath));
    }
  };

  const handleExportBookmarks = () => {
    const exported = exportBookmarks(bookmarks);
    copyToClipboard(exported);
    toast.success("Bookmarks copied to clipboard as JSON");
  };

  // Convert any bracket notation paths to dot notation for consistency
  const normalizedHiddenPaths = hiddenPaths.map((path) => {
    // Convert paths like data["applets"]["ade95b7c-15a1-46c4-9ade-6e6c77cf37f5"].containers
    // to data.containers
    return path.replace(/\["[^"]+"\]/g, "").replace(/\[\d+\]/g, "");
  });

  // Use the normalized paths for processing
  const processDataWithNormalizedPaths = useCallback(
    (data: JsonValue | undefined, currentFullPath = "data"): JsonValue => {
      // Handle primitive values
      if (typeof data !== "object" || data === null) {
        return data ?? null;
      }

      // Check if this path or any parent path should be hidden
      if (
        normalizedHiddenPaths.some((hiddenPath) => {
          // Check exact match
          if (hiddenPath === currentFullPath) return true;

          // Check if this is a child of a hidden path (for containers)
          if (
            currentFullPath.startsWith(hiddenPath + ".") ||
            currentFullPath.startsWith(hiddenPath + "[")
          )
            return true;

          return false;
        })
      ) {
        return Array.isArray(data) ? [{ hidden: true }] : { hidden: true };
      }

      // For arrays and objects, process each item
      if (Array.isArray(data)) {
        return data.map((item, idx) => {
          // For array items, we need to use bracket notation
          const childPath = `${currentFullPath}[${idx}]`;
          return processDataWithNormalizedPaths(item, childPath);
        });
      } else {
        const result: Record<string, JsonValue> = {};

        // Process object properties
        for (const key in data) {
          // For object properties, use dot notation
          const childPath = `${currentFullPath}.${key}`;

          // Process recursively
          result[key] = processDataWithNormalizedPaths(data[key], childPath);
        }
        return result;
      }
    },
    [normalizedHiddenPaths],
  );

  const processedDisplayData = processDataWithNormalizedPaths(displayData);

  // Format the current display data for rendering
  const jsonStr = displayData ? formatJson(displayData) : "";

  // Create a separate processed copy for display that includes the hidden paths
  const displayJsonStr = processedDisplayData
    ? formatJson(processedDisplayData)
    : "";

  // Check if a path is hidden
  const isPathHidden = (path: PathArray) => {
    if (!path || path.length === 0) return false;

    // Get the key name from the path
    const keyName = path[path.length - 1][1];

    // Generate path in the simple dot notation format
    const relativePath = `data.${keyName}`;

    return hiddenPaths.includes(relativePath);
  };

  return (
    <div className="w-full">
      <div className="flex flex-col">
        <div className="flex justify-between items-center">
          <div className="p-2 pr-4 bg-muted text-xs font-mono overflow-x-auto">
            Access Path:{" "}
            {generateAccessPath(currentPath) !== "data" ? (
              <span>{generateAccessPath(currentPath)}</span>
            ) : (
              <span>Data Root</span>
            )}
          </div>

          <ActionButtons
            bookmarks={bookmarks}
            jsonStr={jsonStr}
            currentPath={currentPath}
            onExportBookmarks={handleExportBookmarks}
            onOpenBookmarksDialog={() => setBookmarksDialogOpen(true)}
            onOpenBookmarkDialog={() => setBookmarkDialogOpen(true)}
            onCopyPath={copyAccessPath}
            onReset={handleReset}
            onOpenCopyPathObjectDialog={() => setCopyPathObjectDialogOpen(true)}
            ignorePrefix={currentIgnorePrefix}
            onIgnorePrefixChange={setCurrentIgnorePrefix}
          />
        </div>
      </div>

      <NonEditableContextMenu
        sourceFeature="content-extractor"
        resolveContextOnOpen={(target) => {
          const hit = target?.closest?.("[data-json-key]");
          const key =
            hit instanceof HTMLElement ? hit.dataset.jsonKey : undefined;
          if (!key) {
            setContextPath(null);
            return null;
          }
          // Path in the simple dot notation format that matches our processing.
          setContextPath(`data.${key}`);
          return { content: key };
        }}
        extraSections={
          contextPath
            ? ([
                {
                  id: "json-explorer-hidden-paths",
                  anchor: "after-clipboard",
                  items: [
                    {
                      kind: "item",
                      id: "json-explorer-hide-toggle",
                      label: hiddenPaths.includes(contextPath)
                        ? "Show content"
                        : "Hide content",
                      onSelect: handleHideToggle,
                    },
                  ],
                },
              ] satisfies ContextMenuExtraSection[])
            : []
        }
        enableFloatingIcon={false}
      >
        {/* Real DOM element for the Radix asChild trigger. */}
        <div>
          {withSelect ? (
            <NavigationSelects
              originalData={originalData}
              currentPath={currentPath}
              onKeySelect={handleKeySelect}
              hiddenPaths={hiddenPaths}
              isPathHidden={isPathHidden}
            />
          ) : (
            <NavigationRows
              originalData={originalData}
              currentPath={currentPath}
              onKeySelect={handleKeySelect}
              hiddenPaths={hiddenPaths}
              isPathHidden={isPathHidden}
            />
          )}
        </div>
      </NonEditableContextMenu>

      <pre className="whitespace-pre-wrap p-2 text-foreground font-mono overflow-auto h-full">
        {displayJsonStr}
      </pre>

      <BookmarkDialog
        open={bookmarkDialogOpen}
        onOpenChange={setBookmarkDialogOpen}
        currentPath={currentPath}
        bookmarkName={bookmarkName}
        setBookmarkName={setBookmarkName}
        bookmarkDescription={bookmarkDescription}
        setBookmarkDescription={setBookmarkDescription}
        onSave={handleSaveBookmark}
      />

      <BookmarksDialog
        open={bookmarksDialogOpen}
        onOpenChange={setBookmarksDialogOpen}
        bookmarks={bookmarks}
        onJumpToBookmark={jumpToBookmark}
        onDeleteBookmark={deleteBookmark}
      />

      <CopyPathObjectDialog
        open={copyPathObjectDialogOpen}
        onOpenChange={setCopyPathObjectDialogOpen}
        currentPath={currentPath}
        ignorePrefix={currentIgnorePrefix}
      />
    </div>
  );
};

export default RawJsonExplorer;
