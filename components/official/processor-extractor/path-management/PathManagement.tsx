"use client";
import React, { useState, useEffect } from "react";
import { useDebounce } from "@uidotdev/usehooks";
import { CopyIcon, RefreshCw, BookmarkIcon, FileJson } from "lucide-react";
import { IoBookmarks } from "react-icons/io5";
import { Bookmark, PathArray, PathWithTypeInfo } from "../types";
import { convertUiPathToExtractorPath, generateAccessPath, getPathAndTypeInfo } from "../utils/json-path-navigation-util";
import BookmarkManagerActions from "./BookmarkManagerActions";
import { copyToClipboard } from "../utils/basic-utils";
import SaveBookmarkDialog from "./BookmarkDialog";
import ManageBookmarksDialog from "./ManageBookmarksDialog";
import { createPathBookmark, saveBookmarks, getValueByBookmark, exportBookmarks, loadBookmarks } from "../utils/json-path-navigation-util";
import { TextIconButton, IconButton } from "@/components/official/TextIconButton";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import { extractValueByPath } from "../utils/wildcard-utils";

// Define a type for a callback function that will handle data and path updates
interface DataChangeHandler {
    (newData: unknown, newPath: PathArray): void;
}

// Define PathManagementProps interface without bookmarks prop
interface PathManagementProps {
    jsonStr: string;
    currentPath: PathArray;
    originalData: unknown;
    onReset: () => void;
    onDataChange?: DataChangeHandler;
    configKey?: string;
}

