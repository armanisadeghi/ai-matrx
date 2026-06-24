"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, Copy, Loader2, Save, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { useToast } from "@/components/ui/use-toast";
import { CategoryColorPicker } from "./CategoryColorPicker";
import { ShortcutContextsPicker } from "./ShortcutContextsPicker";
import { CategorySelect } from "./CategorySelect";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { PLACEMENT_TYPES, getPlacementTypeMeta } from "../constants";
import {
  isValidShortcutContext,
  type ShortcutContext,
} from "@/features/agents/utils/shortcut-context-utils";
import type {
  AgentShortcutCategory,
  CategoryFormData,
  PlacementType,
  ScopeProps,
} from "../types";

export interface CategoryFormProps extends ScopeProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (category: AgentShortcutCategory | null) => void;
  /**
   * Invoked when the user clicks "Duplicate" in edit mode. The parent owns
   * presenting the duplicate modal so the edit form can close cleanly first.
   */
  onDuplicate?: (category: AgentShortcutCategory) => void;
  allCategories: AgentShortcutCategory[];
  editingCategory?: AgentShortcutCategory | null;
  defaultPlacementType?: PlacementType;
  defaultParentCategoryId?: string | null;
}

function emptyFormData(
  placementType: PlacementType,
  parentCategoryId: string | null,
): CategoryFormData {
  return {
    label: "",
    placementType,
    parentCategoryId,
    description: "",
    iconName: "Folder",
    color: "#64748b",
    sortOrder: 999,
    isActive: true,
    enabledFeatures: [],
    metadata: {},
  };
}

function fromCategory(category: AgentShortcutCategory): CategoryFormData {
  const raw = category.enabledFeatures ?? [];
  const enabledFeatures: ShortcutContext[] = raw.filter(
    (t): t is ShortcutContext => isValidShortcutContext(t),
  );
  return {
    label: category.label,
    placementType: category.placementType as PlacementType,
    parentCategoryId: category.parentCategoryId,
    description: category.description ?? "",
    iconName: category.iconName ?? "Folder",
    color: category.color ?? "#64748b",
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    enabledFeatures,
    metadata: category.metadata ?? {},
  };
}

function validate(data: CategoryFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.label.trim()) errors.label = "Label is required";
  if (!data.placementType) errors.placementType = "Placement type is required";
  if (!data.iconName.trim()) errors.iconName = "Icon name is required";
  if (!data.color.trim()) errors.color = "Color is required";
  return errors;
}

