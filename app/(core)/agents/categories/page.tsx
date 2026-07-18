"use client";

import React, { useState } from "react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
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
import { DuplicateCategoryModal } from "@/features/agent-shortcuts/components/DuplicateCategoryModal";
import { useAgentShortcutCrud } from "@/features/agent-shortcuts/hooks/useAgentShortcutCrud";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type { AgentShortcutCategoryDef as AgentShortcutCategory } from "@/features/agents/redux/agent-shortcut-categories/types";
import type { PlacementType } from "@/features/agent-shortcuts/constants";

const SCOPE = "user" as const;

export default function UserCategoriesPage() {
  const { toast } = useToast();
  const { categories, isLoading, refetch } = useAgentShortcuts({
    scope: SCOPE,
  });
  const crud = useAgentShortcutCrud({ scope: SCOPE });

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

  const [duplicateTarget, setDuplicateTarget] =
    useState<AgentShortcutCategory | null>(null);

  const handleCreate = (parent?: AgentShortcutCategory) => {
    setEditingCategory(null);
    setDefaultPlacement(
      parent ? (parent.placementType as PlacementType) : undefined,
    );
    setDefaultParentId(parent?.id ?? null);
    setFormOpen(true);
  };

  const handleEdit = (category: AgentShortcutCategory) => {
    setEditingCategory(category);
    setDefaultPlacement(undefined);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  const handleToggleActive = async (category: AgentShortcutCategory) => {
    try {
      await crud.updateCategory(category.id, { isActive: !category.isActive });
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
  };

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
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <h1 className="text-sm font-medium text-foreground truncate">
            My Categories
          </h1>
          <div className="ml-auto flex items-center">
            <RefreshCwTapButton
              onClick={() => refetch()}
              disabled={isLoading}
              ariaLabel="Refresh categories"
            />
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <CategoryTree
          scope={SCOPE}
          categories={categories}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDuplicate={(c) => setDuplicateTarget(c)}
          onDelete={(c) => setDeleteTarget(c)}
          onToggleActive={handleToggleActive}
        />
      </div>

      <CategoryForm
        scope={SCOPE}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => setFormOpen(false)}
        onDuplicate={(c) => {
          setFormOpen(false);
          setDuplicateTarget(c);
        }}
        allCategories={categories}
        editingCategory={editingCategory}
        defaultPlacementType={defaultPlacement}
        defaultParentCategoryId={defaultParentId}
      />

      <DuplicateCategoryModal
        scope={SCOPE}
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        onSuccess={() => setDuplicateTarget(null)}
        category={duplicateTarget}
        categories={categories}
      />

      {deleteTarget && (
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &quot;{deleteTarget.label}&quot;? Child categories and
                shortcuts assigned to this category may be orphaned. This cannot
                be undone.
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