const PathManagement: React.FC<PathManagementProps> = ({ jsonStr, currentPath, originalData, onReset, onDataChange, configKey }) => {
    // Debounce the rapidly changing props to prevent maximum depth errors
    const debouncedOriginalData = useDebounce(originalData, 300);
    const debouncedCurrentPath = useDebounce(currentPath, 300);
    
    // State for dialogs
    const [saveBookmarkDialogOpen, setSaveBookmarkDialogOpen] = useState(false);
    const [manageBookmarksDialogOpen, setManageBookmarksDialogOpen] = useState(false);
    const [bookmarkName, setBookmarkName] = useState("");
    const [bookmarkDescription, setBookmarkDescription] = useState("");
    const [localBookmarks, setLocalBookmarks] = useState<Bookmark[]>([]);
    const [pathDetails, setPathDetails] = useState<PathWithTypeInfo>({} as PathWithTypeInfo);

    // Load bookmarks on component mount
    useEffect(() => {
        const savedBookmarks = loadBookmarks();
        setLocalBookmarks(savedBookmarks);
    }, []);

    useEffect(() => {
        const pathDetails = getPathAndTypeInfo(debouncedOriginalData, debouncedCurrentPath);
        setPathDetails(pathDetails);
    }, [debouncedOriginalData, debouncedCurrentPath]);

    // Function for copying access path to clipboard
    const copyAccessPath = () => {
        copyToClipboard(JSON.stringify(pathDetails, null, 2));
    };

    // Handle opening bookmark dialog
    const handleOpenBookmarkDialog = () => {
        setBookmarkName("");
        setBookmarkDescription("");
        setSaveBookmarkDialogOpen(true);
    };

    // Handle opening bookmarks dialog
    const handleOpenBookmarksDialog = () => {
        setManageBookmarksDialogOpen(true);
    };

    // Handle saving bookmark with enhanced type information
    const handleSaveBookmark = () => {
        // Generate path using our consistent approach
        const pathString = generateAccessPath(debouncedCurrentPath);
        // Pass the pathDetails which contains all the type information
        const newBookmark = createPathBookmark(
            pathString, 
            bookmarkName || `Bookmark ${localBookmarks.length + 1}`, 
            bookmarkDescription,
            pathDetails,
            configKey || 'default',
            configKey ? `Config: ${configKey}` : 'Default'
        );
        const updatedBookmarks = [...localBookmarks, newBookmark];
        setLocalBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
        // Reset form
        setBookmarkName("");
        setBookmarkDescription("");
        setSaveBookmarkDialogOpen(false);
    };

    // Delete bookmark
    const handleDeleteBookmark = (index: number) => {
        const updatedBookmarks = [...localBookmarks];
        updatedBookmarks.splice(index, 1);
        setLocalBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
    };

    // Jump to bookmark - now implemented with the data change handler
    const handleJumpToBookmark = (bookmark: Bookmark) => {
        if (!debouncedOriginalData || !onDataChange) return;
        try {
            // Get the value at the bookmarked path
            const value = getValueByBookmark(debouncedOriginalData, bookmark);

            if (value !== undefined) {
                // Build the new path
                const newPath: PathArray = [[0, "All"]];

                if (bookmark.segments.length > 0) {
                    bookmark.segments.forEach((segment, index) => {
                        let key: string;
                        if (segment.type === "key") {
                            key = segment.value as string;
                        } else if (segment.type === "index") {
                            key = `Item ${segment.value}`;
                        } else {
                            key = "All";
                        }
                        newPath.push([index + 1, key]);
                    });
                }
                
                // Update the lastAccessed field
                const updatedBookmark = {
                    ...bookmark,
                    lastAccessed: Date.now()
                };
                
                // Update the bookmark in local state and storage
                const updatedBookmarks = localBookmarks.map(b => 
                    b.id === bookmark.id ? updatedBookmark : b
                );
                setLocalBookmarks(updatedBookmarks);
                saveBookmarks(updatedBookmarks);
                
                // Call the handler to update data and path in the parent component
                onDataChange(value, newPath);
            }
        } catch (error) {
            console.error("Error jumping to bookmark:", error);
        }
        setManageBookmarksDialogOpen(false);
    };

    return (
        <div className="w-full mb-4">
            <div className="flex items-center h-9 gap-2">
                <div className="flex-1 h-full">
                    <div className="relative h-full flex items-center px-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono overflow-hidden">
                        {pathDetails.path}
                        <InlineCopyButton content={pathDetails} position="center-right" size="xs" tooltipText="Copy Path With Details" />
                    </div>
                </div>

                <div className="h-full flex items-center px-2 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono text-blue-800 dark:text-blue-200 relative group">
                    {pathDetails.readibleType}
                </div>

                <div className="flex gap-2 items-center h-full">
                    <BookmarkManagerActions jsonStr={jsonStr} configKey={configKey} />

                    <TextIconButton
                        size="sm"
                        variant="outline"
                        onClick={handleOpenBookmarksDialog}
                        tooltip="View Saved Paths"
                        icon={<IoBookmarks className="w-3 h-3" />}
                        className="text-xs h-8"
                    >
                        Paths
                    </TextIconButton>

                    <TextIconButton
                        size="sm"
                        variant="outline"
                        onClick={handleOpenBookmarkDialog}
                        tooltip="Save Current Path"
                        icon={<BookmarkIcon className="w-3 h-3" />}
                        className="text-xs h-8"
                    >
                        Save
                    </TextIconButton>

                    <TextIconButton
                        size="sm"
                        variant="outline"
                        icon={<CopyIcon className="w-4 h-4" />}
                        onClick={copyAccessPath}
                        tooltip="Copy Access Path"
                        className="text-xs h-8"
                    >
                        Path Details
                    </TextIconButton>

                    <IconButton
                        size="sm"
                        variant="ghost"
                        onClick={onReset}
                        tooltip="Reset View"
                        icon={<RefreshCw className="w-4 h-4" />}
                        className="h-8 w-8"
                    />

                    <IconButton
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(jsonStr)}
                        tooltip="Copy Current Data In View"
                        icon={<FileJson className="w-4 h-4" />}
                        className="h-8 w-8"
                    />
                </div>
            </div>

            <SaveBookmarkDialog
                open={saveBookmarkDialogOpen}
                onOpenChange={setSaveBookmarkDialogOpen}
                currentPath={debouncedCurrentPath}
                bookmarkName={bookmarkName}
                setBookmarkName={setBookmarkName}
                bookmarkDescription={bookmarkDescription}
                setBookmarkDescription={setBookmarkDescription}
                onSave={handleSaveBookmark}
                originalData={debouncedOriginalData}
                configKey={configKey}
            />
            <ManageBookmarksDialog
                open={manageBookmarksDialogOpen}
                onOpenChange={setManageBookmarksDialogOpen}
                bookmarks={localBookmarks}
                onJumpToBookmark={handleJumpToBookmark}
                onDeleteBookmark={handleDeleteBookmark}
                configKey={configKey}
            />
        </div>
    );
};

export default PathManagement;