export function CategoryForm({
  scope,
  scopeId,
  isOpen,
  onClose,
  onSuccess,
  onDuplicate,
  allCategories,
  editingCategory,
  defaultPlacementType,
  defaultParentCategoryId,
}: CategoryFormProps) {
  const isMobile = useIsMobile();
  const isEditMode = !!editingCategory;
  const crud = useAgentShortcutCrud({ scope, scopeId });
  const { toast } = useToast();

  const initialPlacement =
    defaultPlacementType ??
    (Object.values(PLACEMENT_TYPES)[0] as PlacementType);

  const [formData, setFormData] = useState<CategoryFormData>(() =>
    editingCategory
      ? fromCategory(editingCategory)
      : emptyFormData(initialPlacement, defaultParentCategoryId ?? null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormData(
      editingCategory
        ? fromCategory(editingCategory)
        : emptyFormData(
            defaultPlacementType ?? initialPlacement,
            defaultParentCategoryId ?? null,
          ),
    );
  }, [
    isOpen,
    editingCategory,
    defaultPlacementType,
    defaultParentCategoryId,
    initialPlacement,
  ]);

  const availableParents = useMemo(() => {
    return allCategories.filter(
      (c) =>
        c.placementType === formData.placementType &&
        c.id !== editingCategory?.id,
    );
  }, [allCategories, formData.placementType, editingCategory?.id]);

  const handleChange = <K extends keyof CategoryFormData>(
    field: K,
    value: CategoryFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && editingCategory) {
        await crud.updateCategory(editingCategory.id, {
          label: formData.label,
          placementType: formData.placementType,
          parentCategoryId: formData.parentCategoryId,
          description: formData.description || null,
          iconName: formData.iconName,
          color: formData.color,
          sortOrder: formData.sortOrder,
          isActive: formData.isActive,
          enabledFeatures: formData.enabledFeatures,
          metadata: formData.metadata,
        });
        toast({
          title: "Success",
          description: "Category updated successfully",
        });
      } else {
        await crud.createCategory(formData);
        toast({
          title: "Success",
          description: "Category created successfully",
        });
      }
      onSuccess?.(null);
      onClose();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to save category";
      toast({
        title: isEditMode ? "Update failed" : "Create failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">
            Label <span className="text-destructive">*</span>
          </Label>
          <Input
            value={formData.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="Category name"
            disabled={saving}
            className="h-9 text-[16px]"
          />
          {errors.label && (
            <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.label}
            </p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium">
            Placement Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.placementType}
            onValueChange={(value) => {
              handleChange("placementType", value as PlacementType);
              if (formData.parentCategoryId) {
                const parent = allCategories.find(
                  (c) => c.id === formData.parentCategoryId,
                );
                if (parent && parent.placementType !== value) {
                  handleChange("parentCategoryId", null);
                }
              }
            }}
            disabled={saving}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLACEMENT_TYPES).map(([_key, value]) => {
                const meta = getPlacementTypeMeta(value);
                return (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">
                        ({value})
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
            categories={allCategories}
            placementFilter={formData.placementType}
            excludedIds={
              editingCategory ? new Set([editingCategory.id]) : undefined
            }
            value={formData.parentCategoryId ?? "_root_"}
            onValueChange={(value) =>
              handleChange(
                "parentCategoryId",
                value === "_root_" ? null : value,
              )
            }
            rootOption={{ value: "_root_", label: "None (root level)" }}
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
      </div>

      <div>
        <Label className="text-xs font-medium">Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Optional description"
          rows={2}
          disabled={saving}
          className="text-[16px] resize-none"
        />
      </div>

      <div>
        <Label className="text-xs font-medium">Enabled features</Label>
        <p className="text-xs text-muted-foreground mb-1.5">
          Pick the surfaces this category applies to. Leave empty to apply
          everywhere.
        </p>
        <ShortcutContextsPicker
          value={formData.enabledFeatures}
          onChange={(value) => handleChange("enabledFeatures", value)}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Icon Name</Label>
          <IconInputWithValidation
            id="category-icon-name"
            value={formData.iconName}
            onChange={(value) => handleChange("iconName", value)}
            placeholder="e.g., Folder"
            disabled={saving}
            className="h-9 text-[16px]"
            showLucideLink
          />
          {errors.iconName && (
            <p className="text-xs text-destructive mt-0.5">{errors.iconName}</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium">Color</Label>
          <CategoryColorPicker
            value={formData.color}
            onChange={(color) => handleChange("color", color)}
            disabled={saving}
          />
          {errors.color && (
            <p className="text-xs text-destructive mt-0.5">{errors.color}</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium">Sort Order</Label>
          <Input
            type="number"
            value={formData.sortOrder}
            onChange={(e) =>
              handleChange("sortOrder", parseInt(e.target.value, 10) || 0)
            }
            disabled={saving}
            className="h-9 text-[16px]"
          />
          <p className="text-xs text-muted-foreground mt-0.5">Lower = first</p>
        </div>
      </div>

      <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium cursor-pointer">
            Active Status
          </Label>
          <Badge
            variant={formData.isActive ? "default" : "secondary"}
            className="text-[10px] h-4"
          >
            {formData.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => handleChange("isActive", checked)}
          disabled={saving}
        />
      </div>

      <div className="p-2.5 rounded-md border border-border bg-card">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          Preview
        </p>
        <div className="flex items-center gap-2">
          <DynamicIcon
            name={formData.iconName}
            color={formData.color || "zinc"}
            size={4}
            fallbackIcon="SquareMenu"
            className="flex-shrink-0"
          />
          <span className="text-sm font-medium">
            {formData.label || "Category Name"}
          </span>
          {formData.parentCategoryId && (
            <Badge variant="outline" className="text-[10px] h-4">
              Child category
            </Badge>
          )}
        </div>
      </div>
    </div>
  );

  const handleDuplicateClick = () => {
    if (!editingCategory || !onDuplicate) return;
    onDuplicate(editingCategory);
  };

  const footerButtons = (
    <>
      <Button variant="outline" onClick={onClose} disabled={saving} size="sm">
        <X className="w-4 h-4 mr-1.5" />
        Cancel
      </Button>
      {isEditMode && onDuplicate && editingCategory && (
        <Button
          variant="outline"
          onClick={handleDuplicateClick}
          disabled={saving}
          size="sm"
        >
          <Copy className="w-4 h-4 mr-1.5" />
          Duplicate
        </Button>
      )}
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-1.5" />
            {isEditMode ? "Save Changes" : "Create Category"}
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
            <DrawerTitle>
              {isEditMode ? "Edit Category" : "Create Category"}
            </DrawerTitle>
            <DrawerDescription>
              {isEditMode
                ? "Update category details"
                : "Group related shortcuts together"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-3 overflow-y-auto">{body}</div>
          <DrawerFooter className="flex-row gap-2 justify-end">
            {footerButtons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Category" : "Create New Category"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update category details"
              : "Group related shortcuts together"}
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">{body}</div>
        <DialogFooter>{footerButtons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
