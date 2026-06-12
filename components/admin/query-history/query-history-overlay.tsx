'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Tag, Clock, Calendar, Copy, Edit, Trash, ChevronDown, ChevronUp, Download, Filter } from 'lucide-react';
import { 
  getQueryHistory, 
  deleteQuery, 
  clearQueryHistory, 
  updateQuery, 
  searchQueries,
  StoredQuery 
} from './query-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FullScreenOverlay, { TabDefinition } from '@/components/official/FullScreenOverlay';

interface QueryHistoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuery: (query: string) => void;
}

export const QueryHistoryOverlay: React.FC<QueryHistoryOverlayProps> = ({ 
  isOpen, 
  onClose,
  onSelectQuery
}) => {
  const [queries, setQueries] = useState<StoredQuery[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedQuery, setSelectedQuery] = useState<StoredQuery | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);

  // Load queries when component mounts or when isOpen changes
  useEffect(() => {
    if (isOpen) {
      loadQueries();
    }
  }, [isOpen]);

  const loadQueries = () => {
    const history = searchText.trim() 
      ? searchQueries(searchText)
      : getQueryHistory();
    
    // Apply tag filtering if tags are selected
    const filteredQueries = selectedTags.size > 0
      ? history.filter(q => 
          q.tags?.some(tag => selectedTags.has(tag))
        )
      : history;
      
    // Sort queries
    const sortedQueries = [...filteredQueries].sort((a, b) => 
      sortOrder === 'newest' 
        ? b.timestamp - a.timestamp 
        : a.timestamp - b.timestamp
    );
    
    setQueries(sortedQueries);
    
    // Extract all unique tags
    const tags = new Set<string>();
    history.forEach(q => {
      q.tags?.forEach(tag => tags.add(tag));
    });
    
    setAllTags(Array.from(tags));
  };

  // Handle search
  const handleSearch = () => {
    loadQueries();
  };

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest');
    loadQueries();
  };

  // Toggle query expansion
  const toggleQueryExpansion = (queryId: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(queryId)) {
      newExpanded.delete(queryId);
    } else {
      newExpanded.add(queryId);
    }
    setExpandedQueries(newExpanded);
  };

  // Handle query selection
  const handleSelectQuery = (query: StoredQuery) => {
    onSelectQuery(query.query);
    onClose();
  };

  // Handle query deletion
  const handleDeleteQuery = () => {
    if (selectedQuery) {
      deleteQuery(selectedQuery.id);
      setShowDeleteConfirm(false);
      setSelectedQuery(null);
      loadQueries();
    }
  };

  // Open edit dialog
  const openEditDialog = (query: StoredQuery) => {
    setSelectedQuery(query);
    setDescription(query.description || '');
    setTagInput('');
    setShowEditDialog(true);
  };

  // Handle query update
  const handleUpdateQuery = () => {
    if (selectedQuery) {
      const existingTags = selectedQuery.tags || [];
      const newTags = tagInput.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag && !existingTags.includes(tag));
      
      const updates = {
        description,
        tags: [...existingTags, ...newTags]
      };
      
      updateQuery(selectedQuery.id, updates);
      setShowEditDialog(false);
      loadQueries();
    }
  };

  // Handle tag deletion
  const handleDeleteTag = (queryId: string, tagToDelete: string) => {
    const query = queries.find(q => q.id === queryId);
    if (query && query.tags) {
      const updatedTags = query.tags.filter(tag => tag !== tagToDelete);
      updateQuery(queryId, { tags: updatedTags });
      loadQueries();
    }
  };

  // Export selected query as JSON
  const exportQuery = (query: StoredQuery) => {
    const dataStr = JSON.stringify(query, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `query-${query.id}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Toggle tag selection for filtering
  const toggleTagSelection = (tag: string) => {
    const newSelection = new Set(selectedTags);
    if (newSelection.has(tag)) {
      newSelection.delete(tag);
    } else {
      newSelection.add(tag);
    }
    setSelectedTags(newSelection);
    // Reload queries with new filter
    setTimeout(loadQueries, 0);
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Copy query to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderQueryList = () => (
    <div className="h-full flex flex-col">
      {/* Search and filters */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search queries..."
                className="pl-10 bg-white dark:bg-slate-900"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
          
          <Button 
            variant="outline" 
            onClick={toggleSortOrder}
            className="flex items-center gap-1 bg-white dark:bg-slate-900"
          >
            <Clock className="h-4 w-4" />
            {sortOrder === 'newest' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
            {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className={`flex items-center gap-1 ${selectedTags.size > 0 ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-slate-900'}`}
              >
                <Filter className="h-4 w-4" />
                Filter by Tags {selectedTags.size > 0 && `(${selectedTags.size})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Filter by Tags</h3>
                {allTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-auto p-1">
                    {allTags.map(tag => (
                      <div key={tag} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`tag-${tag}`} 
                          checked={selectedTags.has(tag)}
                          onCheckedChange={() => toggleTagSelection(tag)}
                        />
                        <Label 
                          htmlFor={`tag-${tag}`}
                          className="text-sm cursor-pointer"
                        >
                          {tag}
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No tags available</p>
                )}
                {selectedTags.size > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setSelectedTags(new Set());
                      loadQueries();
                    }}
                    className="mt-2"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-white dark:bg-slate-900">
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => {
                if (confirm('Are you sure you want to clear all query history?')) {
                  clearQueryHistory();
                  loadQueries();
                }
              }}>
                <Trash className="h-4 w-4 mr-2" />
                Clear All History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Active tag filters */}
        {selectedTags.size > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Array.from(selectedTags).map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => toggleTagSelection(tag)}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Query list */}
      <ScrollArea className="flex-1 p-4">
        {queries.length > 0 ? (
          <div className="space-y-4">
            {queries.map((query) => (
              <Card 
                key={query.id} 
                className="overflow-hidden border border-slate-200 dark:border-slate-700"
              >
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => toggleQueryExpansion(query.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-slate-700 dark:text-slate-300 overflow-hidden break-words line-clamp-2">
                      {query.query}
                    </div>
                    <div className="flex items-center mt-2 space-x-4">
                      <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3 w-3" />
                        {formatDate(query.timestamp)}
                      </span>
                      {query.executionTime && (
                        <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          {(query.executionTime / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {expandedQueries.has(query.id) ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    )}
                  </div>
                </div>
                
                {expandedQueries.has(query.id) && (
                  <div className="border-t border-slate-200 dark:border-slate-700">
                    {/* Query details */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800">
                      {/* Query description */}
                      {query.description && (
                        <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                          {query.description}
                        </div>
                      )}
                      
                      {/* Query tags */}
                      {query.tags && query.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {query.tags.map(tag => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="flex items-center gap-1 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                            >
                              <Tag className="h-3 w-3" />
                              {tag}
                              <X 
                                className="h-3 w-3 ml-1 cursor-pointer" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTag(query.id, tag);
                                }}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* Query full text */}
                      <pre className="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                        {query.query}
                      </pre>
                      
                      {/* Action buttons */}
                      <div className="flex flex-wrap justify-end mt-4 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(query.query);
                          }}
                          className="text-slate-600 dark:text-slate-400"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportQuery(query);
                          }}
                          className="text-slate-600 dark:text-slate-400"
                        >
                          <Download className="h-4 w-4" />
                          Export
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(query);
                          }}
                          className="text-slate-600 dark:text-slate-400"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuery(query);
                            setShowDeleteConfirm(true);
                          }}
                          className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash className="h-4 w-4" />
                          Delete
                        </Button>
                        
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectQuery(query);
                          }}
                          size="sm"
                        >
                          Use Query
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-slate-400 dark:text-slate-500 mb-2">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No queries found</p>
              <p className="text-sm max-w-md mx-auto mt-1">
                {searchText.trim() || selectedTags.size > 0
                  ? "Try adjusting your search or filters"
                  : "Execute SQL queries to see them in your history"}
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Define tabs for the FullScreenOverlay
  const tabs: TabDefinition[] = [
    {
      id: 'query-history',
      label: 'Query History',
      content: renderQueryList()
    }
    // Additional tabs can be added here in the future
  ];

  return (
    <>
      <FullScreenOverlay
        isOpen={isOpen}
        onClose={onClose}
        title="SQL Database Tools"
        description="Browse and manage your query history"
        tabs={tabs}
        initialTab="query-history"
        width="90vw"
        height="95dvh"
      />
      
      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Query</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this query? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md my-2">
            <code className="text-xs block overflow-x-auto whitespace-pre-wrap break-words font-mono">
              {selectedQuery?.query}
            </code>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteQuery}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit query dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Query Details</DialogTitle>
            <DialogDescription>
              Add description and tags to help organize your queries.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this query..."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="tags" className="text-sm font-medium">
                Add Tags
              </Label>
              <div className="flex mt-1 gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add comma-separated tags..."
                  className="flex-1"
                />
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    if (tagInput.trim()) {
                      handleUpdateQuery();
                    }
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Separate multiple tags with commas (e.g., "reports, users, important")
              </p>
            </div>
            
            {selectedQuery?.tags && selectedQuery.tags.length > 0 && (
              <div>
                <Label className="text-sm font-medium">
                  Current Tags
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedQuery.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => {
                          if (selectedQuery) {
                            handleDeleteTag(selectedQuery.id, tag);
                          }
                        }}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuery}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}; 