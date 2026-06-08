/**
 * BuiltinSelectorModal
 * 
 * Clean, unified modal for browsing and selecting prompt builtins.
 * Used across the app whenever builtin selection is needed.
 * 
 * Features:
 * - Search and filter builtins
 * - Preview selected builtin details
 * - Visual indicators for converted vs generated
 * - Compact, space-efficient design
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { idMatchesQuery } from '@/utils/search-scoring';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  AlertCircle,
  Search,
  FileText,
  PartyPopper,
  CheckCircle2,
} from 'lucide-react';
import { fetchPromptBuiltins } from '../services/admin-service';
import type { PromptBuiltin } from '../types/core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BuiltinSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (builtin: PromptBuiltin) => void;
  selectedBuiltinId?: string | null;
  title?: string;
  description?: string;
}

export function BuiltinSelectorModal({
  isOpen,
  onClose,
  onSelect,
  selectedBuiltinId = null,
  title = 'Select Prompt Builtin',
  description = 'Browse and select a prompt builtin',
}: BuiltinSelectorModalProps) {
  
  const [builtins, setBuiltins] = useState<PromptBuiltin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'converted' | 'generated'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(selectedBuiltinId);

  // Load builtins
  useEffect(() => {
    if (!isOpen) return;

    const loadBuiltins = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchPromptBuiltins();
        setBuiltins(data);
      } catch (err) {
        console.error('Error loading builtins:', err);
        setError('Failed to load prompt builtins');
      } finally {
        setIsLoading(false);
      }
    };

    loadBuiltins();
  }, [isOpen]);

  // Filter and search builtins
  const filteredBuiltins = useMemo(() => {
    return builtins
      .filter(builtin => {
        // Filter by source
        if (filterSource === 'converted' && !builtin.source_prompt_id) return false;
        if (filterSource === 'generated' && builtin.source_prompt_id) return false;

        // Filter by search query
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesName = builtin.name.toLowerCase().includes(query);
          const matchesDescription = builtin.description?.toLowerCase().includes(query);
          return matchesName || matchesDescription || idMatchesQuery(builtin, query);
        }

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [builtins, filterSource, searchQuery]);

  // Get selected builtin details
  const selectedBuiltin = builtins.find(b => b.id === selectedId);

  const handleSelect = () => {
    if (selectedBuiltin) {
      onSelect(selectedBuiltin);
    }
  };

  const handleClose = () => {
    setSelectedId(selectedBuiltinId);
    setSearchQuery('');
    setFilterSource('all');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 flex gap-4 px-6 overflow-hidden">
          {/* Left: Builtin List */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Search and Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search builtins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              
              <Select value={filterSource} onValueChange={(value: any) => setFilterSource(value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Builtins</SelectItem>
                  <SelectItem value="converted">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      Converted from Prompts
                    </div>
                  </SelectItem>
                  <SelectItem value="generated">
                    <div className="flex items-center gap-2">
                      <PartyPopper className="h-3 w-3" />
                      Generated
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Builtin List */}
            <div className="flex-1 border rounded-md overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredBuiltins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-muted-foreground">
                  <AlertCircle className="h-8 w-8" />
                  <p className="text-sm font-medium">No builtins found</p>
                  <p className="text-xs text-center">
                    {searchQuery ? 'Try adjusting your search or filters' : 'No prompt builtins available'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    {filteredBuiltins.map((builtin) => {
                      const isSelected = builtin.id === selectedId;
                      const isConverted = !!builtin.source_prompt_id;

                      return (
                        <button
                          key={builtin.id}
                          onClick={() => setSelectedId(builtin.id)}
                          className={`
                            w-full text-left p-2.5 rounded-md transition-colors
                            ${isSelected 
                              ? 'bg-primary text-primary-foreground' 
                              : 'hover:bg-muted'
                            }
                          `}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-medium text-sm truncate">
                                  {builtin.name}
                                </span>
                                {isConverted ? (
                                  <FileText className="h-3 w-3 flex-shrink-0" />
                                ) : (
                                  <PartyPopper className="h-3 w-3 flex-shrink-0" />
                                )}
                              </div>
                              {builtin.description && (
                                <p className="text-xs opacity-80 line-clamp-1">
                                  {builtin.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] opacity-70">
                                  {(builtin.variableDefaults || []).length} var{(builtin.variableDefaults || []).length !== 1 ? 's' : ''}
                                </span>
                                <span className="text-[10px] opacity-70">
                                  {builtin.messages?.length || 0} msg{(builtin.messages?.length || 0) !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Result count */}
            {!isLoading && (
              <p className="text-xs text-muted-foreground">
                {filteredBuiltins.length} builtin{filteredBuiltins.length !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {/* Right: Preview Panel */}
          {selectedBuiltin && (
            <>
              <Separator orientation="vertical" className="h-auto" />
              
              <div className="w-80 flex flex-col gap-3">
                <div>
                  <h3 className="font-semibold text-sm mb-1">Preview</h3>
                  <p className="text-xs text-muted-foreground">
                    Review builtin details before selecting
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Name */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Name</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {selectedBuiltin.source_prompt_id ? (
                          <><FileText className="h-2.5 w-2.5 mr-1" /> Converted</>
                        ) : (
                          <><PartyPopper className="h-2.5 w-2.5 mr-1" /> Generated</>
                        )}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{selectedBuiltin.name}</p>
                  </div>

                  {/* Description */}
                  {selectedBuiltin.description && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Description
                      </span>
                      <p className="text-sm">{selectedBuiltin.description}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Variables */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Variables ({(selectedBuiltin.variableDefaults || []).length})
                    </span>
                    {(selectedBuiltin.variableDefaults || []).length > 0 ? (
                      <div className="space-y-1">
                        {(selectedBuiltin.variableDefaults || []).map((variable) => (
                          <div
                            key={variable.name}
                            className="p-1.5 bg-muted/50 rounded text-xs font-mono"
                          >
                            {`{{${variable.name}}}`}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No variables</p>
                    )}
                  </div>

                  {/* Messages */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground block mb-1">
                      Messages
                    </span>
                    <p className="text-sm">
                      {selectedBuiltin.messages?.length || 0} message{(selectedBuiltin.messages?.length || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedId || isLoading}>
            Select Builtin
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

