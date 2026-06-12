"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, Loader2, Save, Trash2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/ui/use-toast";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { PLACEMENT_TYPES } from "../constants";
import type {
  AgentContentBlock,
  AgentShortcutCategory,
  ContentBlockFormData,
  ScopeProps,
} from "../types";

export interface ContentBlockFormProps extends ScopeProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (id: string | null) => void;
  contentBlock?: AgentContentBlock | null;
  categories: AgentShortcutCategory[];
}

function emptyFormData(): ContentBlockFormData {
  return {
    blockId: "",
    label: "",
    description: "",
    iconName: "FileText",
    categoryId: null,
    template: "",
    sortOrder: 0,
    isActive: true,
  };
}

function fromContentBlock(block: AgentContentBlock): ContentBlockFormData {
  return {
    blockId: block.blockId,
    label: block.label,
    description: block.description ?? "",
    iconName: block.iconName,
    categoryId: block.categoryId,
    template: block.template,
    sortOrder: block.sortOrder,
    isActive: block.isActive,
  };
}

export function ContentBlockForm({
  scope,
  scopeId,
  isOpen,
  onClose,
  onSuccess,
  contentBlock,
  categories,
}: ContentBlockFormProps) {
  const isMobile = useIsMobile();
  const isEditing = !!contentBlock;
  const crud = useAgentShortcutCrud({ scope, scopeId });
  const { toast } = useToast();

  const [formData, setFormData] = useState<ContentBlockFormData>(() =>
    contentBlock ? fromContentBlock(contentBlock) : emptyFormData(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const contentBlockCategories = categories.filter(
    (c) => c.placementType === PLACEMENT_TYPES.CONTENT_BLOCK,
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFormData(
      contentBlock ? fromContentBlock(contentBlock) : emptyFormData(),
    );
  }, [isOpen, contentBlock]);

  const handleChange = <K extends keyof ContentBlockFormData>(
    field: K,
    value: ContentBlockFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.label.trim()) {
      setError("Label is required");
      return;
    }
    if (!formData.blockId.trim()) {
      setError("Block ID is required");
      return;
    }
    if (!formData.template.trim()) {
      setError("Template content is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEditing && contentBlock) {
        await crud.updateContentBlock(contentBlock.id, {
          label: formData.label,
          description: formData.description || null,
          iconName: formData.iconName,
          categoryId: formData.categoryId,
          template: formData.template,
          sortOrder: formData.sortOrder,
          isActive: formData.isActive,
        });
        toast({ title: "Success", description: "Content block updated" });
        onSuccess?.(contentBlock.id);
      } else {
        const newId = await crud.createContentBlock(formData);
        toast({ title: "Success", description: "Content block created" });
        onSuccess?.(newId);
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save content block";
      setError(message);
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contentBlock) return;
    setDeleting(true);
    try {
      await crud.deleteContentBlock(contentBlock.id);
      toast({ title: "Success", description: "Content block deleted" });
      setShowDeleteConfirm(false);
      onSuccess?.(null);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete content block";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="content-block-label" className="text-sm">
            Label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="content-block-label"
            value={formData.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="Display name"
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="content-block-id" className="text-sm">
            Block ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="content-block-id"
            value={formData.blockId}
            onChange={(e) => handleChange("blockId", e.target.value)}
            placeholder="unique-key"
            className="h-9 text-[16px] font-mono"
            disabled={saving || isEditing}
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Stable identifier (lowercase, hyphens). Cannot change after
            creation.
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="content-block-description" className="text-sm">
          Description
        </Label>
        <Textarea
          id="content-block-description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Brief description of this block"
          rows={2}
          className="resize-none text-[16px]"
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-sm">Category</Label>
          <Select
            value={formData.categoryId ?? "_none_"}
            onValueChange={(value) =>
              handleChange("categoryId", value === "_none_" ? null : value)
            }
            disabled={saving}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">Uncategorised</SelectItem>
              {contentBlockCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm">Icon Name</Label>
          <IconInputWithValidation
            id="content-block-icon"
            value={formData.iconName}
            onChange={(value) => handleChange("iconName", value)}
            placeholder="FileText"
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="content-block-sort" className="text-sm">
            Sort Order
          </Label>
          <Input
            id="content-block-sort"
            type="number"
            value={formData.sortOrder}
            onChange={(e) =>
              handleChange("sortOrder", parseInt(e.target.value, 10) || 0)
            }
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="content-block-template" className="text-sm">
          Template <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="content-block-template"
          value={formData.template}
          onChange={(e) => handleChange("template", e.target.value)}
          placeholder="Enter the template content that will be inserted..."
          rows={isMobile ? 6 : 10}
          className="font-mono text-[16px] resize-none"
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border border-border rounded-md bg-muted/30">
        <Label className="text-sm font-normal cursor-pointer">
          Active (visible in menus)
        </Label>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => handleChange("isActive", checked)}
          disabled={saving}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const footer = (
    <>
      <div className="flex gap-2">
        {isEditing && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving || deleting}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={saving || deleting}
        >
          <X className="h-4 w-4 mr-1.5" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || deleting}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" />
              {isEditing ? "Save" : "Create"}
            </>
          )}
        </Button>
      </div>
    </>
  );

  const deleteConfirm = (
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Content Block</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{contentBlock?.label}&quot;?
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DrawerContent className="max-h-[92dvh] pb-safe">
            <DrawerHeader>
              <DrawerTitle>
                {isEditing ? "Edit Content Block" : "Create Content Block"}
              </DrawerTitle>
              <DrawerDescription>
                Reusable text template that can be inserted into any editor
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-3 overflow-y-auto">{body}</div>
            <DrawerFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
              {footer}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        {deleteConfirm}
      </>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <DialogTitle>
              {isEditing ? `Edit "${contentBlock?.label}"` : "Create Content Block"}
            </DialogTitle>
            <DialogDescription>
              Reusable text template that can be inserted into any editor
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pt-2 pb-2 overflow-y-auto flex-1">{body}</div>
          <DialogFooter className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
            {footer}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleteConfirm}
    </>
  );
}
