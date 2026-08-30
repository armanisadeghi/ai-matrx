"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Copy, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/ui/use-toast";
import { getPlacementTypeMeta, PLACEMENT_TYPES } from "../constants";
import type { PlacementType } from "../constants";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { CategorySelect } from "./CategorySelect";
import type { AgentShortcutCategory, ScopeProps } from "../types";

export interface DuplicateCategoryModalProps extends ScopeProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newCategory: AgentShortcutCategory) => void;
  category: AgentShortcutCategory | null;
  /** All categories, used to populate the parent-category picker per placement. */
  categories: AgentShortcutCategory[];
}

const ROOT_VALUE = "_root_";

function getOwnershipBadge(category: AgentShortcutCategory) {
  if (category.userId) return { label: "User", variant: "secondary" as const };
  if (category.organizationId)
    return { label: "Organization", variant: "secondary" as const };
  if (category.projectId)
    return { label: "Project", variant: "secondary" as const };
  if (category.taskId) return { label: "Task", variant: "secondary" as const };
  return { label: "Global", variant: "outline" as const };
}

export function DuplicateCategoryModal({
  scope,
  scopeId,
  isOpen,
  onClose,
  onSuccess,
  category,
  categories,
}: DuplicateCategoryModalProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const crud = useAgentShortcutCrud({ scope, scopeId });

  const [label, setLabel] = useState("");
  const [placementType, setPlacementType] = useState<string>("");
  const [parentCategoryId, setParentCategoryId] = useState<string>(ROOT_VALUE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !category) return;
    setLabel(`${category.label} (Copy)`);
    setPlacementType(category.placementType);
    setParentCategoryId(category.parentCategoryId ?? ROOT_VALUE);
    setError(null);
    setSaving(false);
  }, [isOpen, category]);

  const availableParents = useMemo(() => {
    if (!placementType) return [];
    return categories.filter(
      (c) => c.placementType === placementType && c.id !== category?.id,
    );
  }, [categories, placementType, category?.id]);

  const placementChanged =
    category != null && placementType !== category.placementType;

  // If the user switches placement, the old parent no longer makes sense —
  // reset to root. Keep the parent as-is when they switch back.
  useEffect(() => {
    if (!category) return;
    if (placementType !== category.placementType) {
      setParentCategoryId(ROOT_VALUE);
    }
  }, [placementType, category]);

  const ownership = category ? getOwnershipBadge(category) : null;

  const handleDuplicate = async () => {
    if (!category) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label is required");
      return;
    }
    if (!placementType) {
      setError("Placement type is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await crud.duplicateCategory({
        id: category.id,
        label: trimmedLabel,
        placementType,
        parentCategoryId:
          parentCategoryId === ROOT_VALUE ? null : parentCategoryId,
      });
      toast({
        title: "Category duplicated",
        description: `"${result.label}" was created.`,
      });
      onSuccess?.(result);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to duplicate category";
      setError(message);
      toast({
        title: "Duplicate failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const body = category ? (
    <div className="space-y-4">
      <div className="p-3 rounded-md bg-muted/50 border border-border">
        <div className="text-xs text-muted-foreground mb-1">Duplicating</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{category.label}</span>
          {ownership && (
            <Badge variant={ownership.variant} className="text-[10px] h-4">
              {ownership.label}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] h-4">
            {getPlacementTypeMeta(category.placementType).label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          The copy keeps the same ownership ({ownership?.label.toLowerCase()}),
          description, icon, color, enabled features, and metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="dup-category-label" className="text-xs font-medium">
            New Label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="dup-category-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={saving}
            className="h-9 text-[16px]"
          />
        </div>
        <div>
          <Label
            htmlFor="dup-category-placement"
            className="text-xs font-medium"
          >
            Placement Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={placementType}
            onValueChange={setPlacementType}
            disabled={saving}
          >
            <SelectTrigger id="dup-category-placement" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLACEMENT_TYPES).map(([_key, value]) => {
                const meta = getPlacementTypeMeta(value);
                const count = categories.filter(
                  (c) => c.placementType === value,
                ).length;
                return (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">
                        ({count})
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium">Parent Category</Label>
        {availableParents.length > 0 ? (
          <CategorySelect
            categories={categories}
            placementFilter={placementType as PlacementType}
            excludedIds={category ? new Set([category.id]) : undefined}
            value={parentCategoryId}
            onValueChange={setParentCategoryId}
            rootOption={{ value: ROOT_VALUE, label: "None (root level)" }}
            placeholder="None (root level)"
            className="h-9"
            disabled={saving}
            compact
          />
        ) : (
          <div className="h-9 px-3 py-2 rounded-md border border-border bg-muted/50 flex items-center text-xs text-muted-foreground">
            No categories available in this placement — will be root-level
          </div>
        )}
        {placementChanged && (
          <p className="text-xs text-muted-foreground mt-1">
            Parent was reset because the placement changed.
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  ) : null;

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} disabled={saving} size="sm">
        Cancel
      </Button>
      <Button
        onClick={handleDuplicate}
        disabled={saving || !category}
        size="sm"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            Duplicating...
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 mr-1.5" />
            Duplicate
          </>
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92dvh] pb-safe">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              Duplicate Category
            </DrawerTitle>
            <DrawerDescription>
              Create a copy with an optional new name or placement.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-3 overflow-y-auto">{body}</div>
          <DrawerFooter className="flex-row gap-2 justify-end">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Duplicate Category
          </DialogTitle>
          <DialogDescription>
            Create a copy with an optional new name or placement.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">{body}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
