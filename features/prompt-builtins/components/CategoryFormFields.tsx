"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import {
  ShortcutCategory,
  CreateShortcutCategoryInput,
  UpdateShortcutCategoryInput,
} from "../types/core";
import {
  PLACEMENT_TYPES,
  getPlacementTypeMeta,
  PlacementType,
} from "../constants";
import { CategorySelector } from "./CategorySelector";
import { CategoryColorPicker } from "./CategoryColorPicker";

export interface CategoryFormData {
  label: string;
  placement_type: PlacementType;
  parent_category_id: string | null;
  description: string;
  icon_name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

interface CategoryFormFieldsProps {
  /** Initial data for editing, or undefined for creating */
  initialData?: ShortcutCategory;
  /** All categories for parent selection */
  allCategories: ShortcutCategory[];
  /** Form data (controlled) */
  formData: CategoryFormData;
  /** Form change handler */
  onChange: (data: CategoryFormData) => void;
  /** Validation errors */
  errors?: Record<string, string>;
  /** Disable form fields */
  disabled?: boolean;
}

export function CategoryFormFields({
  initialData,
  allCategories,
  formData,
  onChange,
  errors = {},
  disabled = false,
}: CategoryFormFieldsProps) {
  // Filter available parent categories (same placement type, not self)
  const availableParents = allCategories.filter(
    (c) =>
      c.placement_type === formData.placement_type && c.id !== initialData?.id,
  );

  const handleChange = (field: keyof CategoryFormData, value: any) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="space-y-3">
      {/* Label & Placement Type - Most Important */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Label *</Label>
          <Input
            value={formData.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="Category name"
            disabled={disabled}
            className="h-8 text-sm"
          />
          {errors.label && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.label}
            </p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium">Placement Type *</Label>
          <Select
            value={formData.placement_type}
            onValueChange={(value) => {
              handleChange("placement_type", value);
              // Reset parent if changing placement type
              if (formData.parent_category_id) {
                const parent = allCategories.find(
                  (c) => c.id === formData.parent_category_id,
                );
                if (parent && parent.placement_type !== value) {
                  handleChange("parent_category_id", null);
                }
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLACEMENT_TYPES).map(([key, value]) => {
                const meta = getPlacementTypeMeta(value);
                return (
                  <SelectItem
                    key={value}
                    value={value}
                    className="text-sm py-1.5"
                  >
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
          {errors.placement_type && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {errors.placement_type}
            </p>
          )}
        </div>
      </div>

      {/* Parent Category - Hierarchy */}
      <div>
        <Label className="text-xs font-medium">Parent Category</Label>
        {availableParents.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CategorySelector
                  categories={availableParents}
                  value={formData.parent_category_id || ""}
                  onValueChange={(value) =>
                    handleChange("parent_category_id", value || null)
                  }
                  placeholder="None (Root Level)"
                  disabled={disabled}
                  compact={true}
                  allowedPlacementTypes={[formData.placement_type]}
                  className="h-8 text-sm"
                />
              </div>
              {formData.parent_category_id && (
                <button
                  type="button"
                  onClick={() => handleChange("parent_category_id", null)}
                  disabled={disabled}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="h-8 px-3 py-2 rounded-md border border-border bg-muted/50 flex items-center text-xs text-muted-foreground">
              No categories available in this placement type
            </div>
            <p className="text-xs text-muted-foreground">
              This will be a root-level category
            </p>
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Optional description"
          rows={2}
          disabled={disabled}
          className="text-sm resize-none"
        />
      </div>

      {/* Icon, Color, Sort Order - Visual & Ordering */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="icon-name-input" className="text-xs font-medium">
            Icon Name
          </Label>
          <IconInputWithValidation
            id="icon-name-input"
            value={formData.icon_name}
            onChange={(value) => handleChange("icon_name", value)}
            placeholder="e.g., Folder"
            disabled={disabled}
            className="h-8 text-sm"
            showLucideLink={true}
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Color</Label>
          <CategoryColorPicker
            value={formData.color}
            onChange={(color) => handleChange("color", color)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Sort Order</Label>
          <Input
            type="number"
            value={formData.sort_order}
            onChange={(e) =>
              handleChange("sort_order", parseInt(e.target.value) || 0)
            }
            disabled={disabled}
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-0.5">Lower = first</p>
        </div>
      </div>

      {/* Active Status */}
      <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium cursor-pointer">
            Active Status
          </Label>
          <Badge
            variant={formData.is_active ? "default" : "secondary"}
            className="text-[10px] h-4"
          >
            {formData.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => handleChange("is_active", checked)}
          disabled={disabled}
        />
      </div>

      {/* Preview Box */}
      <div className="p-2.5 rounded-md border border-border bg-card">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          Preview
        </p>
        <div className="flex items-center gap-2">
          <DynamicIcon
            name={formData.icon_name}
            color={formData.color || "zinc"}
            size={4}
            fallbackIcon="SquareMenu"
            className="flex-shrink-0"
          />
          <span className="text-sm font-medium">
            {formData.label || "Category Name"}
          </span>
          {formData.parent_category_id && (
            <Badge variant="outline" className="text-[10px] h-4">
              Child Category
            </Badge>
          )}
        </div>
        {formData.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {formData.description}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Helper hook to manage form state
 */
export function useCategoryFormData(
  initialData?: ShortcutCategory,
): [CategoryFormData, (data: CategoryFormData) => void] {
  const [formData, setFormData] = useState<CategoryFormData>(() => {
    if (initialData) {
      return {
        label: initialData.label,
        placement_type: initialData.placement_type,
        parent_category_id: initialData.parent_category_id,
        description: initialData.description || "",
        icon_name: initialData.icon_name,
        color: initialData.color,
        sort_order: initialData.sort_order,
        is_active: initialData.is_active,
        metadata: initialData.metadata || {},
      };
    }
    return {
      label: "",
      placement_type: Object.values(PLACEMENT_TYPES)[0],
      parent_category_id: null,
      description: "",
      icon_name: "Folder",
      color: "#666666",
      sort_order: 999,
      is_active: true,
      metadata: {},
    };
  });

  return [formData, setFormData];
}

/**
 * Convert form data to create/update input
 */
export function formDataToCreateInput(
  data: CategoryFormData,
): CreateShortcutCategoryInput {
  return {
    label: data.label,
    placement_type: data.placement_type as any,
    parent_category_id: data.parent_category_id,
    description: data.description || null,
    icon_name: data.icon_name,
    color: data.color,
    sort_order: data.sort_order,
    is_active: data.is_active,
    metadata: data.metadata,
  };
}

export function formDataToUpdateInput(
  id: string,
  data: CategoryFormData,
): UpdateShortcutCategoryInput {
  return {
    id,
    label: data.label,
    placement_type: data.placement_type as any,
    parent_category_id: data.parent_category_id,
    description: data.description || null,
    icon_name: data.icon_name,
    color: data.color,
    sort_order: data.sort_order,
    is_active: data.is_active,
    metadata: data.metadata,
  };
}

/**
 * Validate form data
 */
export function validateCategoryFormData(
  data: CategoryFormData,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.label?.trim()) {
    errors.label = "Label is required";
  }

  if (!data.placement_type) {
    errors.placement_type = "Placement type is required";
  }

  if (!data.icon_name?.trim()) {
    errors.icon_name = "Icon name is required";
  }

  if (!data.color?.trim()) {
    errors.color = "Color is required";
  }

  return errors;
}
