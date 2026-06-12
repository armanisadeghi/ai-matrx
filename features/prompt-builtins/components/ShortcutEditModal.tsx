/**
 * ShortcutEditModal
 * 
 * Unified modal for creating/editing prompt shortcuts.
 * - Uses ShortcutFormFields as the single source of truth
 * - Supports both standalone mode and from-builtin mode
 * - Tracks unsaved changes
 * - Provides Delete functionality
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, X, Trash2, Loader2, AlertCircle, Copy } from 'lucide-react';
import { ShortcutFormFields } from './ShortcutFormFields';
import { SelectPromptForBuiltinModal } from '../admin/SelectPromptForBuiltinModal';
import { PromptSettingsModal } from '@/features/prompts/components/PromptSettingsModal';
import { DuplicateShortcutModal } from './DuplicateShortcutModal';
import {
  createPromptShortcut,
  updatePromptShortcut,
  deletePromptShortcut,
  fetchPromptBuiltins,
} from '../services/admin-service';
import type {
  PromptShortcut,
  ShortcutCategory,
  PromptBuiltin,
  CreatePromptShortcutInput,
} from '../types/core';
import { getUserFriendlyError } from '../utils/error-handler';

interface ShortcutEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shortcut?: PromptShortcut & { category?: ShortcutCategory; builtin?: PromptBuiltin } | null;
  categories: ShortcutCategory[];
  builtins: PromptBuiltin[];
  mode?: 'from-builtin' | 'standalone';
  models?: any[];
  availableTools?: any[];
}

export function ShortcutEditModal({
  isOpen,
  onClose,
  onSuccess,
  shortcut = null,
  categories,
  builtins,
  mode = 'standalone',
  models = [],
  availableTools = [],
}: ShortcutEditModalProps) {
  const isCreating = !shortcut;
  
  const [formData, setFormData] = useState<Partial<CreatePromptShortcutInput>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // Modal states
  const [isCreateBuiltinModalOpen, setIsCreateBuiltinModalOpen] = useState(false);
  const [isEditBuiltinModalOpen, setIsEditBuiltinModalOpen] = useState(false);
  const [editingBuiltinId, setEditingBuiltinId] = useState<string | null>(null);
  const [localBuiltins, setLocalBuiltins] = useState<PromptBuiltin[]>(builtins);
  
  // Confirmation dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Initialize form data
  useEffect(() => {
    if (shortcut) {
      setFormData({
        id: shortcut.id,
        label: shortcut.label,
        description: shortcut.description,
        category_id: shortcut.category_id,
        icon_name: shortcut.icon_name,
        keyboard_shortcut: shortcut.keyboard_shortcut,
        sort_order: shortcut.sort_order,
        prompt_builtin_id: shortcut.prompt_builtin_id,
        available_scopes: shortcut.available_scopes || [],
        scope_mappings: shortcut.scope_mappings || null,
        result_display: shortcut.result_display || 'modal-full',
        auto_run: shortcut.auto_run ?? true,
        allow_chat: shortcut.allow_chat ?? true,
        show_variables: shortcut.show_variables ?? false,
        apply_variables: shortcut.apply_variables ?? true,
        is_active: shortcut.is_active ?? true,
      });
      setHasUnsavedChanges(false);
    } else {
      // Creating new shortcut
      setFormData({
        label: '',
        description: '',
        category_id: categories[0]?.id || '',
        icon_name: 'Wand2',
        keyboard_shortcut: '',
        sort_order: 0,
        prompt_builtin_id: null,
        available_scopes: [],
        scope_mappings: null,
        result_display: 'modal-full',
        auto_run: true,
        allow_chat: true,
        show_variables: false,
        apply_variables: true,
        is_active: true,
      });
      setHasUnsavedChanges(false);
    }
  }, [shortcut, categories]);

  // Update local builtins when prop changes
  useEffect(() => {
    setLocalBuiltins(builtins);
  }, [builtins]);

  const handleChange = (updates: Partial<CreatePromptShortcutInput>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!formData.label || !formData.category_id) {
      setError('Label and category are required');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      if (isCreating) {
        await createPromptShortcut(formData as CreatePromptShortcutInput);
      } else {
        await updatePromptShortcut({
          id: formData.id!,
          ...formData,
        });
      }
      
      setHasUnsavedChanges(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving shortcut:', err);
      setError(getUserFriendlyError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!formData.id) return;

    setIsProcessing(true);
    setError('');
    setShowDeleteConfirm(false);

    try {
      await deletePromptShortcut(formData.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error deleting shortcut:', err);
      setError(getUserFriendlyError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = () => {
    if (shortcut) {
      setFormData({
        id: shortcut.id,
        label: shortcut.label,
        description: shortcut.description,
        category_id: shortcut.category_id,
        icon_name: shortcut.icon_name,
        keyboard_shortcut: shortcut.keyboard_shortcut,
        sort_order: shortcut.sort_order,
        prompt_builtin_id: shortcut.prompt_builtin_id,
        available_scopes: shortcut.available_scopes || [],
        scope_mappings: shortcut.scope_mappings || null,
        result_display: shortcut.result_display || 'modal-full',
        auto_run: shortcut.auto_run ?? true,
        allow_chat: shortcut.allow_chat ?? true,
        show_variables: shortcut.show_variables ?? false,
        apply_variables: shortcut.apply_variables ?? true,
        is_active: shortcut.is_active ?? true,
      });
    }
    setHasUnsavedChanges(false);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleDiscardConfirm = () => {
    setShowDiscardConfirm(false);
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleOpenBuiltinEditor = (builtinId: string) => {
    setEditingBuiltinId(builtinId);
    setIsEditBuiltinModalOpen(true);
  };

  const handleUpdateBuiltin = async (builtinId: string, updates: any) => {
    // Reload builtins to get the latest data
    const updatedBuiltins = await fetchPromptBuiltins({ is_active: true });
    setLocalBuiltins(updatedBuiltins);
    setHasUnsavedChanges(true);
  };

  const selectedBuiltin = localBuiltins.find(b => b.id === formData.prompt_builtin_id);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle>
              {isCreating ? 'Create Shortcut' : `Edit "${shortcut?.label}"`}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pt-1 pb-2">
              <ShortcutFormFields
                formData={formData as CreatePromptShortcutInput}
                onChange={handleChange}
                categories={categories}
                builtins={localBuiltins}
                builtinVariables={selectedBuiltin?.variableDefaults || []}
                mode={mode}
                onOpenBuiltinEditor={handleOpenBuiltinEditor}
                onOpenCreateBuiltin={() => setIsCreateBuiltinModalOpen(true)}
              />

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between px-4 pb-4 pt-3 border-t">
            <div className="flex gap-2">
              {!isCreating && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDuplicateModal(true)}
                    disabled={isProcessing}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isProcessing}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
            </div>

            <div className="flex gap-2">
              {hasUnsavedChanges && !isCreating && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4 mr-2" />
                  Discard
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isProcessing || !formData.label || !formData.category_id}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {isCreating ? 'Create' : 'Save'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Builtin Modal */}
      {isCreateBuiltinModalOpen && (
        <SelectPromptForBuiltinModal
          isOpen={isCreateBuiltinModalOpen}
          onClose={() => setIsCreateBuiltinModalOpen(false)}
          shortcutId={formData.id || null as any}
          shortcutData={{
            label: formData.label || '',
            available_scopes: formData.available_scopes || [],
          }}
          onSuccess={async (builtinId) => {
            handleChange({ prompt_builtin_id: builtinId });
            const updatedBuiltins = await fetchPromptBuiltins({ is_active: true });
            setLocalBuiltins(updatedBuiltins);
            setIsCreateBuiltinModalOpen(false);
          }}
        />
      )}

      {/* Edit Builtin Modal */}
      {isEditBuiltinModalOpen && editingBuiltinId && (() => {
        const builtin = localBuiltins.find(b => b.id === editingBuiltinId);
        if (!builtin) return null;

        return (
          <PromptSettingsModal
            isOpen={isEditBuiltinModalOpen}
            onClose={() => {
              setIsEditBuiltinModalOpen(false);
              setEditingBuiltinId(null);
            }}
            promptId={builtin.id}
            promptName={builtin.name}
            promptDescription={builtin.description || ''}
            variableDefaults={builtin.variableDefaults || []}
            messages={builtin.messages || []}
            settings={builtin.settings || {}}
            models={models}
            availableTools={availableTools}
            onUpdate={handleUpdateBuiltin}
            onLocalStateUpdate={() => {}}
          />
        );
      })()}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shortcut</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{formData.label}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardConfirm}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Shortcut Modal */}
      {!isCreating && shortcut && (
        <DuplicateShortcutModal
          isOpen={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => {
            setShowDuplicateModal(false);
            onSuccess(); // Reload data in parent
          }}
          shortcut={shortcut}
          categories={categories}
        />
      )}
    </>
  );
}

