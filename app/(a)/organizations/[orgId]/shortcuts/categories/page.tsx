"use client";

import React, { useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { CategoryForm } from "@/features/agent-shortcuts/components/CategoryForm";
import { CategoryTree } from "@/features/agent-shortcuts/components/CategoryTree";
import { useAgentShortcutCrud } from "@/features/agent-shortcuts/hooks/useAgentShortcutCrud";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type {
  AgentShortcutCategory,
  PlacementType,
} from "@/features/agent-shortcuts/types";
import { useOrgShortcutsContext } from "../OrgShortcutsContext";

const SCOPE = "organization" as const;

export default function OrgCategoriesPage() {
  const { toast } = useToast();
  const { organizationId, organizationName, canWrite } =
    useOrgShortcutsContext();
  const { categories, isLoading, refetch } = useAgentShortcuts({
    scope: SCOPE,
    scopeId: organizationId,
  });
  const crud = useAgentShortcutCrud({ scope: SCOPE, scopeId: organizationId });

  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AgentShortcutCategory | null>(null);
  const [defaultPlacement, setDefaultPlacement] = useState<
    PlacementType | undefined
  >(undefined);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<AgentShortcutCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = canWrite
    ? (parent?: AgentShortcutCategory) => {
        setEditingCategory(null);
        setDefaultPlacement(
          parent ? (parent.placementType as PlacementType) : undefined,
        );
        setDefaultParentId(parent?.id ?? null);
        setFormOpen(true);
      }
    : undefined;

  const handleEdit = canWrite
    ? (category: AgentShortcutCategory) => {
        setEditingCategory(category);
        setDefaultPlacement(undefined);
        setDefaultParentId(null);
        setFormOpen(true);
      }
    : undefined;

  const handleToggleActive = canWrite
    ? async (category: AgentShortcutCategory) => {
        try {
          await crud.updateCategory(category.id, {
            isActive: !category.isActive,
          });
          toast({
            title: category.isActive ? "Deactivated" : "Activated",
            description: category.label,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to update category";
          toast({
            title: "Update failed",
            description: message,
            variant: "destructive",
          });
        }
      }
    : undefined;

  const handleDeleteRequest = canWrite
    ? (category: AgentShortcutCategory) => setDeleteTarget(category)
    : undefined;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await crud.deleteCategory(deleteTarget.id);
      toast({ title: "Deleted", description: deleteTarget.label });
      setDeleteTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete category";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground truncate">
              Organization Categories
            </h1>
            {!canWrite && (
              <Badge
                variant="outline"
                className="text-[11px] inline-flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                Read-only
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Categories shared across {organizationName}.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <CategoryTree
          scope={SCOPE}
          scopeId={organizationId}
          categories={categories}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
          onToggleActive={handleToggleActive}
          readonly={!canWrite}
        />
      </div>

      {canWrite && (
        <CategoryForm
          scope={SCOPE}
          scopeId={organizationId}
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => setFormOpen(false)}
          allCategories={categories}
          editingCategory={editingCategory}
          defaultPlacementType={defaultPlacement}
          defaultParentCategoryId={defaultParentId}
        />
      )}

      {canWrite && deleteTarget && (
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &quot;{deleteTarget.label}&quot; from {organizationName}?
                Child categories and shortcuts assigned to this category may be
                orphaned. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
