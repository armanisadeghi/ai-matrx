"use client";
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadBookmarks, saveBookmarks, exportBookmarks, importBookmarks } from "../utils/json-path-navigation-util";
import { copyToClipboard } from "../utils/basic-utils";
import { TextIconButton, IconButton } from "@/components/official/TextIconButton";
import { CopyIcon, ImportIcon, FileUp, PlusIcon, TrashIcon } from "lucide-react";
import { Bookmark } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

interface BookmarkManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const BookmarkManager: React.FC<BookmarkManagerProps> = ({ open, onOpenChange }) => {
    // State for bookmarks and form inputs
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [activeTab, setActiveTab] = useState("manage");
    const [importJson, setImportJson] = useState("");
    const [expandedBookmarkId, setExpandedBookmarkId] = useState<string | null>(null);

    // Load bookmarks when the modal opens
    useEffect(() => {
        if (open) {
            setBookmarks(loadBookmarks());
        }
    }, [open]);

    // Format date
    const formatDate = (timestamp: number) => {
        try {
            return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
        } catch (e) {
            return "Unknown date";
        }
    };

    // Toggle expanded bookmark
    const toggleExpand = (id: string) => {
        setExpandedBookmarkId(expandedBookmarkId === id ? null : id);
    };

    // Handle deleting a bookmark
    const deleteBookmark = (id: string) => {
        const updatedBookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
        setBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
    };

    // Handle export
    const handleExport = () => {
        const jsonString = exportBookmarks(bookmarks);
        copyToClipboard(jsonString);
        // You could optionally show a toast notification here
    };

    // Handle import
    const handleImport = () => {
        if (!importJson.trim()) return;
        
        try {
            const importedBookmarks = importBookmarks(importJson);
            if (importedBookmarks.length > 0) {
                setBookmarks(importedBookmarks);
                saveBookmarks(importedBookmarks);
                setImportJson("");
                setActiveTab("manage");
                // You could optionally show a success toast here
            }
        } catch (error) {
            console.error("Error importing bookmarks:", error);
            // You could optionally show an error toast here
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Bookmark Manager</DialogTitle>
                </DialogHeader>
                
                <Tabs defaultValue="manage" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="manage">Manage Bookmarks</TabsTrigger>
                        <TabsTrigger value="import">Import/Export</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="manage" className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto pr-2">
                            {bookmarks.length === 0 ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                                    No bookmarks saved yet. Create bookmarks by navigating to a location and clicking "Save".
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[200px]">Name</TableHead>
                                            <TableHead className="w-[140px]">Type</TableHead>
                                            <TableHead className="hidden md:table-cell">Path</TableHead>
                                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {bookmarks.map((bookmark) => (
                                            <React.Fragment key={bookmark.id}>
                                                <TableRow 
                                                    className="cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    onClick={() => toggleExpand(bookmark.id)}
                                                >
                                                    <TableCell>
                                                        <div className="font-medium">{bookmark.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            Created {formatDate(bookmark.createdAt)}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 inline-block">
                                                            {bookmark.readibleType || bookmark.type}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs truncate hidden md:table-cell max-w-[300px]">
                                                        {bookmark.path}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end space-x-1">
                                                            <IconButton
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    copyToClipboard(bookmark.path);
                                                                }}
                                                                tooltip="Copy Path"
                                                                icon={<CopyIcon className="w-4 h-4" />}
                                                                className="h-8 w-8"
                                                            />
                                                            <IconButton
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteBookmark(bookmark.id);
                                                                }}
                                                                tooltip="Delete"
                                                                icon={<TrashIcon className="w-4 h-4 text-red-500" />}
                                                                className="h-8 w-8"
                                                            />
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {expandedBookmarkId === bookmark.id && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="bg-gray-50 dark:bg-gray-800">
                                                            <div className="p-2 text-sm">
                                                                {bookmark.description && (
                                                                    <div className="mb-2 text-gray-700 dark:text-gray-300">
                                                                        <span className="font-semibold">Description:</span> {bookmark.description}
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-2 gap-4 mb-2">
                                                                    <div>
                                                                        <div className="font-semibold text-xs text-gray-500 dark:text-gray-400">Type Details</div>
                                                                        <div className="grid grid-cols-2 gap-x-2 text-xs mt-1">
                                                                            <span className="text-gray-500">Type:</span> <span>{bookmark.type}</span>
                                                                            <span className="text-gray-500">Subtype:</span> <span>{bookmark.subtype || "N/A"}</span>
                                                                            <span className="text-gray-500">Depth:</span> <span>{bookmark.depth}</span>
                                                                            <span className="text-gray-500">Is Empty:</span> <span>{bookmark.isEmpty ? "Yes" : "No"}</span>
                                                                            <span className="text-gray-500">Count:</span> <span>{bookmark.count}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-semibold text-xs text-gray-500 dark:text-gray-400">Metadata</div>
                                                                        <div className="grid grid-cols-2 gap-x-2 text-xs mt-1">
                                                                            <span className="text-gray-500">Created:</span> <span>{new Date(bookmark.createdAt).toLocaleString()}</span>
                                                                            <span className="text-gray-500">Last Accessed:</span> 
                                                                            <span>{bookmark.lastAccessed ? new Date(bookmark.lastAccessed).toLocaleString() : "Never"}</span>
                                                                            <span className="text-gray-500">Broker ID:</span> <span>{bookmark.brokerId || "None"}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="font-semibold text-xs text-gray-500 dark:text-gray-400 mt-2">Full Path</div>
                                                                <code className="text-xs block bg-gray-100 dark:bg-gray-900 p-2 rounded mt-1 whitespace-pre-wrap break-all">
                                                                    {bookmark.path}
                                                                </code>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="import" className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex-1 flex flex-col space-y-4">
                            <div>
                                <h3 className="font-medium text-sm mb-2">Export Bookmarks</h3>
                                <div className="flex space-x-2">
                                    <Button 
                                        onClick={handleExport} 
                                        className="flex items-center space-x-1"
                                    >
                                        <FileUp className="w-4 h-4 mr-1" />
                                        Copy to Clipboard
                                    </Button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Export your bookmarks to share with others or back them up.
                                </p>
                            </div>
                            
                            <div className="pt-4 border-t border-border">
                                <h3 className="font-medium text-sm mb-2">Import Bookmarks</h3>
                                <div className="space-y-3">
                                    <textarea
                                        className="w-full h-32 p-2 text-sm border rounded resize-none bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                                        value={importJson}
                                        onChange={(e) => setImportJson(e.target.value)}
                                        placeholder={`Paste JSON bookmarks here...`}
                                    />
                                    <div className="flex justify-end">
                                        <Button 
                                            onClick={handleImport} 
                                            className="flex items-center space-x-1"
                                            disabled={!importJson.trim()}
                                        >
                                            <ImportIcon className="w-4 h-4 mr-1" />
                                            Import
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Import bookmarks from a JSON string. This will replace all your current bookmarks.
                                </p>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default BookmarkManager;
