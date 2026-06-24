"use client";

import { useState } from "react";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectScopeTreeByType,
  selectScopesLoading,
  deleteScope,
} from "../../redux/scope/scopesSlice";
import { selectAssignmentCountByScope } from "../../redux/scope/scopeAssignmentsSlice";
import type { ScopeType, Scope } from "../../redux/scope/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
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
import { ScopeFormSheet } from "./ScopeFormSheet";

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ScopeTreeNode = Scope & { children: ScopeTreeNode[] };

interface ScopeInstancePanelProps {
  organizationId: string;
  scopeType: ScopeType;
}

export function ScopeInstancePanel({
  organizationId,
  scopeType,
}: ScopeInstancePanelProps) {
  const dispatch = useAppDispatch();
  const tree = useAppSelector((state) =>
    selectScopeTreeByType(state, scopeType.id),
  ) as ScopeTreeNode[];
  const loading = useAppSelector(selectScopesLoading);
  const assignmentCounts = useAppSelector(selectAssignmentCountByScope);

  const [formOpen, setFormOpen] = useState(false);
  const [editingScope, setEditingScope] = useState<Scope | null>(null);
  const [parentScopeId, setParentScopeId] = useState<string | undefined>(
    undefined,
  );
  const [deleteTarget, setDeleteTarget] = useState<Scope | null>(null);

  const totalCount = countNodes(tree);

  const handleAdd = (parentId?: string) => {
    setEditingScope(null);
    setParentScopeId(parentId);
    setFormOpen(true);
  };

  const handleEdit = (scope: Scope) => {
    setEditingScope(scope);
    setParentScopeId(undefined);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await dispatch(deleteScope(deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted"
            style={{
              backgroundColor: scopeType.color
                ? hexToRgba(scopeType.color, 0.15)
                : undefined,
            }}
          >
            <ScopeIcon
              name={scopeType.icon}
              color={scopeType.color || undefined}
              className="h-4 w-4"
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold">{scopeType.label_plural}</h2>
            <p className="text-[11px] text-muted-foreground">
              {totalCount} {totalCount === 1 ? "instance" : "instances"}
              {scopeType.description && ` \u00b7 ${scopeType.description}`}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => handleAdd()}
        >
          <Plus className="h-3.5 w-3.5" />
          Add {scopeType.label_singular}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tree.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div
              className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-muted mb-3"
              style={{
                backgroundColor: scopeType.color
                  ? hexToRgba(scopeType.color, 0.12)
                  : undefined,
              }}
            >
              <ScopeIcon
                name={scopeType.icon}
                color={scopeType.color || undefined}
                className="h-6 w-6 text-muted-foreground"
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              No {scopeType.label_plural.toLowerCase()} yet
            </p>
            <Button size="sm" onClick={() => handleAdd()} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create First {scopeType.label_singular}
            </Button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <ScopeTreeItem
                key={node.id}
                node={node}
                depth={0}
                color={scopeType.color}
                singularLabel={scopeType.label_singular}
                assignmentCounts={assignmentCounts}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onAddChild={handleAdd}
              />
            ))}
          </div>
        )}
      </div>

      <ScopeFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        organizationId={organizationId}
        scopeType={scopeType}
        editingScope={editingScope}
        parentScopeId={parentScopeId}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scope</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot; and
              any child scopes. All entity assignments to this scope will be
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScopeTreeItem({
  node,
  depth,
  color,
  singularLabel,
  assignmentCounts,
  onEdit,
  onDelete,
  onAddChild,
}: {
  node: ScopeTreeNode;
  depth: number;
  color: string;
  singularLabel: string;
  assignmentCounts: Record<string, number>;
  onEdit: (scope: Scope) => void;
  onDelete: (scope: Scope) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const count = assignmentCounts[node.id] ?? 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors group",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "h-5 w-5 flex items-center justify-center rounded",
            hasChildren ? "hover:bg-muted" : "invisible",
          )}
        >
          {hasChildren &&
            (expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ))}
        </button>

        <div
          className="h-2 w-2 rounded-full flex-shrink-0 bg-muted-foreground"
          style={{ backgroundColor: color || undefined }}
        />

        <div className="flex-1 min-w-0">
          <span className="text-sm">{node.name}</span>
          {node.description && (
            <span className="text-[11px] text-muted-foreground ml-2 hidden sm:inline">
              {node.description}
            </span>
          )}
        </div>

        {count > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5 gap-1 px-1.5">
            <Users className="h-3 w-3" />
            {count}
          </Badge>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onAddChild(node.id)}
            className="p-1 rounded hover:bg-muted"
            title={`Add child ${singularLabel}`}
          >
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(node)}
            className="p-1 rounded hover:bg-muted"
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(node)}
            className="p-1 rounded hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3 text-destructive/70" />
          </button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <ScopeTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              color={color}
              singularLabel={singularLabel}
              assignmentCounts={assignmentCounts}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countNodes(nodes: ScopeTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}
