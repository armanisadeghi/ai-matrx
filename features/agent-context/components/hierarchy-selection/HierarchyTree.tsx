"use client";

import { useState, useMemo } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  ChevronRight,
  ChevronDown,
  Search,
  Loader2,
  AlertCircle,
  Folder,
} from "lucide-react";
import * as icons from "lucide-react";
import { Input } from "@/components/ui/input";
import { idMatchesQuery } from "@/utils/search-scoring";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import type { HierarchySelectionProps, HierarchyOption } from "./types";

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascalName];
  return Icon ?? Folder;
}

const LEVEL_ICONS: Record<string, LucideIcon> = {
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
};

const LEVEL_ACCENT: Record<string, string> = {
  organization: "text-violet-500",
  project: "text-amber-500",
  task: "text-sky-500",
};

type NodeLevel = "organization" | "scope" | "project" | "task";

interface TreeNode {
  id: string;
  name: string;
  level: NodeLevel;
  children: TreeNode[];
  status?: string | null;
  isPersonal?: boolean;
  scopeTypeId?: string;
  iconName?: string;
  color?: string;
}

export function HierarchyTree({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  disabled,
  className,
}: HierarchySelectionProps) {
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const includesScopes = levels.includes("scope");
  const scopeSelections = value.scopeSelections ?? {};

  const tree = useMemo(() => {
    const nodes: TreeNode[] = ctx.orgs.map((org) => {
      const isSelectedOrg =
        value.organizationId === org.id || !value.organizationId;

      const scopeChildren: TreeNode[] =
        includesScopes && isSelectedOrg
          ? ctx.scopeLevels.map((scopeLevel) => ({
              id: `scope-type-${scopeLevel.typeId}`,
              name: scopeLevel.pluralLabel,
              level: "scope" as const,
              scopeTypeId: scopeLevel.typeId,
              iconName: scopeLevel.icon,
              color: scopeLevel.color,
              children: scopeLevel.options.map((scope) => ({
                id: scope.id,
                name: scope.name,
                level: "scope" as const,
                scopeTypeId: scopeLevel.typeId,
                iconName: scopeLevel.icon,
                color: scopeLevel.color,
                children: [],
              })),
            }))
          : [];

      const projectChildren: TreeNode[] = levels.includes("project")
        ? (isSelectedOrg ? ctx.projects : []).map((proj) => ({
            id: proj.id,
            name: proj.name,
            level: "project" as const,
            children: levels.includes("task")
              ? (value.projectId === proj.id ? ctx.tasks : []).map((t) => ({
                  id: t.id,
                  name: t.name,
                  level: "task" as const,
                  children: [],
                  status: t.status,
                }))
              : [],
          }))
        : [];

      return {
        id: org.id,
        name: org.name,
        level: "organization" as const,
        children: [...scopeChildren, ...projectChildren],
        isPersonal: org.isPersonal,
      };
    });
    return nodes;
  }, [
    ctx.orgs,
    ctx.projects,
    ctx.tasks,
    ctx.scopeLevels,
    levels,
    value,
    includesScopes,
  ]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    function prune(node: TreeNode): TreeNode | null {
      if (node.name.toLowerCase().includes(q) || idMatchesQuery(node, q)) return node;
      const children = node.children.map(prune).filter(Boolean) as TreeNode[];
      if (children.length > 0) return { ...node, children };
      return null;
    }
    return tree.map(prune).filter(Boolean) as TreeNode[];
  }, [tree, search]);

  const effectiveExpanded = search.trim()
    ? new Set(getAllIds(filteredTree))
    : expandedIds;

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedId = value.taskId ?? value.projectId ?? value.organizationId;
  const selectedScopeIds = new Set(
    Object.values(scopeSelections).filter(Boolean) as string[],
  );

  const handleSelect = (node: TreeNode) => {
    if (disabled) return;
    if (node.level === "organization") ctx.setOrg(node.id);
    else if (node.level === "project") ctx.setProject(node.id);
    else if (node.level === "task") ctx.setTask(node.id);
    else if (
      node.level === "scope" &&
      node.scopeTypeId &&
      !node.children.length
    ) {
      const current = scopeSelections[node.scopeTypeId];
      ctx.setScopeValue(node.scopeTypeId, current === node.id ? null : node.id);
    }
  };

  const isNodeSelected = (node: TreeNode): boolean => {
    if (node.level === "scope" && !node.children.length) {
      return selectedScopeIds.has(node.id);
    }
    return node.id === selectedId;
  };

  if (ctx.isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ctx.isError) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <AlertCircle className="h-5 w-5 text-destructive mr-2" />
        <span className="text-xs text-destructive">Failed to load</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-2 py-1.5 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs text-base"
            style={{ fontSize: "16px" }}
            disabled={disabled}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {filteredTree.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              isSelected={isNodeSelected}
              expandedIds={effectiveExpanded}
              onSelect={handleSelect}
              onToggle={toggle}
              disabled={disabled}
            />
          ))}
          {filteredTree.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              {search ? `No results for "${search}"` : "No organizations"}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  isSelected,
  expandedIds,
  onSelect,
  onToggle,
  disabled,
}: {
  node: TreeNode;
  depth: number;
  isSelected: (node: TreeNode) => boolean;
  expandedIds: Set<string>;
  onSelect: (node: TreeNode) => void;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const isExpanded = expandedIds.has(node.id);
  const selected = isSelected(node);
  const hasChildren = node.children.length > 0;

  const Icon =
    node.level === "scope" && node.iconName
      ? resolveIcon(node.iconName)
      : (LEVEL_ICONS[node.level] ?? Folder);
  const accent = node.level === "scope" ? undefined : LEVEL_ACCENT[node.level];
  const inlineColor =
    node.level === "scope" && node.color ? node.color : undefined;

  const isScopeGroup = node.level === "scope" && hasChildren;

  return (
    <>
      <div
        className={cn(
          "group flex items-center rounded-md cursor-pointer transition-all",
          selected
            ? "bg-primary/10 ring-1 ring-primary/20"
            : "hover:bg-muted/50",
          disabled && "opacity-50 pointer-events-none",
          isScopeGroup && "opacity-80",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px`, paddingRight: "4px" }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          if (!isScopeGroup) onSelect(node);
        }}
      >
        <div
          className={cn(
            "h-5 w-5 flex items-center justify-center shrink-0",
            !hasChildren && "invisible",
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 mr-1.5",
            selected ? "text-primary" : accent,
          )}
          style={!selected && inlineColor ? { color: inlineColor } : undefined}
        />
        <span
          className={cn(
            "text-xs truncate flex-1 min-w-0 py-1",
            selected && "font-semibold text-primary",
            isScopeGroup &&
              "font-medium text-muted-foreground uppercase text-[10px] tracking-wider",
          )}
        >
          {node.name}
        </span>
        {hasChildren && (
          <span className="text-[9px] text-muted-foreground/60 font-mono tabular-nums shrink-0 mr-1">
            {node.children.length}
          </span>
        )}
        {node.status && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              node.status === "completed"
                ? "bg-green-400"
                : node.status === "in_progress"
                  ? "bg-blue-400"
                  : node.status === "blocked"
                    ? "bg-red-400"
                    : "bg-gray-400",
            )}
          />
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={isSelected}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </>
  );
}

function getAllIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const n of nodes) {
    ids.push(n.id);
    ids.push(...getAllIds(n.children));
  }
  return ids;
}
