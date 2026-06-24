"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  FolderKanban,
  ListTodo,
  User,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  AlertCircle,
  TreePine,
  RefreshCw,
  Tags,
  Folder,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchScopeTypes } from "../redux/scope/scopeTypesSlice";
import { fetchScopes } from "../redux/scope/scopesSlice";
import {
  EMPTY_SCOPES_LIST,
  EMPTY_SCOPE_TYPES_LIST,
  selectScopeTypesByOrgIds,
  selectScopesByOrgIds,
} from "../redux/scope/selectors";
import type { ScopeType, Scope } from "../redux/scope/types";
import { useHierarchyTree, useDeleteEntity } from "../hooks/useHierarchy";
import { HierarchyEntityModal } from "./HierarchyEntityModal";
import { ContextHubDetail } from "./hub/ContextHubDetail";
import type {
  HierarchyNode,
  HierarchyNodeType,
} from "../service/hierarchyService";
import { matchesSearch } from "@/utils/search-scoring";

// ─── Config ─────────────────────────────────────────────────────────

const ICONS: Record<
  HierarchyNodeType | "scope_type" | "scope",
  React.ComponentType<{ className?: string }>
> = {
  user: User,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
  scope_type: Tags,
  scope: Folder,
};

const ACCENT_TEXT: Record<string, string> = {
  user: "text-blue-500",
  organization: "text-violet-500",
  project: "text-amber-500",
  task: "text-sky-500",
  scope_type: "text-emerald-500",
  scope: "text-teal-500",
};

const TYPE_LABEL: Record<string, string> = {
  user: "Personal",
  organization: "Organization",
  project: "Project",
  task: "Task",
  scope_type: "Scope Type",
  scope: "Scope",
};

// ─── Scope-enriched tree node ────────────────────────────────────────

interface TreeNode {
  id: string;
  type: string;
  name: string;
  description: string | null;
  children: TreeNode[];
  icon?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

function buildScopeAwareTree(
  orgNode: HierarchyNode,
  scopeTypes: ScopeType[],
  scopes: Scope[],
): TreeNode {
  if (scopeTypes.length === 0) {
    return convertNode(orgNode);
  }

  const scopeTypeNodes: TreeNode[] = scopeTypes
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st) => {
      const typeScopes = scopes.filter((s) => s.scope_type_id === st.id);
      const scopeInstanceNodes: TreeNode[] = typeScopes.map((scope) => ({
        id: scope.id,
        type: "scope",
        name: scope.name,
        description: scope.description || null,
        children: [],
        icon: st.icon,
        color: st.color,
      }));

      return {
        id: `st-${st.id}`,
        type: "scope_type",
        name: st.label_plural,
        description: st.description || null,
        children: scopeInstanceNodes,
        icon: st.icon,
        color: st.color,
      };
    });

  const projectNodes: TreeNode[] = orgNode.children.map(convertNode);

  return {
    id: orgNode.id,
    type: "organization",
    name: orgNode.name,
    description: orgNode.description,
    children: [...scopeTypeNodes, ...projectNodes],
    meta: orgNode.meta,
  };
}

function convertNode(node: HierarchyNode): TreeNode {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    description: node.description,
    children: node.children.map(convertNode),
    meta: node.meta,
  };
}

// ─── Scope data loader (per-org) ─────────────────────────────────────

function useOrgScopeData(orgIds: string[]) {
  const dispatch = useAppDispatch();
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const orgId of orgIds) {
      if (!fetchedRef.current.has(orgId)) {
        fetchedRef.current.add(orgId);
        dispatch(fetchScopeTypes(orgId));
        dispatch(fetchScopes({ org_id: orgId }));
      }
    }
  }, [dispatch, orgIds]);
}

// ─── Main Component ─────────────────────────────────────────────────

