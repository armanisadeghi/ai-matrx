"use client";

import { useState, useMemo } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  User,
  Tag,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useHierarchyTree, filterHierarchyTree } from "../hooks/useHierarchy";
import { HierarchyEntityModal } from "./HierarchyEntityModal";
import type {
  HierarchyNode,
  HierarchyNodeType,
} from "../service/hierarchyService";
import type { ScopeState } from "../hooks/useContextScope";
import type { ContextScopeLevel } from "../types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
  scope: Tag,
};

const ACCENT: Record<string, string> = {
  user: "text-blue-500",
  organization: "text-violet-500",
  project: "text-amber-500",
  task: "text-sky-500",
  scope: "text-emerald-500",
};

const TYPE_LABEL: Record<string, string> = {
  user: "Personal",
  organization: "Organization",
  project: "Project",
  task: "Task",
  scope: "Scope",
};

function nodeTypeToScopeLevel(
  type: HierarchyNodeType | string,
): ContextScopeLevel {
  if (
    type === "user" ||
    type === "organization" ||
    type === "project" ||
    type === "task" ||
    type === "scope"
  ) {
    return type;
  }
  return "scope";
}

type Props = {
  scope: ScopeState;
  onScopeChange: (scope: ScopeState) => void;
};

export function HierarchyExplorer({ scope, onScopeChange }: Props) {
  const { data: tree, isLoading, isError } = useHierarchyTree();
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<{
    type: HierarchyNodeType;
    parentId?: string;
    parentType?: HierarchyNodeType;
    orgId?: string;
  } | null>(null);

  const filteredTree = useMemo(() => {
    if (!tree) return [];
    return filterHierarchyTree(tree, search);
  }, [tree, search]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelect = (node: HierarchyNode) => {
    onScopeChange({
      scopeType: nodeTypeToScopeLevel(node.type),
      scopeId: node.id,
      scopeName: node.name,
    });
  };

  // Auto-expand when search is active
  const effectiveExpanded = search.trim()
    ? new Set(getAllIds(filteredTree))
    : expandedIds;

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-destructive mb-2">
          Failed to load hierarchy
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search hierarchy..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {/* Personal scope */}
          <TreeItem
            node={{
              id: "personal",
              type: "user",
              name: "My Context",
              description: null,
              parentId: null,
              children: [],
              childCount: 0,
            }}
            depth={0}
            isSelected={scope.scopeType === "user"}
            isExpanded={false}
            onSelect={handleSelect}
            onToggle={() => {}}
            hasChildren={false}
          />

          {/* Org tree */}
          {filteredTree.length === 0 && !search ? (
            <div className="py-6 text-center">
              <Building2 className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground mb-2">
                No organizations yet
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1"
                onClick={() => setCreateModal({ type: "organization" })}
              >
                <Plus className="h-3 w-3" /> Create Organization
              </Button>
            </div>
          ) : filteredTree.length === 0 && search ? (
            <div className="py-6 text-center">
              <p className="text-[11px] text-muted-foreground">
                No results for &ldquo;{search}&rdquo;
              </p>
            </div>
          ) : (
            filteredTree.map((orgNode) => (
              <TreeBranch
                key={orgNode.id}
                node={orgNode}
                depth={0}
                selectedId={scope.scopeId}
                expandedIds={effectiveExpanded}
                onSelect={handleSelect}
                onToggle={toggleExpand}
                onCreateChild={(type, parentId, parentType, orgId) =>
                  setCreateModal({ type, parentId, parentType, orgId })
                }
              />
            ))
          )}

          {/* Create Org button */}
          {(filteredTree.length > 0 || search) && !search && (
            <button
              className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors mt-1"
              onClick={() => setCreateModal({ type: "organization" })}
            >
              <Plus className="h-3 w-3" /> New Organization
            </button>
          )}
        </div>
      </ScrollArea>

      {/* Create modal */}
      {createModal && (
        <HierarchyEntityModal
          entityType={createModal.type}
          parentId={createModal.parentId}
          parentType={createModal.parentType}
          orgId={createModal.orgId}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  );
}

// ─── Tree Branch (recursive) ────────────────────────────────────────

function TreeBranch({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onCreateChild,
}: {
  node: HierarchyNode;
  depth: number;
  selectedId: string;
  expandedIds: Set<string>;
  onSelect: (node: HierarchyNode) => void;
  onToggle: (id: string) => void;
  onCreateChild: (
    type: HierarchyNodeType,
    parentId: string,
    parentType: HierarchyNodeType,
    orgId?: string,
  ) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;
  const hasChildren = node.children.length > 0;

  // Determine what child type can be created
  const childType: HierarchyNodeType | null =
    node.type === "organization"
      ? "project"
      : node.type === "project"
        ? "task"
        : null;

  // Find the org id for context
  const orgId =
    node.type === "organization"
      ? node.id
      : (node.meta?.organization_id as string | undefined);

  return (
    <>
      <TreeItem
        node={node}
        depth={depth}
        isSelected={isSelected}
        isExpanded={isExpanded}
        onSelect={onSelect}
        onToggle={() => onToggle(node.id)}
        hasChildren={hasChildren}
        onCreateChild={
          childType
            ? () => onCreateChild(childType, node.id, node.type, orgId)
            : undefined
        }
      />
      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
            />
          ))}
          {/* Inline "add" at bottom of expanded children */}
          {childType && (
            <button
              className="flex items-center gap-1.5 w-full py-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 rounded transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              onClick={() =>
                onCreateChild(childType, node.id, node.type, orgId)
              }
            >
              <Plus className="h-2.5 w-2.5" /> New {TYPE_LABEL[childType]}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ─── Tree Item (single row) ─────────────────────────────────────────

function TreeItem({
  node,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  hasChildren,
  onCreateChild,
}: {
  node: HierarchyNode;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (node: HierarchyNode) => void;
  onToggle: () => void;
  hasChildren: boolean;
  onCreateChild?: () => void;
}) {
  const Icon = ICONS[node.type] ?? Tag;
  const accent = ACCENT[node.type] ?? ACCENT.scope;

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-md cursor-pointer transition-all text-xs ${
        isSelected
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted/50 text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 16 + 4}px`, paddingRight: "4px" }}
    >
      {/* Expand/collapse toggle */}
      <button
        className={`h-5 w-5 flex items-center justify-center shrink-0 rounded hover:bg-muted transition-colors ${
          hasChildren ? "" : "invisible"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {/* Icon + Name */}
      <div
        className="flex items-center gap-1.5 flex-1 min-w-0 py-1"
        onClick={() => {
          onSelect(node);
          if (hasChildren && !isExpanded) onToggle();
        }}
      >
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : accent}`}
        />
        <span className="truncate">{node.name}</span>
        {hasChildren && (
          <Badge
            variant="secondary"
            className="h-4 text-[9px] px-1 ml-auto shrink-0 opacity-60"
          >
            {node.children.length}
          </Badge>
        )}
      </div>

      {/* Add child button */}
      {onCreateChild && (
        <button
          className="h-5 w-5 flex items-center justify-center shrink-0 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onCreateChild();
          }}
          title={`Add child`}
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      {/* Task status indicator */}
      {node.type === "task" && Boolean(node.meta?.status) && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            node.meta?.status === "completed"
              ? "bg-green-400"
              : node.meta?.status === "in_progress"
                ? "bg-blue-400"
                : node.meta?.status === "blocked"
                  ? "bg-red-400"
                  : "bg-gray-400"
          }`}
        />
      )}
    </div>
  );
}

// ─── Utility ────────────────────────────────────────────────────────

function getAllIds(nodes: HierarchyNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...getAllIds(node.children));
  }
  return ids;
}
