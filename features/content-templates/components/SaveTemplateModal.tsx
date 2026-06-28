"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Tag, PanelLeft, Columns2 } from "lucide-react";
import { MessageRole } from "@/features/content-templates/types/content-templates-db";
import { useIsMobile } from "@/hooks/use-mobile";
import MarkdownStream from "@/components/MarkdownStream";
import { createTemplate, clearTemplateCache } from "@/features/content-templates/services/content-templates-service";
import { useToast } from "@/components/ui/use-toast";
// TODO(prompts-deletion): PromptEditorContextMenu removed with features/prompts.
// Re-implement with features/context-menu-v3/EditableContextMenu or a new content-block picker.

interface SaveTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: MessageRole;
    currentContent: string;
    onSave: (label: string, content: string, tags: string[]) => void;
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

export function SaveTemplateModal({
    isOpen,
    onClose,
    role,
    currentContent,
    onSave
}: SaveTemplateModalProps) {
    const [label, setLabel] = useState("");
    const [content, setContent] = useState(currentContent);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [previewMode, setPreviewMode] = useState<'editor' | 'split'>('split');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setLabel("");
            setContent(currentContent);
            setTags([]);
            setTagInput("");
            setIsPublic(false);
            setPreviewMode(isMobile ? 'editor' : 'split');
        }
    }, [isOpen, currentContent, isMobile]);

    const handleAddTag = () => {
        const trimmedTag = tagInput.trim();
        if (trimmedTag && !tags.includes(trimmedTag)) {
            setTags([...tags, trimmedTag]);
            setTagInput("");
        }
    };

    const handleRemoveTag = (tag: string) => {
        setTags(tags.filter(t => t !== tag));
    };

    const handleSave = async () => {
        if (!label.trim()) {
            toast({
                title: "Validation Error",
                description: "Please enter a template name",
                variant: "destructive"
            });
            return;
        }

        if (!content.trim()) {
            toast({
                title: "Validation Error",
                description: "Template content cannot be empty",
                variant: "destructive"
            });
            return;
        }

        try {
            setIsSaving(true);
            
            await createTemplate({
                label: label.trim(),
                content: content.trim(),
                role: role,
                tags: tags,
                is_public: isPublic,
                metadata: {}
            });

            clearTemplateCache();
            
            toast({
                title: "Success",
                description: "Template saved successfully",
                variant: "success"
            });

            onSave(label, content, tags);
            onClose();
        } catch (error) {
            console.error('Error saving template:', error);
            toast({
                title: "Error",
                description: "Failed to save template",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (!isSaving) {
            onClose();
        }
    };

    // Shared form fields - compact version
    const formFields = (
        <div className="p-3 space-y-2.5 border-b border-border/50">
            <div className="flex gap-2 pr-10">
                <div className="flex-1">
                    <Input
                        id="template-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Template name..."
                        className="h-9"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <Checkbox
                        id="template-public"
                        checked={isPublic}
                        onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                    />
                    <Label htmlFor="template-public" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        Public
                    </Label>
                </div>
            </div>

            <div className="flex gap-2">
                <Input
                    id="template-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add tags..."
                    className="flex-1 h-9"
                />
                <Button onClick={handleAddTag} disabled={!tagInput.trim()} size="sm" className="h-9">
                    <Plus className="w-4 h-4" />
                </Button>
                {!isMobile && (
                    <>
                        <Button
                            variant={previewMode === 'editor' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPreviewMode('editor')}
                            className="h-9"
                        >
                            <PanelLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={previewMode === 'split' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPreviewMode('split')}
                            className="h-9"
                        >
                            <Columns2 className="w-4 h-4" />
                        </Button>
                    </>
                )}
            </div>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="flex items-center gap-1 h-6 px-2 py-0">
                            <Tag className="w-3 h-3" />
                            <span className="text-xs">{tag}</span>
                            <X 
                                className="w-3 h-3 cursor-pointer hover:text-destructive" 
                                onClick={() => handleRemoveTag(tag)}
                            />
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );

    // Shared content editor - compact version
    const contentEditor = (
        <div className="flex-1 min-h-0">
            {previewMode === 'split' && !isMobile ? (
                <div className="flex h-full">
                    {/* Editor */}
                    <div className="flex-1 border-r border-border/50 p-3">
                        <AutoResizeTextarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Enter template content..."
                            className="font-mono text-sm"
                            minHeight={200}
                        />
                    </div>
                    {/* Preview */}
                    <div className="flex-1 p-3 bg-muted/30 overflow-y-auto">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <MarkdownStream 
                                content={content || ''} 
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-3 h-full">
                    <AutoResizeTextarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Enter template content..."
                        className="font-mono text-sm"
                        minHeight={200}
                    />
                </div>
            )}
        </div>
    );

    // Shared action buttons - compact
    const actionButtons = (
        <div className="flex-shrink-0 p-2.5 border-t border-border/50 bg-background flex gap-2 justify-end">
            <Button 
                variant="outline" 
                onClick={handleClose}
                disabled={isSaving}
                size="sm"
            >
                Cancel
            </Button>
            <Button 
                onClick={handleSave}
                disabled={isSaving || !label.trim() || !content.trim()}
                size="sm"
            >
                {isSaving ? 'Saving...' : 'Save'}
            </Button>
        </div>
    );

    if (isMobile) {
        return (
            <MobileOverlayWrapper
                isOpen={isOpen}
                onClose={handleClose}
                maxHeight="xl"
            >
                {/* Content flows naturally, MobileOverlayWrapper handles scrolling */}
                {formFields}
                {contentEditor}
                {/* Sticky buttons at bottom */}
                <div className="sticky bottom-0 z-10">
                    {actionButtons}
                </div>
            </MobileOverlayWrapper>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-5xl max-h-[90dvh] p-0 overflow-hidden flex flex-col gap-0">
                {formFields}
                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {contentEditor}
                </div>
                {/* Fixed buttons */}
                {actionButtons}
            </DialogContent>
        </Dialog>
    );
}

