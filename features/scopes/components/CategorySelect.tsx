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

  return (
    <div>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled || status === "loading"}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? (
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">None</span>
            </SelectItem>
          ) : null}
          {categories.map((category) => (
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
