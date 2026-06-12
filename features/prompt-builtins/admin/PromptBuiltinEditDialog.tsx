'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, X, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { PromptBuiltinEditPanel } from './PromptBuiltinEditPanel';
import {
  ShortcutCategory,
  PromptBuiltin,
  PromptShortcut,
  CreatePromptShortcutInput,
} from '../types/core';
import {
  fetchShortcutCategories,
  updatePromptShortcut,
  deletePromptShortcut,
  createPromptShortcut,
  fetchPromptBuiltins,
} from '../services/admin-service';
import { getUserFriendlyError } from '../utils/error-handler';
import { SelectPromptForBuiltinModal } from './SelectPromptForBuiltinModal';
import { PromptSettingsModal } from '@/features/prompts/components/PromptSettingsModal';

interface PromptBuiltinEditDialogProps {
  shortcut: (PromptShortcut & { category?: ShortcutCategory; builtin?: PromptBuiltin }) | null;
  categories: ShortcutCategory[];
  builtins: PromptBuiltin[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenPromptModal: () => void;
  onOpenBuiltinEditor: (id: string) => void;
}

export function PromptBuiltinEditDialog({
  shortcut,
  categories,
  builtins,
  isOpen,
  onClose,
  onSuccess,
  onOpenPromptModal,
  onOpenBuiltinEditor,
}: PromptBuiltinEditDialogProps) {
  const { toast } = useToast();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editShortcutData, setEditShortcutData] = useState<Partial<PromptShortcut>>({});
  const isCreating = !shortcut;

  // Initialize edit data when shortcut changes
  useEffect(() => {
    if (shortcut) {
      setEditShortcutData(shortcut);
      setHasUnsavedChanges(false);
    } else {
      // Creating new shortcut
      setEditShortcutData({
        label: '',
        description: '',
        category_id: categories[0]?.id || '',
        icon_name: 'Zap',
        keyboard_shortcut: '',
        is_active: true,
        sort_order: 0,
        available_scopes: [],
        scope_mappings: {},
        prompt_builtin_id: null,
        // Execution Configuration defaults
        result_display: 'modal-full',
        auto_run: true,
        allow_chat: true,
        show_variables: false,
        apply_variables: true,
      });
      setHasUnsavedChanges(false);
    }
  }, [shortcut, categories]);

  const handleShortcutChange = (field: string, value: any) => {
    setEditShortcutData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!editShortcutData.label || !editShortcutData.category_id) {
      toast({ title: 'Error', description: 'Label and category are required', variant: 'destructive' });
      return;
    }

    try {
      if (isCreating) {
        await createPromptShortcut(editShortcutData as CreatePromptShortcutInput);
        toast({ title: 'Success', description: 'Shortcut created successfully' });
      } else {
        await updatePromptShortcut({
          id: editShortcutData.id!,
          prompt_builtin_id: editShortcutData.prompt_builtin_id,
          category_id: editShortcutData.category_id,
          label: editShortcutData.label,
          description: editShortcutData.description,
          icon_name: editShortcutData.icon_name,
          keyboard_shortcut: editShortcutData.keyboard_shortcut,
          sort_order: editShortcutData.sort_order,
          scope_mappings: editShortcutData.scope_mappings,
          available_scopes: editShortcutData.available_scopes,
          // Execution Configuration
          result_display: editShortcutData.result_display,
          auto_run: editShortcutData.auto_run,
          allow_chat: editShortcutData.allow_chat,
          show_variables: editShortcutData.show_variables,
          apply_variables: editShortcutData.apply_variables,
          is_active: editShortcutData.is_active,
        });
        toast({ title: 'Success', description: 'Shortcut updated successfully' });
      }
      
      setHasUnsavedChanges(false);
      onSuccess();
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({ 
        title: isCreating ? 'Failed to Create Shortcut' : 'Failed to Update Shortcut', 
        description: errorMessage,
        variant: 'destructive' 
      });
    }
  };

  const handleDelete = async () => {
    if (!editShortcutData.id || !confirm(`Delete shortcut "${editShortcutData.label}"?`)) return;
    
    try {
      await deletePromptShortcut(editShortcutData.id);
      toast({ title: 'Success', description: 'Shortcut deleted successfully' });
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDiscardChanges = () => {
    if (shortcut) {
      setEditShortcutData(shortcut);
    }
    setHasUnsavedChanges(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90dvh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle>
                {isCreating ? 'Create New Shortcut' : 'Edit Shortcut'}
              </DialogTitle>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  Unsaved Changes
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 pr-4">
              {hasUnsavedChanges && (
                <Button variant="outline" size="sm" onClick={handleDiscardChanges}>
                  <X className="w-4 h-4 mr-1" />
                  Discard
                </Button>
              )}
              <Button 
                size="sm"
                onClick={handleSave}
                disabled={!hasUnsavedChanges && !isCreating}
              >
                <Save className="w-4 h-4 mr-1" />
                {isCreating ? 'Create' : 'Save'}
              </Button>
              {!isCreating && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90dvh-8rem)]">
          <div className="p-2">
            <PromptBuiltinEditPanel
              selectedItem={{ type: 'shortcut', data: editShortcutData as any }}
              editCategoryData={{}}
              editShortcutData={editShortcutData}
              categories={categories}
              builtins={builtins}
              onCategoryChange={() => {}}
              onShortcutChange={handleShortcutChange}
              onOpenBuiltinEditor={onOpenBuiltinEditor}
              onOpenSelectPromptModal={onOpenPromptModal}
              onToast={toast}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