export function HierarchyTreePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id") ?? null;
  const { data: tree, isLoading, isError, refetch } = useHierarchyTree();

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<{
    type: HierarchyNodeType;
    parentId?: string;
    parentType?: HierarchyNodeType;
    orgId?: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: HierarchyNodeType;
    id: string;
    name: string;
  } | null>(null);

  const deleteMutation = useDeleteEntity();

  const userRoot = tree?.[0] ?? null;
  const userName = userRoot?.name ?? "Me";
  const userEmail = (userRoot?.meta?.email as string) ?? "";

  const orgIds = useMemo(() => {
    if (!userRoot) return [];
    return userRoot.children
      .filter((c) => c.type === "organization")
      .map((c) => c.id);
  }, [userRoot]);

  useOrgScopeData(orgIds);

  const orgScopeTypes = useAppSelector((state) =>
    selectScopeTypesByOrgIds(state, orgIds),
  );

  const orgScopes = useAppSelector((state) =>
    selectScopesByOrgIds(state, orgIds),
  );

  const enrichedTree = useMemo(() => {
    if (!userRoot) return [];

    return userRoot.children.map((child) => {
      if (child.type === "organization") {
        return buildScopeAwareTree(
          child,
          orgScopeTypes[child.id] ?? EMPTY_SCOPE_TYPES_LIST,
          orgScopes[child.id] ?? EMPTY_SCOPES_LIST,
        );
      }
      return convertNode(child);
    });
  }, [userRoot, orgScopeTypes, orgScopes]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return enrichedTree;
    function prune(node: TreeNode): TreeNode | null {
      if (
        matchesSearch(node, search, [
          { get: (n) => n.name, weight: "title" },
          { get: (n) => n.description, weight: "body" },
        ])
      ) {
        return node;
      }
      const filteredChildren = node.children
        .map(prune)
        .filter(Boolean) as TreeNode[];
      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }
    return enrichedTree.map(prune).filter(Boolean) as TreeNode[];
  }, [enrichedTree, search]);

  const selectedNode = useMemo(() => {
    if (!selectedId || !tree) return null;
    return findNode(tree, selectedId);
  }, [tree, selectedId]);

  const effectiveExpanded = search.trim()
    ? new Set(getAllTreeIds(filteredTree))
    : expandedIds;

  useEffect(() => {
    if (enrichedTree.length > 0 && expandedIds.size === 0) {
      setExpandedIds(new Set(enrichedTree.map((n) => n.id)));
    }
  }, [enrichedTree.length]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(getAllTreeIds(enrichedTree)));
  }, [enrichedTree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleSelect = useCallback(
    (id: string, type: string) => {
      if (type === "scope_type" || type === "scope") return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("id", id);
      params.set("type", type);
      router.push(`/agent-context/hierarchy?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-[320px] border-r border-border/50 p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-6"
              style={{
                width: `${85 - i * 6}%`,
                marginLeft: `${i * 16}px`,
              }}
            />
          ))}
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h3 className="text-sm font-medium mb-1">Failed to load hierarchy</h3>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* ─── Left: Tree ──────────────────────────────────────── */}
      <div className="w-full md:w-[320px] shrink-0 border-b md:border-b-0 md:border-r border-border/50 flex flex-col overflow-hidden bg-card/30 h-[40dvh] md:h-full">
        {/* User header */}
        <div className="px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{userName}</p>
              {userEmail && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {userEmail}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 border-b border-border/50">
          <div className="flex gap-1.5 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
              onClick={expandAll}
            >
              Expand
            </button>
            <span className="text-muted-foreground/30 text-[10px]">|</span>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
              onClick={collapseAll}
            >
              Collapse
            </button>
          </div>
        </div>

        {/* Tree */}
        <ScrollArea className="flex-1">
          <div className="p-1">
            {filteredTree.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expandedIds={effectiveExpanded}
                onSelect={handleSelect}
                onToggle={toggleExpand}
                onCreateChild={(type, parentId, parentType, orgId) =>
                  setCreateModal({ type, parentId, parentType, orgId })
                }
                onDelete={(type, id, name) =>
                  setDeleteConfirm({
                    type: type as HierarchyNodeType,
                    id,
                    name,
                  })
                }
              />
            ))}
            {filteredTree.length === 0 && !search && (
              <div className="py-8 text-center">
                <TreePine className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground">
                  No organizations yet
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom bar */}
        <div className="p-1.5 border-t border-border/50">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1 flex-1"
              onClick={() => setCreateModal({ type: "organization" })}
            >
              <Building2 className="h-3 w-3" /> New Org
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1 flex-1"
              onClick={() => setCreateModal({ type: "project" })}
            >
              <FolderKanban className="h-3 w-3" /> New Project
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Right: Detail Panel ─────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {selectedNode ? (
          <ContextHubDetail
            nodeType={selectedNode.type}
            nodeId={selectedNode.id}
            nodeName={selectedNode.name}
            nodeDescription={selectedNode.description ?? undefined}
          />
        ) : (
          <EmptyDetail treeStats={tree ? computeStats(tree) : null} />
        )}
      </div>

      {/* ─── Modals ──────────────────────────────────────────── */}
      {createModal && (
        <HierarchyEntityModal
          entityType={createModal.type}
          mode="create"
          parentId={createModal.parentId}
          parentType={createModal.parentType}
          orgId={createModal.orgId}
          onClose={() => setCreateModal(null)}
        />
      )}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm">
                Delete {TYPE_LABEL[deleteConfirm.type] ?? deleteConfirm.type}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Are you sure you want to delete{" "}
                <strong>{deleteConfirm.name}</strong>?
                {deleteConfirm.type === "organization" &&
                  " This will delete all projects and tasks within this organization."}
                {deleteConfirm.type === "project" &&
                  " All tasks in this project will also be deleted."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs h-8">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="text-xs h-8 bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  deleteMutation.mutate({
                    type: deleteConfirm.type,
                    id: deleteConfirm.id,
                  });
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Tree Row (recursive) ────────────────────────────────────────────

function TreeRow({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onCreateChild,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string, type: string) => void;
  onToggle: (id: string) => void;
  onCreateChild: (
    type: HierarchyNodeType,
    parentId: string,
    parentType: HierarchyNodeType,
    orgId?: string,
  ) => void;
  onDelete: (type: string, id: string, name: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;
  const hasChildren = node.children.length > 0;
  const isVirtual = !!node.meta?.virtual;
  const isScopeNode = node.type === "scope_type" || node.type === "scope";

  const childTypes: HierarchyNodeType[] =
    node.type === "organization"
      ? ["project"]
      : node.type === "project"
        ? ["task"]
        : node.type === "task"
          ? ["task"]
          : [];

  const orgId =
    node.type === "organization"
      ? node.id
      : (node.meta?.organization_id as string | undefined);

  const isDbScopeIcon = isScopeNode && !!node.icon;
  const HardIcon = ICONS[node.type as keyof typeof ICONS] ?? Folder;
  const iconColor = isDbScopeIcon ? node.color : undefined;

  const accent = iconColor
    ? ""
    : (ACCENT_TEXT[node.type] ?? "text-muted-foreground");
  const childCount = node.children.length;

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle(node.id);
    }
    if (!isScopeNode) {
      onSelect(node.id, node.type);
    }
  };

  return (
    <>
      <div
        className={`group flex items-center rounded-md cursor-pointer transition-all ${
          isSelected
            ? "bg-primary/10 ring-1 ring-primary/20"
            : "hover:bg-muted/50"
        } ${isVirtual ? "opacity-70 italic" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 4}px`, paddingRight: "2px" }}
        onClick={handleRowClick}
      >
        {/* Chevron */}
        <div
          className={`h-5 w-5 flex items-center justify-center shrink-0 ${
            hasChildren ? "" : "invisible"
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>

        {/* Icon */}
        {isDbScopeIcon ? (
          <ScopeIcon
            name={node.icon}
            color={!isSelected ? node.color : undefined}
            className={`h-3.5 w-3.5 shrink-0 mr-1.5 ${isSelected ? "text-primary" : accent}`}
          />
        ) : (
          <HardIcon
            className={`h-3.5 w-3.5 shrink-0 mr-1.5 ${isSelected ? "text-primary" : accent}`}
          />
        )}

        {/* Name */}
        <span
          className={`text-xs truncate flex-1 min-w-0 py-1 ${
            isSelected ? "font-semibold text-primary" : ""
          } ${isScopeNode ? "text-muted-foreground" : ""}`}
        >
          {node.name}
        </span>

        {/* Count */}
        {hasChildren && (
          <span className="text-[9px] text-muted-foreground/60 font-mono tabular-nums shrink-0 mr-1">
            {childCount}
          </span>
        )}

        {/* Actions (hover only) */}
        {!isVirtual && !isScopeNode && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {childTypes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    title="Add child"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-50">
                  {childTypes.map((cType) => (
                    <DropdownMenuItem
                      key={cType}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateChild(
                          cType,
                          node.id,
                          node.type as HierarchyNodeType,
                          orgId,
                        );
                      }}
                      className="text-xs flex items-center gap-2"
                    >
                      <Plus className="h-3 w-3" /> {TYPE_LABEL[cType] ?? cType}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {node.type !== "user" && (
              <button
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.type, node.id, node.name);
                }}
                title="Delete"
              >
                <Trash2 className="h-3 w-3 text-destructive/50" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Empty Detail Panel ─────────────────────────────────────────────

function EmptyDetail({
  treeStats,
}: {
  treeStats: { orgs: number; projects: number; tasks: number } | null;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-5">
          <TreePine className="h-8 w-8 text-primary/30" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Context Hub</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Select any item in the tree to manage its context, scopes, templates,
          and variables.
        </p>
        {treeStats && (
          <div className="flex justify-center gap-6 text-center">
            <StatMini
              label="Organizations"
              value={treeStats.orgs}
              icon={Building2}
            />
            <StatMini
              label="Projects"
              value={treeStats.projects}
              icon={FolderKanban}
            />
            <StatMini label="Tasks" value={treeStats.tasks} icon={ListTodo} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────

function getAllTreeIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...getAllTreeIds(node.children));
  }
  return ids;
}

function findNode(nodes: HierarchyNode[], id: string): HierarchyNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function computeStats(tree: HierarchyNode[]): {
  orgs: number;
  projects: number;
  tasks: number;
} {
  const stats = { orgs: 0, projects: 0, tasks: 0 };
  function walk(node: HierarchyNode) {
    if (node.type === "organization") stats.orgs++;
    if (node.type === "project" && !node.meta?.virtual) stats.projects++;
    if (node.type === "task" && !node.meta?.virtual) stats.tasks++;
    node.children.forEach(walk);
  }
  tree.forEach(walk);
  return stats;
}
