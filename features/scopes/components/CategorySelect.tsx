"use client";

// features/scopes/components/CategorySelect.tsx
//
// THE single-value picker over one `platform.categories` dimension, via the
// canonical useCategories hook (cat_list RPC). Value is the category ID (the
// FK the consuming table stores), display is the category name. Consumed by
// content-plan (page type / status / source type) and CRM (lifecycle stage /
// rating). Lives in features/scopes because scopes owns the categories
// primitive — never fork a per-feature copy.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import type { CategoryDimension } from "@/features/scopes/types";
import { buildCategoryHierarchy } from "@/features/scopes/utils/categoryHierarchy";
import { CornerDownRight } from "lucide-react";

const NONE = "__none__";

export function CategorySelect({
  dimension,
  value,
  onChange,
  placeholder,
  allowNone = true,
  disabled,
}: {
  dimension: CategoryDimension;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const { categories, status, error } = useCategories({ dimension });
  const hierarchy = buildCategoryHierarchy(categories);
  const selectedItem = hierarchy.items.find(
    (item) => item.category.id === value,
  );

  return (
    <div>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled || status === "loading"}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder}>
            {selectedItem?.displayName ??
              (value === null && allowNone ? "None" : undefined)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowNone ? (
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">None</span>
            </SelectItem>
          ) : null}
          {hierarchy.hasHierarchy
            ? hierarchy.items.map(({ category, depth, parent }) => (
                <SelectItem
                  key={category.id}
                  value={category.id}
                  aria-label={
                    parent ? `${parent.name}, ${category.name}` : category.name
                  }
                >
                  {depth === 0 ? (
                    <span className="font-medium">{category.name}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 pl-3 text-muted-foreground">
                      <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-foreground">{category.name}</span>
                    </span>
                  )}
                </SelectItem>
              ))
            : categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
