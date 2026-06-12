/**
 * CategorySelect
 *
 * A drop-in replacement for the flat `<Select>{categories.map(...)}</Select>`
 * pattern that renders agent-shortcut categories as a true tree.
 *
 * - Groups options by `placementType` with a section header (icon + label).
 * - Within each placement, indents children under their parent and sorts by
 *   `sortOrder` then `label` (matching `CategoryTree`).
 * - Selected value renders as `Placement › Parent › Child` in the trigger so
 *   users can see the full path at a glance.
 *
 * Used in two distinct shapes:
 * 1. Cross-placement picker (default) — Shortcut create/edit, quick-create,
 *    "link agent to shortcut": every category is in scope.
 * 2. Single-placement parent picker (`placementFilter` + `excludedIds`) —
 *    Category create/edit and duplicate flows: only the active placement is
 *    shown, and the editing category + its descendants are removed to prevent
 *    self-reference / cycles.
 */

"use client";

import React, { useMemo } from "react";
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
import { cn } from "@/lib/utils";
import {
  DynamicIcon,
  getIconComponent,
} from "@/components/official/icons/IconResolver";
import { getPlacementTypeMeta, type PlacementType } from "../constants";
import type { AgentShortcutCategory } from "../types";

export interface CategorySelectProps {
  categories: AgentShortcutCategory[];
  /** Selected category id, or the `rootOption.value` sentinel. Empty string
   *  is treated as no selection. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Tighter trigger + items for inline / dense layouts. */
  compact?: boolean;
  /** When set, only categories matching this placement are shown and the
   *  placement group header is hidden (parent-picker mode). */
  placementFilter?: PlacementType;
  /** Whitelist of placements (ignored when `placementFilter` is set). */
  allowedPlacementTypes?: PlacementType[];
  /** Blacklist of placements (ignored when `placementFilter` is set). */
  excludedPlacementTypes?: PlacementType[];
  /** Remove these category ids — and all of their descendants — from the
   *  options. Used by parent pickers to prevent self-reference / cycles. */
  excludedIds?: ReadonlySet<string>;
  /** Optional synthetic top item, rendered before the tree (e.g. the
   *  "None (root level)" sentinel for parent pickers). */
  rootOption?: { value: string; label: string };
  /** Forwarded to the underlying SelectTrigger for `<label htmlFor>` wiring. */
  id?: string;
  /** Empty-state message when no categories match. Defaults to "No categories". */
  emptyMessage?: string;
}

interface FlatNode {
  category: AgentShortcutCategory;
  depth: number;
  hasChildren: boolean;
}

interface PlacementGroup {
  placementType: string;
  placementLabel: string;
  placementIconName: string;
  nodes: FlatNode[];
}

/** BFS expansion of an excluded-id seed set to also cover all descendants. */
function expandExcluded(
  categories: AgentShortcutCategory[],
  seedIds: ReadonlySet<string> | undefined,
): Set<string> {
  const out = new Set<string>(seedIds ?? []);
  if (out.size === 0) return out;

  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      const parent = c.parentCategoryId ?? null;
      if (parent && out.has(parent) && !out.has(c.id)) {
        out.add(c.id);
        added = true;
      }
    }
  }
  return out;
}

/** Depth-first traversal of `categories` rooted at `parentId`. Children are
 *  emitted immediately after their parent so the rendered list reads top-down
 *  like a file tree. */
function flattenTree(
  categories: AgentShortcutCategory[],
  parentId: string | null,
  depth: number,
  excluded: Set<string>,
): FlatNode[] {
  const direct = categories
    .filter(
      (c) => (c.parentCategoryId ?? null) === parentId && !excluded.has(c.id),
    )
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });

  const out: FlatNode[] = [];
  for (const c of direct) {
    const children = flattenTree(categories, c.id, depth + 1, excluded);
    out.push({ category: c, depth, hasChildren: children.length > 0 });
    out.push(...children);
  }
  return out;
}

/** Walk `parentCategoryId` upward to assemble the full ancestor chain
 *  ending in `category`. Cycle-safe via a visited guard. */
function buildPath(
  category: AgentShortcutCategory,
  byId: Map<string, AgentShortcutCategory>,
): AgentShortcutCategory[] {
  const path: AgentShortcutCategory[] = [];
  const guard = new Set<string>();
  let current: AgentShortcutCategory | undefined = category;
  while (current && !guard.has(current.id)) {
    path.unshift(current);
    guard.add(current.id);
    const parentId = current.parentCategoryId ?? null;
    current = parentId ? byId.get(parentId) : undefined;
  }
  return path;
}

