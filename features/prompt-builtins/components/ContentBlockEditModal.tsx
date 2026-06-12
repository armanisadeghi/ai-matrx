'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { ContentBlockDB } from '@/types/content-blocks-db';
import { ShortcutCategory } from '../types/core';
import { updateContentBlock, deleteContentBlock } from '../services/admin-service';
import { Save, X, Trash2, Columns2, PanelLeft, FileText } from 'lucide-react';
import MarkdownStream from '@/components/MarkdownStream';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ContentBlockEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contentBlock: ContentBlockDB | null;
  categories: ShortcutCategory[];
}

// Auto-resizing textarea component
const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    minHeight?: number;
  }
>(({ className, value, onChange, minHeight = 100, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  React.useImperativeHandle(ref, () => textareaRef.current!);
  
  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.max(minHeight, scrollHeight) + 'px';
    }
  }, [minHeight]);
  
  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);
  
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      adjustHeight();
      window.addEventListener('resize', adjustHeight);
      return () => window.removeEventListener('resize', adjustHeight);
    }
  }, [adjustHeight]);
  
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    setTimeout(adjustHeight, 0);
  };
  
  return (
    <textarea
      ref={textareaRef}
      className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden ${className}`}
      value={value}
      onChange={handleChange}
      style={{ minHeight: minHeight + 'px' }}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = 'AutoResizeTextarea';

export function ContentBlockEditModal({
  isOpen,
  onClose,
  onSuccess,
  contentBlock,
  categories,
}: ContentBlockEditModalProps) {
  const [editData, setEditData] = useState<Partial<ContentBlockDB>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview'>('preview');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Initialize edit data when content block changes
  useEffect(() => {
    if (contentBlock) {
      setEditData({
        id: contentBlock.id,
        block_id: contentBlock.block_id,
        label: contentBlock.label,
        description: contentBlock.description,
        icon_name: contentBlock.icon_name,
        category_id: contentBlock.category_id,
        template: contentBlock.template,
        sort_order: contentBlock.sort_order,
        is_active: contentBlock.is_active,
      });
      setHasUnsavedChanges(false);
      setPreviewMode('preview');
    }
  }, [contentBlock]);

  const handleChange = (field: string, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!editData.id) return;

    try {
      setIsSaving(true);
      await updateContentBlock({
        id: editData.id,
        label: editData.label,
        description: editData.description,
        icon_name: editData.icon_name,
        category_id: editData.category_id,
        template: editData.template,
        sort_order: editData.sort_order,
        is_active: editData.is_active,
      });

      toast({
        title: 'Success',
        description: `Content block "${editData.label}" updated successfully.`,
        variant: 'success',
      });

      setHasUnsavedChanges(false);
      onSuccess();
    } catch (error) {
      console.error('Error saving content block:', error);
      toast({
        title: 'Error',
        description: 'Failed to save content block',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editData.id) return;

    if (!confirm(`Are you sure you want to delete "${editData.label}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteContentBlock(editData.id);

      toast({
        title: 'Success',
        description: 'Content block deleted successfully.',
      });

      onClose();
      onSuccess();
    } catch (error) {
      console.error('Error deleting content block:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content block',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDiscard = () => {
    if (contentBlock) {
      setEditData({
        id: contentBlock.id,
        block_id: contentBlock.block_id,
        label: contentBlock.label,
        description: contentBlock.description,
        icon_name: contentBlock.icon_name,
        category_id: contentBlock.category_id,
        template: contentBlock.template,
        sort_order: contentBlock.sort_order,
        is_active: contentBlock.is_active,
      });
      setHasUnsavedChanges(false);
    }
  };

  if (!contentBlock) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90dvh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <DialogTitle className="text-base">Edit Content Block</DialogTitle>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs px-1.5 py-0">
                  Unsaved
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {hasUnsavedChanges && (
                <Button variant="outline" size="sm" onClick={handleDiscard} className="h-7 text-xs">
                  <X className="w-3.5 h-3.5 mr-1" />
                  Discard
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={!hasUnsavedChanges || isSaving} className="h-7 text-xs">
                <Save className="w-3.5 h-3.5 mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="h-7 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-3 p-4 pb-6">
            {/* Basic Information */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edit-label" className="text-xs">Label</Label>
                    <Input
                      id="edit-label"
                      value={editData.label || ''}
                      onChange={(e) => handleChange('label', e.target.value)}
                      placeholder="Display name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-block-id" className="text-xs">Block ID</Label>
                    <Input
                      id="edit-block-id"
                      value={editData.block_id || ''}
                      disabled
                      className="bg-gray-50 dark:bg-gray-800 h-8 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-description" className="text-xs">Description</Label>
                  <AutoResizeTextarea
                    id="edit-description"
                    value={editData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Brief description of this block"
                    minHeight={40}
                    className="text-sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="edit-category" className="text-xs">Category</Label>
                    <Select
                      value={editData.category_id || ''}
                      onValueChange={(value) => handleChange('category_id', value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter(cat => cat.placement_type === 'content-block')
                          .map(category => (
                            <React.Fragment key={category.id}>
                              <SelectItem value={category.id}>{category.label}</SelectItem>
                            </React.Fragment>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-icon" className="text-xs">Icon Name</Label>
                    <Input
                      id="edit-icon"
                      value={editData.icon_name || ''}
                      onChange={(e) => handleChange('icon_name', e.target.value)}
                      placeholder="FileText"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-sort-order" className="text-xs">Sort Order</Label>
                    <Input
                      id="edit-sort-order"
                      type="number"
                      value={editData.sort_order || 0}
                      onChange={(e) => handleChange('sort_order', parseInt(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-is-active"
                    checked={editData.is_active !== false}
                    onCheckedChange={(checked) => handleChange('is_active', checked)}
                  />
                  <Label htmlFor="edit-is-active" className="text-xs">Active (visible in context menus)</Label>
                </div>
              </CardContent>
            </Card>

            {/* Template Content */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Template Content</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={previewMode === 'editor' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPreviewMode('editor')}
                      className="h-7 text-xs gap-1.5"
                    >
                      <PanelLeft className="w-3.5 h-3.5" />
                      Editor
                    </Button>
                    <Button
                      variant={previewMode === 'preview' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPreviewMode('preview')}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      Preview
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <div className={previewMode === 'preview' ? 'flex flex-col lg:flex-row gap-3 items-stretch' : ''}>
                  {/* Editor Section */}
                  <div className={previewMode === 'preview' ? 'flex-1 min-w-0' : ''}>
                    <AutoResizeTextarea
                      value={editData.template || ''}
                      onChange={(e) => handleChange('template', e.target.value)}
                      placeholder="Enter the template content that will be inserted..."
                      className="font-mono text-sm h-full"
                      minHeight={250}
                    />
                  </div>

                  {/* Preview Section */}
                  {previewMode === 'preview' && (
                    <div className="flex-1 min-w-0 min-h-[250px] border-border rounded-lg p-3 bg-textured overflow-auto">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownStream content={editData.template || ''} />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

