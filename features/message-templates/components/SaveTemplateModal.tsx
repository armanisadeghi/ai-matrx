"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Tag, PanelLeft, Columns2 } from "lucide-react";
import { MessageRole } from "@/features/message-templates/types/message-templates-db";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { createTemplate, clearTemplateCache } from "@/features/message-templates/services/message-templates-service";
import { useToast } from "@/components/ui/use-toast";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

interface SaveTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: MessageRole;
    currentContent: string;
    onSave: (label: string, content: string, tags: string[]) => void;
}
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
                organization_id: await ensureOrgId(null),
                label: label.trim(),
                content: content.trim(),
                role: role,
                tags: tags,
                published_to_web: isPublic,
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
            // Declining the organization question is an answer, not a failure:
            // nothing was written and nothing is said.
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
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <Checkbox
                        id="template-public"
                        checked={isPublic}
                        onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                    />
                    <Label htmlFor="template-public" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        Publish to the web
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
                    className="flex-1"
                />
                <Button variant="primary" onClick={handleAddTag} disabled={!tagInput.trim()}>
                    <Plus className="w-4 h-4" />
                </Button>
                {!isMobile && (
                    <>
                        <Button
                            variant={previewMode === 'editor' ? "primary" : "outline"}
                            onClick={() => setPreviewMode('editor')}
                        >
                            <PanelLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={previewMode === 'split' ? "primary" : "outline"}
                            onClick={() => setPreviewMode('split')}
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
                        <EditableContextMenu
                            sourceFeature="messages"
                            contentSource={{ type: "raw" }}
                            getTextarea={() => textareaRef.current}
                            onTextReplace={setContent}
                            onTextInsertBefore={(text) => setContent(`${text}${content}`)}
                            onTextInsertAfter={(text) => setContent(`${content}${text}`)}
                        >
                            <ProTextarea sourceFeature="messages" autoGrow
                                ref={textareaRef}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Enter template content..."
                                className="font-mono text-sm"
                                minHeight={200}
                                maxHeight={600}
                            />
                        </EditableContextMenu>
                    </div>
                    {/* Preview */}
                    <div className="flex-1 p-3 bg-muted/30 overflow-y-auto">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <RichContent level="full" imagePolicy="self" source={content || ''} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-3 h-full">
                    <EditableContextMenu
                        sourceFeature="messages"
                        contentSource={{ type: "raw" }}
                        getTextarea={() => textareaRef.current}
                        onTextReplace={setContent}
                        onTextInsertBefore={(text) => setContent(`${text}${content}`)}
                        onTextInsertAfter={(text) => setContent(`${content}${text}`)}
                    >
                        <ProTextarea sourceFeature="messages" autoGrow
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Enter template content..."
                            className="font-mono text-sm"
                            minHeight={200}
                            maxHeight={600}
                        />
                    </EditableContextMenu>
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
            >
                Cancel
            </Button>
            <Button
                variant="primary" 
                onClick={handleSave}
                disabled={isSaving || !label.trim() || !content.trim()}
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
