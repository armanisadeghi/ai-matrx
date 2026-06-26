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

// Import extracted components
import BookmarkDialog from "./BookmarkDialog";
import BookmarksDialog from "./BookmarksDialog";
import NavigationRows from "./NavigationRows";
import NavigationSelects from "./NavigationSelects";
import ActionButtons from "./ActionButtons";
import CopyPathObjectDialog from "./CopyPathObjectDialog";

interface RawJsonExplorerProps {
  pageData: any;
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
  const [originalData, setOriginalData] = useState(null);
  const [currentPath, setCurrentPath] = useState<PathArray>([[0, "All"]]); // [[rowIndex, selectedKey], ...]
  const [displayData, setDisplayData] = useState(null);

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
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    path: null,
  });

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
    (data, currentFullPath = "data") => {
      // Check if the current path itself should be hidden
      if (hiddenPaths.includes(currentFullPath)) {
        return Array.isArray(data)
          ? [{ hidden: true }]
          : typeof data === "object" && data !== null
            ? { hidden: true }
            : data;
      }

      // Handle primitive values
      if (typeof data !== "object" || data === null) {
        return data;
      }

      // For arrays and objects, process each item
      if (Array.isArray(data)) {
        return data.map((item, idx) => {
          // For array items, we need to use bracket notation
          const childPath = `${currentFullPath}[${idx}]`;
          return processDataWithHiddenPaths(item, childPath);
        });
      } else {
        const result = {};

        // Process object properties
        for (const key in data) {
          // For object properties, use dot notation
          const childPath = `${currentFullPath}.${key}`;

          // Check if this specific property is hidden
          if (hiddenPaths.includes(childPath)) {
            // Replace with placeholder indicating content is hidden
            result[key] = Array.isArray(data[key])
              ? [{ hidden: true }]
              : typeof data[key] === "object" && data[key] !== null
                ? { hidden: true }
                : data[key];
          } else {
            // Process recursively
            result[key] = processDataWithHiddenPaths(data[key], childPath);
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

    // Clear context menu when changing paths
    setContextMenu({ open: false, x: 0, y: 0, path: null });
  };

  // Reset explorer to initial state
  const handleReset = () => {
    setCurrentPath([[0, "All"]]);
    setDisplayData(originalData);
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
    if (!contextMenu.path) return;

    const isCurrentlyHidden = hiddenPaths.includes(contextMenu.path);

    setHiddenPaths((prev) => {
      const newPaths = isCurrentlyHidden
        ? prev.filter((p) => p !== contextMenu.path)
        : [...prev, contextMenu.path];
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
  const jumpToBookmark = (bookmark) => {
    if (!originalData) return;

    try {
      // Get the value at the bookmarked path
      const value = getValueByBookmark(originalData, bookmark);
      if (value !== undefined) {
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

  const deleteBookmark = (index) => {
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
    // Show a simple toast or alert that the bookmarks were copied
    alert("Bookmarks copied to clipboard as JSON");
  };

  // Convert any bracket notation paths to dot notation for consistency
  const normalizedHiddenPaths = hiddenPaths.map((path) => {
    // Convert paths like data["applets"]["ade95b7c-15a1-46c4-9ade-6e6c77cf37f5"].containers
    // to data.containers
    return path.replace(/\["[^"]+"\]/g, "").replace(/\[\d+\]/g, "");
  });

  // Use the normalized paths for processing
  const processDataWithNormalizedPaths = useCallback(
    (data, currentFullPath = "data") => {
      // Handle primitive values
      if (typeof data !== "object" || data === null) {
        return data;
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
        const result = {};

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
  const isPathHidden = (path) => {
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

      {withSelect ? (
        <NavigationSelects
          originalData={originalData}
          currentPath={currentPath}
          onKeySelect={handleKeySelect}
          onContextMenu={handleContextMenu}
          hiddenPaths={hiddenPaths}
          isPathHidden={isPathHidden}
        />
      ) : (
        <NavigationRows
          originalData={originalData}
          currentPath={currentPath}
          onKeySelect={handleKeySelect}
          onContextMenu={handleContextMenu}
          hiddenPaths={hiddenPaths}
          isPathHidden={isPathHidden}
        />
      )}

      <pre className="whitespace-pre-wrap p-2 text-foreground font-mono overflow-auto h-full">
        {displayJsonStr}
      </pre>

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
