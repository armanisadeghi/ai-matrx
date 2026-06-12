/**
 * CategorySelector
 *
 * Enhanced category selector that shows placement_type context to avoid confusion
 * with duplicate category names across different placement types.
 *
 * Display format: [Context Menu] > Parent > Child Category
 * Groups by placement_type with visual separation
 */

"use client";

import React, { useMemo } from "react";
import { ShortcutCategory } from "../types/core";
import { getPlacementTypeMeta, PlacementType } from "../constants";
import {
  DynamicIcon,
  getIconComponent,
} from "@/components/official/icons/IconResolver";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

interface CategorySelectorProps {
  categories: ShortcutCategory[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Array of allowed placement types. If provided, only these types will be shown */
  allowedPlacementTypes?: PlacementType[];
  /** Array of excluded placement types. If provided, these types will be hidden */
  excludedPlacementTypes?: PlacementType[];
}

interface CategoryGroup {
  placementType: string;
  placementLabel: string;
  placementIconName: string;
  categories: CategoryWithHierarchy[];
}

interface CategoryWithHierarchy extends ShortcutCategory {
  hierarchyPath: string;
  level: number;
}

export function CategorySelector({
  categories,
  value,
  onValueChange,
  placeholder = "Select category...",
  className,
  disabled = false,
  compact = false,
  allowedPlacementTypes,
  excludedPlacementTypes,
}: CategorySelectorProps) {
  // Build hierarchy path for each category
  const buildHierarchyPath = (
    category: ShortcutCategory,
    allCategories: ShortcutCategory[],
  ): string => {
    const parents: string[] = [];
    let current: ShortcutCategory | undefined = category;

    while (current && current.parent_category_id) {
      const parent = allCategories.find(
        (c) => c.id === current!.parent_category_id,
      );
      if (!parent) break;
      parents.unshift(parent.label);
      current = parent;
    }

    return parents.length > 0
      ? `${parents.join(" > ")} > ${category.label}`
      : category.label;
  };

  const getLevel = (
    category: ShortcutCategory,
    allCategories: ShortcutCategory[],
  ): number => {
    let level = 0;
    let current: ShortcutCategory | undefined = category;

    while (current && current.parent_category_id) {
      level++;
      current = allCategories.find((c) => c.id === current!.parent_category_id);
    }

    return level;
  };

  // Group categories by placement type with hierarchy
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, CategoryGroup>();

    categories.forEach((category) => {
      const placementType = category.placement_type;

      // Filter by allowed/excluded placement types
      if (
        allowedPlacementTypes &&
        !allowedPlacementTypes.includes(placementType)
      ) {
        return;
      }
      if (
        excludedPlacementTypes &&
        excludedPlacementTypes.includes(placementType)
      ) {
        return;
      }

      const meta = getPlacementTypeMeta(placementType);

      if (!groups.has(placementType)) {
        groups.set(placementType, {
          placementType,
          placementLabel: meta.label,
          placementIconName: meta.icon as any,
          categories: [],
        });
      }

      const categoryWithHierarchy: CategoryWithHierarchy = {
        ...category,
        hierarchyPath: buildHierarchyPath(category, categories),
        level: getLevel(category, categories),
      };

      groups.get(placementType)!.categories.push(categoryWithHierarchy);
    });

    // Sort categories within each group
    groups.forEach((group) => {
      group.categories.sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.hierarchyPath.localeCompare(b.hierarchyPath);
      });
    });

    // Convert to array and sort by placement type label
    return Array.from(groups.values()).sort((a, b) =>
      a.placementLabel.localeCompare(b.placementLabel),
    );
  }, [categories, allowedPlacementTypes, excludedPlacementTypes]);

  // Get selected category for display
  const selectedCategory = categories.find((c) => c.id === value);
  const selectedPlacementMeta = selectedCategory
    ? getPlacementTypeMeta(selectedCategory.placement_type)
    : null;
  const selectedHierarchyPath = selectedCategory
    ? buildHierarchyPath(selectedCategory, categories)
    : null;
  const selectedLevel = selectedCategory
    ? getLevel(selectedCategory, categories)
    : 0;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selectedCategory && (
            <div className="flex items-center gap-1.5">
              <DynamicIcon
                name={selectedCategory.icon_name}
                color={selectedCategory.color || "zinc"}
                size={compact ? 3 : 4}
                fallbackIcon="SquareMenu"
                className="shrink-0"
              />
              <Badge
                variant="secondary"
                className={`${compact ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5"} font-medium shrink-0`}
              >
                {selectedPlacementMeta?.label}
              </Badge>
              {selectedLevel > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className={`truncate ${compact ? "text-xs" : ""}`}>
                {selectedCategory.label}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-md">
        {groupedCategories.map((group, groupIndex) => {
          const IconComponent = getIconComponent(group.placementIconName);
          return (
            <React.Fragment key={group.placementType}>
              {groupIndex > 0 && <div className="h-px bg-border my-2" />}
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase py-2 px-2 bg-background sticky top-0 z-10 border-b">
                  <IconComponent className="h-4 w-4" />
                  {group.placementLabel}
                </SelectLabel>
                {group.categories.map((category) => (
                  <SelectItem
                    key={category.id}
                    value={category.id}
                    className="pl-2"
                  >
                    <div className="flex items-start gap-1.5 py-0.5">
                      <div
                        className="flex items-center gap-1 shrink-0 pt-0.5"
                        style={{ paddingLeft: `${category.level * 12}px` }}
                      >
                        <span className="text-xs text-muted-foreground">
                          {category.level === 0 ? "├" : "└"}
                        </span>
                        <DynamicIcon
                          name={category.icon_name}
                          color={category.color || "zinc"}
                          size={4}
                          fallbackIcon="SquareMenu"
                          className="shrink-0"
                        />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium truncate">
                          {category.label}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </React.Fragment>
          );
        })}
      </SelectContent>
    </Select>
  );
}
