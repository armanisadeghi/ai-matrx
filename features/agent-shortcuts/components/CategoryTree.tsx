"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { getPlacementTypeMeta, PLACEMENT_TYPES } from "../constants";
import type { AgentShortcutCategory, ScopeProps } from "../types";

export interface CategoryTreeProps extends ScopeProps {
  categories: AgentShortcutCategory[];
  placementFilter?: string;
  onEdit?: (category: AgentShortcutCategory) => void;
  onCreate?: (parent?: AgentShortcutCategory) => void;
  onDuplicate?: (category: AgentShortcutCategory) => void;
  onDelete?: (category: AgentShortcutCategory) => void;
  onToggleActive?: (category: AgentShortcutCategory) => void;
  selectedId?: string;
  onSelect?: (category: AgentShortcutCategory) => void;
  readonly?: boolean;
  searchable?: boolean;
  className?: string;
}

interface TreeNode extends AgentShortcutCategory {
  children: TreeNode[];
  depth: number;
}

function buildTree(
  categories: AgentShortcutCategory[],
  parentId: string | null,
  depth: number,
): TreeNode[] {
  return categories
    .filter((c) => (c.parentCategoryId ?? null) === parentId)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    })
    .map((c) => ({
      ...c,
      depth,
      children: buildTree(categories, c.id, depth + 1),
    }));
}

export function CategoryTree({
  scope,
  scopeId: _scopeId,
  categories,
  placementFilter,
  onEdit,
  onCreate,
  onDuplicate,
  onDelete,
  onToggleActive,
  selectedId,
  onSelect,
  readonly = false,
  searchable = true,
  className,
}: CategoryTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [internalPlacement, setInternalPlacement] = useState<string>(
    placementFilter ?? "all",
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const effectivePlacement = placementFilter ?? internalPlacement;

  const filteredCategories = useMemo(() => {
    let out = categories;
    if (effectivePlacement !== "all") {
      out = out.filter((c) => c.placementType === effectivePlacement);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.description?.toLowerCase() ?? "").includes(q) ||
          idMatchesQuery(c, q),
      );
    }
    return out;
  }, [categories, effectivePlacement, searchQuery]);

  const groups = useMemo(() => {
    if (effectivePlacement !== "all") {
      return [
        {
          placementType: effectivePlacement,
          roots: buildTree(filteredCategories, null, 0),
        },
      ];
    }
    const byPlacement = new Map<string, AgentShortcutCategory[]>();
    filteredCategories.forEach((c) => {
      if (!byPlacement.has(c.placementType)) {
        byPlacement.set(c.placementType, []);
      }
      byPlacement.get(c.placementType)!.push(c);
    });
    return Array.from(byPlacement.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([placementType, list]) => ({
        placementType,
        roots: buildTree(list, null, 0),
      }));
  }, [filteredCategories, effectivePlacement]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent hover:bg-muted/50 ${
            isSelected ? "bg-muted border-border" : ""
          }`}
          style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => toggleExpand(node.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-5" />
          )}
          <DynamicIcon
            name={node.iconName}
            color={node.color || "zinc"}
            size={4}
            fallbackIcon="SquareMenu"
            className="h-4 w-4 flex-shrink-0"
          />
          <button
            type="button"
            onClick={() => onSelect?.(node)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{node.label}</span>
              {!node.isActive && (
                <Badge variant="outline" className="text-xs">
                  Inactive
                </Badge>
              )}
              {node.userId && (
                <Badge variant="secondary" className="text-xs">
                  User
                </Badge>
              )}
              {node.organizationId && (
                <Badge variant="secondary" className="text-xs">
                  Org
                </Badge>
              )}
              {!node.userId &&
                !node.organizationId &&
                !node.projectId &&
                !node.taskId && (
                  <Badge variant="outline" className="text-xs">
                    Global
                  </Badge>
                )}
            </div>
            {node.description && (
              <div className="text-xs text-muted-foreground truncate">
                {node.description}
              </div>
            )}
          </button>

          {!readonly && (
            <div className="flex items-center gap-1">
              {onCreate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreate(node);
                  }}
                  title="Add subcategory"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(node);
                  }}
                  title="Edit"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
              {onDuplicate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(node);
                  }}
                  title="Duplicate"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
              {onToggleActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(node);
                  }}
                  title={node.isActive ? "Deactivate" : "Activate"}
                >
                  {node.isActive ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderNode(child))}</div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {(searchable || !placementFilter || onCreate) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {searchable && (
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-[16px]"
            />
          )}
          {!placementFilter && (
            <Select
              value={internalPlacement}
              onValueChange={setInternalPlacement}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Placement</SelectLabel>
                  <SelectItem value="all">All Placements</SelectItem>
                  {Object.entries(PLACEMENT_TYPES).map(([_key, value]) => (
                    <SelectItem key={value} value={value}>
                      {getPlacementTypeMeta(value).label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {!readonly && onCreate && (
            <Button size="sm" onClick={() => onCreate()}>
              <Plus className="h-4 w-4 mr-1" />
              New Category
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {groups.map(({ placementType, roots }) => {
          const meta = getPlacementTypeMeta(placementType);
          return (
            <div
              key={placementType}
              className="border border-border rounded-md"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <FolderOpen className="h-4 w-4" />
                <span className="font-semibold text-sm">{meta.label}</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  {roots.length}
                </Badge>
              </div>
              <div className="p-1">
                {roots.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No categories in this placement ({scope} scope).
                  </div>
                ) : (
                  roots.map((node) => renderNode(node))
                )}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No categories found.
          </div>
        )}
      </div>
    </div>
  );
}
