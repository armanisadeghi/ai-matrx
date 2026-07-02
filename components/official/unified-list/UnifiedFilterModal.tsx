"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import { cn } from "@/lib/utils";
import {
  BaseListItem,
  UnifiedListLayoutConfig,
  FilterDefinition,
} from "./types";
import { clearFilters, hasActiveFilters } from "./utils";

interface UnifiedFilterModalProps<T extends BaseListItem> {
  isOpen: boolean;
  onClose: () => void;
  config: UnifiedListLayoutConfig<T>;
  items: T[];
  filterValues: Record<string, unknown>;
  onFilterValuesChange: (values: Record<string, unknown>) => void;
  sortBy: string;
  onSortChange: (sortBy: string) => void;
}

/**
 * UnifiedFilterModal
 *
 * A dynamic filter modal that renders filters based on configuration.
 *
 * Features:
 * - Sort options (always available if filters config exists)
 * - Select filters (dropdown)
 * - Multi-select filters (multiple dropdowns)
 * - Tags filters (badge selection)
 * - Toggle filters (switch)
 * - Custom filter components
 * - Clear all functionality
 * - Uses MobileOverlayWrapper for safe mobile rendering
 *
 * Preserves all features from the prompts FilterModal.
 */
export function UnifiedFilterModal<T extends BaseListItem>({
  isOpen,
  onClose,
  config,
  items,
  filterValues,
  onFilterValuesChange,
  sortBy,
  onSortChange,
}: UnifiedFilterModalProps<T>) {
  const [localSortBy, setLocalSortBy] = useState(sortBy);
  const [localFilterValues, setLocalFilterValues] = useState(filterValues);

  useEffect(() => {
    setLocalSortBy(sortBy);
  }, [sortBy]);

  useEffect(() => {
    setLocalFilterValues(filterValues);
  }, [filterValues]);

  const customFilters = config.filters?.customFilters || [];

  // Extract dynamic options for filters
  const filterOptions = useMemo(() => {
    const options: Record<string, Array<{ value: string; label: string }>> = {};

    customFilters.forEach((filter) => {
      if (filter.extractOptions) {
        options[filter.id] = filter.extractOptions(items);
      } else if (filter.options) {
        options[filter.id] = filter.options;
      }
    });

    return options;
  }, [customFilters, items]);

  const handleApply = () => {
    onSortChange(localSortBy);
    onFilterValuesChange(localFilterValues);
    onClose();
  };

  const handleClearAll = () => {
    const clearedFilters = clearFilters(customFilters);
    setLocalFilterValues(clearedFilters);
    setLocalSortBy(
      config.filters?.defaultSort ||
        config.filters?.sortOptions[0]?.value ||
        "",
    );
    onSortChange(
      config.filters?.defaultSort ||
        config.filters?.sortOptions[0]?.value ||
        "",
    );
    onFilterValuesChange(clearedFilters);
  };

  const hasFiltersActive = useMemo(() => {
    if (!config.filters) return false;

    return hasActiveFilters(
      customFilters,
      localFilterValues,
      localSortBy,
      config.filters.defaultSort,
    );
  }, [localFilterValues, localSortBy, customFilters, config.filters]);

  const handleFilterChange = (filterId: string, value: unknown) => {
    setLocalFilterValues((prev) => ({
      ...prev,
      [filterId]: value,
    }));
  };

  const toggleTag = (filterId: string, tag: string) => {
    setLocalFilterValues((prev) => {
      const currentTags = Array.isArray(prev[filterId]) ? (prev[filterId] as string[]) : [];
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];

      return {
        ...prev,
        [filterId]: newTags,
      };
    });
  };

  // Render a single filter based on its type
  const renderFilter = (filter: FilterDefinition<T>) => {
    const value = localFilterValues[filter.id];

    // Custom component
    if (filter.component) {
      const CustomComponent = filter.component;
      return (
        <CustomComponent
          filter={filter}
          value={value}
          onChange={(newValue) => handleFilterChange(filter.id, newValue)}
          items={items}
        />
      );
    }

    // Select filter
    if (filter.type === "select") {
      const options = filterOptions[filter.id] || [];
      const selectValue = typeof value === "string" ? value : "";

      return (
        <div key={filter.id}>
          <label className="text-sm font-semibold text-foreground block mb-2">
            {filter.label}
          </label>
          <Select
            value={selectValue}
            onValueChange={(newValue) =>
              handleFilterChange(filter.id, newValue)
            }
          >
            <SelectTrigger
              className="h-12 text-base"
              style={{ fontSize: "16px" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // Tags filter
    if (filter.type === "tags") {
      const options = filterOptions[filter.id] || [];
      const selectedTags = Array.isArray(value) ? (value as string[]) : [];

      return (
        <div key={filter.id}>
          <label className="text-sm font-semibold text-foreground block mb-2">
            {filter.label}
          </label>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Badge
                key={option.value}
                variant={
                  selectedTags.includes(option.value) ? "default" : "outline"
                }
                className={cn(
                  "cursor-pointer text-sm px-3 py-1.5",
                  selectedTags.includes(option.value) &&
                    "bg-primary hover:bg-primary/90",
                )}
                onClick={() => toggleTag(filter.id, option.value)}
              >
                {option.label}
              </Badge>
            ))}
          </div>
        </div>
      );
    }

    // Toggle filter
    if (filter.type === "toggle") {
      return (
        <div key={filter.id} className="flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground">
            {filter.label}
          </label>
          <Switch
            checked={typeof value === "boolean" ? value : false}
            onCheckedChange={(checked) =>
              handleFilterChange(filter.id, checked)
            }
          />
        </div>
      );
    }

    // Multi-select filter (similar to select but allows multiple)
    if (filter.type === "multiselect") {
      const options = filterOptions[filter.id] || [];
      const selectedValues = Array.isArray(value) ? (value as string[]) : [];

      return (
        <div key={filter.id}>
          <label className="text-sm font-semibold text-foreground block mb-2">
            {filter.label}
          </label>
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter(
                          (v: string) => v !== option.value,
                        );
                    handleFilterChange(filter.id, newValues);
                  }}
                  className="shrink-0"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <MobileOverlayWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="Filters & Sorting"
      description="Customize how your items are organized"
      maxHeight="lg"
    >
      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Sort Section */}
        {config.filters?.sortOptions &&
          config.filters.sortOptions.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground block">
                Sort By
              </label>
              <Select value={localSortBy} onValueChange={setLocalSortBy}>
                <SelectTrigger
                  className="h-12 text-base"
                  style={{ fontSize: "16px" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.filters.sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        {/* Custom Filters */}
        {customFilters.length > 0 && (
          <>
            {customFilters.map((filter) => (
              <div key={filter.id}>{renderFilter(filter)}</div>
            ))}
          </>
        )}

        {/* Empty state if no filters */}
        {customFilters.length === 0 && (
          <div className="pt-4 space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              More filter options coming soon
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-xl border-t border-border/50 p-4 space-y-2">
        {hasFiltersActive && (
          <Button
            variant="outline"
            onClick={handleClearAll}
            className="w-full h-12 text-base"
          >
            <X className="h-4 w-4 mr-2" />
            Clear All Filters
          </Button>
        )}
        <Button onClick={handleApply} className="w-full h-12 text-base">
          Apply Filters
        </Button>
      </div>
    </MobileOverlayWrapper>
  );
}
