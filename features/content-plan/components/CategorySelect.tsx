"use client";

/**
 * Small select over one platform.categories dimension via the CANONICAL
 * useCategories hook (cat_list RPC). Used for plan_page_type / plan_status /
 * plan_source_type pickers. Value is the category ID (the FK the plan
 * tables store), display is the category name.
 */
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
