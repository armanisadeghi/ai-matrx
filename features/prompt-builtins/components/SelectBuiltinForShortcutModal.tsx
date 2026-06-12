'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  FileText,
  Link2,
  Hammer,
} from 'lucide-react';
import { toast } from '@/lib/toast-service';
import { ScopeMappingEditor } from './ScopeMappingEditor';
import { fetchPromptBuiltins, updatePromptShortcut } from '../services/admin-service';
import type { PromptBuiltin, PromptShortcut, ScopeMapping } from '../types/core';
import { filterAndSortBySearch } from '@/utils/search-scoring';

interface SelectBuiltinForShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcut: PromptShortcut;
  onSuccess?: () => void;
}

const DEFAULT_AVAILABLE_SCOPES = ['selection', 'content', 'context'];

export function SelectBuiltinForShortcutModal({
  isOpen,
  onClose,
  shortcut,
  onSuccess,
}: SelectBuiltinForShortcutModalProps) {
  const [builtins, setBuiltins] = useState<PromptBuiltin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const [selectedBuiltinId, setSelectedBuiltinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'converted' | 'generated'>('all');

  const [scopeMappings, setScopeMappings] = useState<ScopeMapping>(
    shortcut.scope_mappings || {}
  );
  const [availableScopes, setAvailableScopes] = useState<string[]>(
    shortcut.available_scopes || DEFAULT_AVAILABLE_SCOPES
  );

  // Load builtins
  useEffect(() => {
    if (!isOpen) return;

    const loadBuiltins = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await fetchPromptBuiltins({ is_active: true });
        setBuiltins(data);
      } catch (err) {
        console.error('Error loading builtins:', err);
        setError('Failed to load prompt builtins');
      } finally {
        setLoading(false);
      }
    };

    loadBuiltins();
  }, [isOpen]);

  // Filter builtins
  const filteredBuiltins = useMemo(() => {
    let filtered = [...builtins];

    // Search filter
    if (searchQuery) {
      filtered = filterAndSortBySearch(filtered, searchQuery, [
        { get: (b) => b.name, weight: 'title' },
        { get: (b) => b.description, weight: 'body' },
      ]);
    }

    // Source filter
    if (filterSource === 'converted') {
      filtered = filtered.filter((b) => b.source_prompt_id);
    } else if (filterSource === 'generated') {
      filtered = filtered.filter((b) => !b.source_prompt_id);
    }

    return filtered;
  }, [builtins, searchQuery, filterSource]);

  const selectedBuiltin = useMemo(
    () => builtins.find((b) => b.id === selectedBuiltinId),
    [builtins, selectedBuiltinId]
  );

  const handleLinkBuiltin = async () => {
    if (!selectedBuiltinId) {
      toast.error('Please select a builtin');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      await updatePromptShortcut({
        id: shortcut.id,
        prompt_builtin_id: selectedBuiltinId,
        available_scopes: availableScopes,
        scope_mappings: scopeMappings,
      });

      toast.success('Builtin linked successfully!');
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error('Error linking builtin:', err);
      setError(err.message || 'Failed to link builtin');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setSelectedBuiltinId(null);
    setSearchQuery('');
    setFilterSource('all');
    setError('');
    setScopeMappings(shortcut.scope_mappings || {});
    setAvailableScopes(shortcut.available_scopes || DEFAULT_AVAILABLE_SCOPES);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle>Link Builtin to &quot;{shortcut.label}&quot;</DialogTitle>
          <DialogDescription>
            Browse and select a prompt builtin to link to this shortcut
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 flex gap-4 px-4 py-3 overflow-hidden">
            {/* Left: Builtin List */}
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Search & Filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search builtins..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={filterSource === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterSource('all')}
                    className="h-8 text-xs"
                  >
                    All ({builtins.length})
                  </Button>
                  <Button
                    variant={filterSource === 'converted' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterSource('converted')}
                    className="h-8 text-xs"
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Converted ({builtins.filter((b) => b.source_prompt_id).length})
                  </Button>
                  <Button
                    variant={filterSource === 'generated' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterSource('generated')}
                    className="h-8 text-xs"
                  >
                    <Hammer className="h-3 w-3 mr-1" />
                    Generated ({builtins.filter((b) => !b.source_prompt_id).length})
                  </Button>
                </div>
              </div>

              {/* Builtins List */}
              {filteredBuiltins.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {searchQuery
                      ? 'No builtins match your search'
                      : 'No prompt builtins available'}
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-4">
                    {filteredBuiltins.map((builtin) => {
                      const isSelected = selectedBuiltinId === builtin.id;
                      const variableCount = (builtin.variableDefaults || []).length;

                      return (
                        <div
                          key={builtin.id}
                          onClick={() => setSelectedBuiltinId(builtin.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border-primary'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                <div className="font-medium text-sm">{builtin.name}</div>
                              </div>
                              {builtin.description && (
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {builtin.description}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                {variableCount > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {variableCount} variable{variableCount !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {builtin.source_prompt_id ? (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Link2 className="h-3 w-3" />
                                    Converted
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Hammer className="h-3 w-3" />
                                    Generated
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Right: Preview & Scope Mappings */}
            {selectedBuiltin && (
              <>
                <Separator orientation="vertical" className="h-auto" />
                <div className="w-[380px] flex flex-col gap-3 overflow-hidden">
                  <div>
                    <Label className="text-sm font-semibold">Preview</Label>
                    <div className="mt-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="font-medium text-sm">{selectedBuiltin.name}</div>
                      {selectedBuiltin.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {selectedBuiltin.description}
                        </div>
                      )}
                      {(selectedBuiltin.variableDefaults || []).length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Variables:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(selectedBuiltin.variableDefaults || []).map((v) => (
                              <Badge key={v.name} variant="outline" className="text-xs">
                                {v.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex-1 overflow-y-auto">
                    <Label className="text-sm font-semibold">Scope Mappings</Label>
                    <div className="mt-2">
                      {(selectedBuiltin.variableDefaults || []).length > 0 ? (
                        <ScopeMappingEditor
                          availableScopes={availableScopes}
                          scopeMappings={scopeMappings}
                          variableDefaults={selectedBuiltin.variableDefaults || []}
                          onScopesChange={(scopes, mappings) => {
                            setAvailableScopes(scopes);
                            setScopeMappings(mappings);
                          }}
                          compact
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground italic p-3 bg-muted/20 rounded-md">
                          No variables to map
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 pb-4 pt-3 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleLinkBuiltin} disabled={isProcessing || !selectedBuiltinId}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              'Link Builtin'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

