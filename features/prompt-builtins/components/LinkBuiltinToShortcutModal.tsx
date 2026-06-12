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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  AlertCircle,
  Plus,
  Link2,
  CheckCircle2,
  Search,
  Zap,
} from 'lucide-react';
import { toast } from '@/lib/toast-service';
import { ShortcutFormFields } from './ShortcutFormFields';
import { ScopeMappingEditor } from './ScopeMappingEditor';
import { getPlacementTypeMeta } from '../constants';
import {
  fetchShortcutCategories,
  fetchShortcutsWithRelations,
  createPromptShortcut,
  updatePromptShortcut,
} from '../services/admin-service';
import type {
  PromptBuiltin,
  ShortcutCategory,
  PromptShortcut,
  CreatePromptShortcutInput,
  ScopeMapping,
} from '../types/core';
import { filterAndSortBySearch } from '@/utils/search-scoring';

interface LinkBuiltinToShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  builtin: PromptBuiltin;
  onSuccess?: () => void;
}

interface ShortcutWithRelations extends PromptShortcut {
  category: ShortcutCategory | null;
  builtin: PromptBuiltin | null;
}

const DEFAULT_AVAILABLE_SCOPES = ['selection', 'content', 'context'];

export function LinkBuiltinToShortcutModal({
  isOpen,
  onClose,
  builtin,
  onSuccess,
}: LinkBuiltinToShortcutModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'link'>('create');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  // Data loading
  const [categories, setCategories] = useState<ShortcutCategory[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutWithRelations[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Link existing shortcut
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(null);
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [existingShortcutScopes, setExistingShortcutScopes] = useState<string[]>(DEFAULT_AVAILABLE_SCOPES);
  const [existingShortcutMappings, setExistingShortcutMappings] = useState<ScopeMapping>({});

  // Create new shortcut
  const [newShortcutData, setNewShortcutData] = useState<CreatePromptShortcutInput>({
    label: builtin.name,
    category_id: '',
    description: builtin.description,
    icon_name: null,
    result_display: 'modal-full',
    auto_run: true,
    allow_chat: true,
    show_variables: false,
    apply_variables: true,
    available_scopes: DEFAULT_AVAILABLE_SCOPES,
    scope_mappings: {},
  });

  // Load categories and shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoadingData(true);
      setError('');

      try {
        const [categoriesData, shortcutsData] = await Promise.all([
          fetchShortcutCategories({ is_active: true }),
          fetchShortcutsWithRelations({ is_active: true }),
        ]);

        setCategories(categoriesData);
        setShortcuts(shortcutsData as ShortcutWithRelations[]);

        // Auto-select first category
        if (categoriesData.length > 0 && !newShortcutData.category_id) {
          setNewShortcutData((prev) => ({
            ...prev,
            category_id: categoriesData[0].id,
          }));
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load categories and shortcuts');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [isOpen]);

  // Update scope mappings when selecting existing shortcut
  useEffect(() => {
    if (selectedShortcutId) {
      const shortcut = shortcuts.find((s) => s.id === selectedShortcutId);
      if (shortcut) {
        setExistingShortcutScopes(shortcut.available_scopes || DEFAULT_AVAILABLE_SCOPES);
        setExistingShortcutMappings(shortcut.scope_mappings || {});
      }
    }
  }, [selectedShortcutId, shortcuts]);

  // Filter shortcuts
  const filteredShortcuts = useMemo(() => {
    let filtered = showOnlyUnlinked
      ? shortcuts.filter((s) => !s.prompt_builtin_id)
      : shortcuts;

    if (searchQuery) {
      filtered = filterAndSortBySearch(filtered, searchQuery, [
        { get: (s) => s.label, weight: 'title' },
        { get: (s) => s.category?.label, weight: 'subtitle' },
        { get: (s) => s.description, weight: 'body' },
      ]);
    }

    return filtered;
  }, [shortcuts, showOnlyUnlinked, searchQuery]);

  const handleCreateShortcut = async () => {
    if (!newShortcutData.label || !newShortcutData.category_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      await createPromptShortcut({
        ...newShortcutData,
        prompt_builtin_id: builtin.id,
      });

      toast.success('Shortcut created and linked successfully!');
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error('Error creating shortcut:', err);
      setError(err.message || 'Failed to create shortcut');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkExistingShortcut = async () => {
    if (!selectedShortcutId) {
      toast.error('Please select a shortcut');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      await updatePromptShortcut({
        id: selectedShortcutId,
        prompt_builtin_id: builtin.id,
        available_scopes: existingShortcutScopes,
        scope_mappings: existingShortcutMappings,
      });

      toast.success('Shortcut linked successfully!');
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error('Error linking shortcut:', err);
      setError(err.message || 'Failed to link shortcut');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setActiveTab('create');
    setSelectedShortcutId(null);
    setSearchQuery('');
    setError('');
    setNewShortcutData({
      label: builtin.name,
      category_id: categories[0]?.id || '',
      description: builtin.description,
      icon_name: null,
      result_display: 'modal-full',
      auto_run: true,
      allow_chat: true,
      show_variables: false,
      apply_variables: true,
      available_scopes: DEFAULT_AVAILABLE_SCOPES,
      scope_mappings: {},
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle>Link Shortcut to &quot;{builtin.name}&quot;</DialogTitle>
          <DialogDescription>
            Create a new shortcut or link an existing one to this builtin
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'create' | 'link')} className="flex-1 flex flex-col overflow-hidden px-4 pt-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New
                </TabsTrigger>
                <TabsTrigger value="link">
                  <Link2 className="h-4 w-4 mr-2" />
                  Link Existing
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden mt-4">
                <TabsContent value="create" className="h-full overflow-y-auto mt-0 pr-2">
                  <ShortcutFormFields
                    formData={newShortcutData}
                    onChange={(updates) =>
                      setNewShortcutData((prev) => ({ ...prev, ...updates }))
                    }
                    categories={categories}
                    builtinVariables={builtin.variableDefaults || []}
                    excludedPlacementTypes={['content-block', 'quick-action']}
                    compact
                  />
                </TabsContent>

                <TabsContent value="link" className="h-full overflow-hidden mt-0 space-y-3">
                  {/* Filter Controls */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search shortcuts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {filteredShortcuts.length} shortcut{filteredShortcuts.length !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="unlinked-filter" className="text-xs font-normal">
                          Unlinked only
                        </Label>
                        <Switch
                          id="unlinked-filter"
                          checked={showOnlyUnlinked}
                          onCheckedChange={setShowOnlyUnlinked}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Shortcuts List */}
                  {filteredShortcuts.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {showOnlyUnlinked
                          ? 'No unlinked shortcuts available'
                          : searchQuery
                          ? 'No shortcuts match your search'
                          : 'No shortcuts available'}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2 pr-4">
                        {filteredShortcuts.map((shortcut) => {
                          const category = shortcut.category;
                          const placementMeta = category
                            ? getPlacementTypeMeta(category.placement_type)
                            : null;
                          const isSelected = selectedShortcutId === shortcut.id;

                          return (
                            <div
                              key={shortcut.id}
                              onClick={() => setSelectedShortcutId(shortcut.id)}
                              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-primary/10 border-primary'
                                  : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{shortcut.label}</div>
                                  {shortcut.description && (
                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                      {shortcut.description}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    {category && (
                                      <Badge variant="outline" className="text-xs">
                                        {category.label}
                                      </Badge>
                                    )}
                                    {placementMeta && (
                                      <Badge variant="secondary" className="text-xs">
                                        {placementMeta.label}
                                      </Badge>
                                    )}
                                    {shortcut.auto_run && (
                                      <Badge variant="outline" className="text-xs gap-1">
                                        <Zap className="h-3 w-3" />
                                        Auto
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

                  {/* Scope Mappings for Selected Shortcut */}
                  {selectedShortcutId && (
                    <div className="space-y-2 pt-3 border-t">
                      <Label className="text-sm font-semibold">Scope Mappings</Label>
                      <ScopeMappingEditor
                        availableScopes={existingShortcutScopes}
                        scopeMappings={existingShortcutMappings}
                        variableDefaults={builtin.variableDefaults || []}
                        onScopesChange={(scopes, mappings) => {
                          setExistingShortcutScopes(scopes);
                          setExistingShortcutMappings(mappings);
                        }}
                        compact
                      />
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>

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
              <Button
                onClick={
                  activeTab === 'create'
                    ? handleCreateShortcut
                    : handleLinkExistingShortcut
                }
                disabled={
                  isProcessing ||
                  (activeTab === 'create' &&
                    (!newShortcutData.label || !newShortcutData.category_id)) ||
                  (activeTab === 'link' && !selectedShortcutId)
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : activeTab === 'create' ? (
                  'Create & Link'
                ) : (
                  'Link Shortcut'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