export function CategorySelect({
  categories,
  value,
  onValueChange,
  placeholder = "Select category...",
  className,
  disabled,
  compact,
  placementFilter,
  allowedPlacementTypes,
  excludedPlacementTypes,
  excludedIds,
  rootOption,
  id,
  emptyMessage = "No categories",
}: CategorySelectProps) {
  const excluded = useMemo(
    () => expandExcluded(categories, excludedIds),
    [categories, excludedIds],
  );

  const byId = useMemo(() => {
    const map = new Map<string, AgentShortcutCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const groups: PlacementGroup[] = useMemo(() => {
    let pool = categories;

    if (placementFilter) {
      pool = pool.filter((c) => c.placementType === placementFilter);
    } else {
      if (allowedPlacementTypes && allowedPlacementTypes.length > 0) {
        const allow = new Set<string>(allowedPlacementTypes);
        pool = pool.filter((c) => allow.has(c.placementType));
      }
      if (excludedPlacementTypes && excludedPlacementTypes.length > 0) {
        const block = new Set<string>(excludedPlacementTypes);
        pool = pool.filter((c) => !block.has(c.placementType));
      }
    }

    const byPlacement = new Map<string, AgentShortcutCategory[]>();
    for (const c of pool) {
      if (!byPlacement.has(c.placementType)) {
        byPlacement.set(c.placementType, []);
      }
      byPlacement.get(c.placementType)!.push(c);
    }

    return Array.from(byPlacement.entries())
      .map(([placementType, list]) => {
        const meta = getPlacementTypeMeta(placementType);
        return {
          placementType,
          placementLabel: meta.label,
          placementIconName: (meta.icon ?? "Folder") as string,
          nodes: flattenTree(list, null, 0, excluded),
        };
      })
      .filter((g) => g.nodes.length > 0)
      .sort((a, b) => a.placementLabel.localeCompare(b.placementLabel));
  }, [
    categories,
    placementFilter,
    allowedPlacementTypes,
    excludedPlacementTypes,
    excluded,
  ]);

  const showPlacementHeaders = !placementFilter;

  const selectedCategory =
    value && value !== rootOption?.value ? byId.get(value) : undefined;
  const selectedPath = selectedCategory
    ? buildPath(selectedCategory, byId)
    : [];
  const selectedPlacementMeta = selectedCategory
    ? getPlacementTypeMeta(selectedCategory.placementType)
    : null;

  const triggerTextSize = compact ? "text-xs" : "text-sm";
  const isRootSelected = !!rootOption && value === rootOption.value;
  const hasAnyOptions = !!rootOption || groups.length > 0;

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder}>
          {isRootSelected ? (
            <span className={cn("text-muted-foreground", triggerTextSize)}>
              {rootOption!.label}
            </span>
          ) : selectedCategory ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <DynamicIcon
                name={selectedCategory.iconName}
                color={selectedCategory.color || "zinc"}
                size={compact ? 3 : 4}
                fallbackIcon="SquareMenu"
                className="shrink-0"
              />
              {showPlacementHeaders && selectedPlacementMeta && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "shrink-0 font-medium",
                    compact ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5",
                  )}
                >
                  {selectedPlacementMeta.label}
                </Badge>
              )}
              <span className={cn("truncate", triggerTextSize)}>
                {selectedPath.length > 1 ? (
                  <span className="text-muted-foreground">
                    {selectedPath
                      .slice(0, -1)
                      .map((c) => c.label)
                      .join(" › ")}
                    {" › "}
                  </span>
                ) : null}
                {selectedCategory.label}
              </span>
            </div>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-md">
        {!hasAnyOptions ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : null}

        {rootOption && (
          <SelectItem value={rootOption.value}>
            <span className="text-muted-foreground">{rootOption.label}</span>
          </SelectItem>
        )}

        {groups.map((group, groupIndex) => {
          const PlacementIcon = getIconComponent(group.placementIconName);
          const showSeparator =
            (rootOption && groupIndex === 0) || groupIndex > 0;
          return (
            <React.Fragment key={group.placementType}>
              {showSeparator ? (
                <div
                  role="separator"
                  className="h-px bg-border my-1"
                  aria-hidden
                />
              ) : null}
              <SelectGroup>
                {showPlacementHeaders && (
                  <SelectLabel className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2">
                    <PlacementIcon className="h-3 w-3" />
                    {group.placementLabel}
                  </SelectLabel>
                )}
                {group.nodes.map(({ category, depth, hasChildren }) => (
                  <CategorySelectItem
                    key={category.id}
                    category={category}
                    depth={depth}
                    hasChildren={hasChildren}
                    compact={compact}
                  />
                ))}
              </SelectGroup>
            </React.Fragment>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function CategorySelectItem({
  category,
  depth,
  hasChildren,
  compact,
}: {
  category: AgentShortcutCategory;
  depth: number;
  hasChildren: boolean;
  compact?: boolean;
}) {
  // 12px per level keeps deep trees readable inside the popover without
  // overflowing the trigger width.
  const indent = depth * 12;

  return (
    <SelectItem value={category.id} className="pl-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="inline-flex items-center shrink-0"
          style={{ paddingLeft: indent }}
        >
          {depth > 0 ? (
            <span
              className="text-muted-foreground/60 mr-1 select-none"
              aria-hidden
            >
              └
            </span>
          ) : null}
          <DynamicIcon
            name={category.iconName}
            color={category.color || "zinc"}
            size={compact ? 3 : 3.5}
            fallbackIcon="SquareMenu"
            className="shrink-0"
          />
        </span>
        <span
          className={cn(
            "truncate",
            compact ? "text-xs" : "text-sm",
            depth === 0 && hasChildren ? "font-medium" : "font-normal",
          )}
        >
          {category.label}
        </span>
        {!category.isActive && (
          <Badge variant="outline" className="text-[10px] h-4 ml-1 shrink-0">
            inactive
          </Badge>
        )}
      </div>
    </SelectItem>
  );
}
