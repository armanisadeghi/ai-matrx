"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BookmarkIcon, 
  TrashIcon, 
  CopyIcon, 
  ExternalLinkIcon, 
  FileUp,
  ImportIcon,
  FilterIcon,
  SearchIcon,
  TagIcon,
  SaveIcon,
  PencilIcon
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { 
  loadBookmarks, 
  saveBookmarks, 
  exportBookmarks, 
  importBookmarks 
} from "../utils/json-path-navigation-util";
import { copyToClipboard } from "../utils/basic-utils";
import { Bookmark } from "../types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getConfigEntry, getConfigSelectOptions } from "@/components/mardown-display/markdown-classification/processors/json-config-system/config-registry";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface UnifiedBookmarkManagerProps {
  onJumpToBookmark?: (bookmark: Bookmark) => void;
  onClose?: () => void;
  isDialog?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentConfigKey?: string;
}

const UnifiedBookmarkManager: React.FC<UnifiedBookmarkManagerProps> = ({
  onJumpToBookmark,
  onClose,
  isDialog = true,
  open = false,
  onOpenChange,
  currentConfigKey
}) => {
  // State variables
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeTab, setActiveTab] = useState("manage");
  const [expandedBookmarkId, setExpandedBookmarkId] = useState<string | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [importJson, setImportJson] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [configFilter, setConfigFilter] = useState<string>(currentConfigKey || "all");
  const [sortBy, setSortBy] = useState<string>("lastAccessed");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Load bookmarks when component mounts or dialog opens
  useEffect(() => {
    if (!isDialog || open) {
      const savedBookmarks = loadBookmarks();
      setBookmarks(savedBookmarks);
    }
  }, [isDialog, open]);

  // Update configFilter when currentConfigKey changes
  useEffect(() => {
    if (currentConfigKey) {
      setConfigFilter(currentConfigKey);
    }
  }, [currentConfigKey]);

  // Get all unique configKeys from bookmarks
  const uniqueConfigKeys = useMemo(() => {
    const configs = new Set<string>();
    bookmarks.forEach(bookmark => {
      if (bookmark.configKey) {
        configs.add(bookmark.configKey);
      }
    });
    return Array.from(configs);
  }, [bookmarks]);

  // Filter and sort bookmarks
  const filteredBookmarks = useMemo(() => {
    let result = [...bookmarks];
    
    // Filter by search term
    if (searchTerm) {
      result = filterAndSortBySearch(result, searchTerm, [
        { get: (b) => b.name, weight: "title" },
        { get: (b) => b.path, weight: "subtitle" },
        { get: (b) => b.description, weight: "body" },
      ]);
    }
    
    // Filter by config key
    if (configFilter && configFilter !== "all") {
      result = result.filter(bookmark => bookmark.configKey === configFilter);
    }
    
    // Sort results
    result.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case "name":
          aValue = a.name;
          bValue = b.name;
          break;
        case "createdAt":
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case "lastAccessed":
          aValue = a.lastAccessed || 0;
          bValue = b.lastAccessed || 0;
          break;
        case "type":
          aValue = a.type;
          bValue = b.type;
          break;
        default:
          aValue = a.lastAccessed || 0;
          bValue = b.lastAccessed || 0;
      }
      
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return result;
  }, [bookmarks, searchTerm, configFilter, sortBy, sortOrder]);

  // Helper functions
  const formatDate = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return "Unknown date";
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedBookmarkId(expandedBookmarkId === id ? null : id);
  };

  const handleDeleteBookmark = (id: string) => {
    const updatedBookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setEditingBookmark({ ...bookmark });
  };

  const saveEditedBookmark = () => {
    if (!editingBookmark) return;
    
    const updatedBookmarks = bookmarks.map(bookmark => 
      bookmark.id === editingBookmark.id ? editingBookmark : bookmark
    );
    
    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);
    setEditingBookmark(null);
  };

  const jumpToBookmark = (bookmark: Bookmark) => {
    if (onJumpToBookmark) {
      // Update lastAccessed
      const updatedBookmark = {
        ...bookmark,
        lastAccessed: Date.now()
      };
      
      // Update the bookmark in storage
      const updatedBookmarks = bookmarks.map(b => 
        b.id === bookmark.id ? updatedBookmark : b
      );
      setBookmarks(updatedBookmarks);
      saveBookmarks(updatedBookmarks);
      
      // Jump to the bookmark
      onJumpToBookmark(updatedBookmark);
    }
  };

  const handleExport = () => {
    const jsonString = exportBookmarks(bookmarks);
    copyToClipboard(jsonString);
    // You could add a toast notification here
  };

  const handleImport = () => {
    if (!importJson.trim()) return;
    
    try {
      const importedBookmarks = importBookmarks(importJson);
      if (importedBookmarks.length > 0) {
        setBookmarks(importedBookmarks);
        saveBookmarks(importedBookmarks);
        setImportJson("");
        setActiveTab("manage");
        // You could add a success toast here
      }
    } catch (error) {
      console.error("Error importing bookmarks:", error);
      // You could add an error toast here
    }
  };

  // Render functions
  const renderContent = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search bookmarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={configFilter} onValueChange={setConfigFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by config" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Configs</SelectItem>
            {uniqueConfigKeys.map(key => (
              <SelectItem key={key} value={key}>
                {getConfigEntry(key)?.name || key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <Tabs defaultValue="manage" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manage">Manage Bookmarks</TabsTrigger>
          <TabsTrigger value="import">Import/Export</TabsTrigger>
        </TabsList>
        
        <TabsContent value="manage" className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {filteredBookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <BookmarkIcon className="mx-auto h-12 w-12 mb-4 text-gray-400 dark:text-gray-600" />
                <h3 className="font-medium text-lg mb-1">No bookmarks found</h3>
                <p>
                  {bookmarks.length === 0
                    ? "You haven't created any bookmarks yet. Navigate to a location and save it."
                    : "No bookmarks match your current filters."}
                </p>
              </div>
            ) : (
              <div className="p-2">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredBookmarks.length} bookmarks found
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sort by:</span>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="lastAccessed">Last Accessed</SelectItem>
                        <SelectItem value="createdAt">Created Date</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="h-7 w-7"
                    >
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </Button>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Name</TableHead>
                      <TableHead className="w-[160px]">Type</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookmarks.map((bookmark) => (
                      <React.Fragment key={bookmark.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => toggleExpand(bookmark.id)}
                        >
                          <TableCell>
                            <div className="flex items-start gap-2">
                              <BookmarkIcon className="h-4 w-4 text-blue-500 mt-1" />
                              <div>
                                <div className="font-medium">{bookmark.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-1 mt-1">
                                  <span>Created {formatDate(bookmark.createdAt)}</span>
                                  {bookmark.configKey && bookmark.configKey !== 'default' && (
                                    <Badge variant="outline" className="text-[10px] h-4">
                                      {getConfigEntry(bookmark.configKey)?.name || bookmark.configKey}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 inline-block">
                              {bookmark.readibleType || bookmark.type}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs truncate max-w-[300px]">
                            {bookmark.path}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-1">
                              {onJumpToBookmark && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToBookmark(bookmark);
                                  }}
                                  className="h-8 w-8"
                                >
                                  <ExternalLinkIcon className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(bookmark.path);
                                }}
                                className="h-8 w-8"
                              >
                                <CopyIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditBookmark(bookmark);
                                }}
                                className="h-8 w-8"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBookmark(bookmark.id);
                                }}
                                className="h-8 w-8 text-red-500"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedBookmarkId === bookmark.id && (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-gray-50 dark:bg-gray-800 p-0">
                              <div className="p-4 text-sm">
                                {bookmark.description && (
                                  <div className="mb-4 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-3 rounded-md border-border">
                                    <div className="font-semibold mb-1">Description:</div>
                                    <div>{bookmark.description}</div>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                                  <div className="bg-textured p-3 rounded-md border-border shadow-sm">
                                    <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b">
                                      Type Details
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Type:</span> 
                                      <span className="font-mono">{bookmark.type}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Subtype:</span> 
                                      <span className="font-mono">{bookmark.subtype || "N/A"}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Depth:</span> 
                                      <span className="font-mono">{bookmark.depth}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Is Empty:</span> 
                                      <span className="font-mono">{bookmark.isEmpty ? "Yes" : "No"}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Count:</span> 
                                      <span className="font-mono">{bookmark.count}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Readable Type:</span> 
                                      <span className="font-mono">{bookmark.readibleType}</span>
                                    </div>
                                  </div>

                                  <div className="bg-textured p-3 rounded-md border-border shadow-sm">
                                    <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b">
                                      Metadata
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Created:</span> 
                                      <span>{new Date(bookmark.createdAt).toLocaleString()}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Last Accessed:</span> 
                                      <span>{bookmark.lastAccessed ? new Date(bookmark.lastAccessed).toLocaleString() : "Never"}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Config:</span> 
                                      <span>{getConfigEntry(bookmark.configKey || 'default')?.name || bookmark.configKey || 'Default'}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Config Key:</span> 
                                      <span className="font-mono">{bookmark.configKey || "default"}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Broker ID:</span> 
                                      <span className="font-mono">{bookmark.brokerId || "None"}</span>
                                      
                                      <span className="text-gray-500 dark:text-gray-400 font-medium">Bookmark ID:</span> 
                                      <span className="font-mono text-[9px]">{bookmark.id}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-textured p-3 rounded-md border-border shadow-sm">
                                  <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 pb-1 border-b flex justify-between items-center">
                                    <span>Full Path</span>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(bookmark.path);
                                      }}
                                    >
                                      <CopyIcon className="h-3 w-3" />
                                      Copy
                                    </Button>
                                  </div>
                                  <code className="text-xs block bg-gray-100 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap break-all">
                                    {bookmark.path}
                                  </code>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="import" className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <h3 className="font-medium text-sm mb-2 flex items-center">
                <FileUp className="w-4 h-4 mr-2" />
                Export Bookmarks
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Export your bookmarks to share with others or back them up.
              </p>
              <Button 
                onClick={handleExport} 
                className="flex items-center"
              >
                <FileUp className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
            
            <div className="pt-4 border-t border-border">
              <h3 className="font-medium text-sm mb-2 flex items-center">
                <ImportIcon className="w-4 h-4 mr-2" />
                Import Bookmarks
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Import bookmarks from a JSON string. This will replace all your current bookmarks.
              </p>
              <div className="space-y-3">
                <textarea
                  className="w-full h-32 p-2 text-sm border rounded resize-none bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="Paste JSON bookmarks here..."
                />
                <div className="flex justify-end">
                  <Button 
                    onClick={handleImport} 
                    className="flex items-center"
                    disabled={!importJson.trim()}
                  >
                    <ImportIcon className="w-4 h-4 mr-2" />
                    Import
                  </Button>
                </div>
              </div>
              
              <Alert className="mt-4 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800">
                <AlertDescription className="text-xs">
                  Warning: Importing bookmarks will replace all existing bookmarks. Make sure to export your current bookmarks first if you want to keep them.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  // Edit bookmark dialog
  const renderEditDialog = () => (
    <Dialog open={!!editingBookmark} onOpenChange={(open) => !open && setEditingBookmark(null)}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Bookmark</DialogTitle>
        </DialogHeader>
        {editingBookmark && (
          <div className="space-y-5 py-2">
            <div>
              <label htmlFor="edit-name" className="text-sm font-medium block mb-2">
                Name:
              </label>
              <Input
                id="edit-name"
                value={editingBookmark.name}
                onChange={(e) => setEditingBookmark({...editingBookmark, name: e.target.value})}
                className="h-10"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="text-sm font-medium block mb-2">
                Description:
              </label>
              <textarea
                id="edit-description"
                value={editingBookmark.description || ''}
                onChange={(e) => setEditingBookmark({...editingBookmark, description: e.target.value})}
                className="w-full h-24 p-2 text-sm border rounded resize-none bg-background border-input"
                placeholder="Enter a description for this bookmark..."
              />
            </div>
            <div>
              <label htmlFor="edit-config" className="text-sm font-medium block mb-2">
                Config Context:
              </label>
              <Select 
                value={editingBookmark.configKey || 'default'} 
                onValueChange={(value) => setEditingBookmark({
                  ...editingBookmark, 
                  configKey: value,
                  configName: getConfigEntry(value)?.name || value
                })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {getConfigSelectOptions().map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md border-border">
              <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">Path Information</div>
              <div className="mb-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Type:</div>
                <div className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 inline-block">
                  {editingBookmark.readibleType || editingBookmark.type}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Path:</div>
                <code className="text-xs block bg-gray-100 dark:bg-gray-800 p-2 rounded whitespace-pre-wrap break-all">
                  {editingBookmark.path}
                </code>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setEditingBookmark(null)}>
                Cancel
              </Button>
              <Button onClick={saveEditedBookmark}>
                <SaveIcon className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // If rendered as a standalone component (not in a dialog)
  if (!isDialog) {
    return (
      <div className="flex flex-col h-full">
        {renderContent()}
        {renderEditDialog()}
      </div>
    );
  }

  // If rendered as a dialog
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[1200px] max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Bookmark Manager</DialogTitle>
          </DialogHeader>
          {renderContent()}
        </DialogContent>
      </Dialog>
      {renderEditDialog()}
    </>
  );
};

export default UnifiedBookmarkManager; 