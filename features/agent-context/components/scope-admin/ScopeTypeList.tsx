"use client";

import { useState } from "react";
import {
  Plus,
  Loader2,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { deleteScopeType } from "../../redux/scope/scopeTypesSlice";
import { selectScopesByType } from "../../redux/scope/scopesSlice";
import type { ScopeType } from "../../redux/scope/types";
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
import { ScopeTypeFormSheet } from "./ScopeTypeFormSheet";

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ScopeTypeListProps {
  organizationId: string;
  scopeTypes: ScopeType[];
  selectedTypeId: string | null;
  onSelectType: (typeId: string) => void;
  loading: boolean;
}

export function ScopeTypeList({
  organizationId,
  scopeTypes,
  selectedTypeId,
  onSelectType,
  loading,
}: ScopeTypeListProps) {
  const dispatch = useAppDispatch();
  const [formOpen, setFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<ScopeType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScopeType | null>(null);

  const handleEdit = (type: ScopeType, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingType(type);
    setFormOpen(true);
  };

  const handleDelete = (type: ScopeType, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(type);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await dispatch(deleteScopeType(deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col">
      <div className="p-3 flex items-center justify-between border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Scope Types
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            setEditingType(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading && scopeTypes.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="p-1.5 space-y-0.5">
        {scopeTypes.map((type) => (
          <ScopeTypeItem
            key={type.id}
            type={type}
            isSelected={type.id === selectedTypeId}
            onSelect={() => onSelectType(type.id)}
            onEdit={(e) => handleEdit(type, e)}
            onDelete={(e) => handleDelete(type, e)}
          />
        ))}
      </div>

      <ScopeTypeFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        organizationId={organizationId}
        existingTypes={scopeTypes}
        editingType={editingType}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scope Type</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.label_singular}
              &quot; and all its scope instances. Any entities assigned to these
              scopes will lose their assignments. This cannot be undone.
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

function ScopeTypeItem({
  type,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  type: ScopeType;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const scopeCount = useAppSelector((state) =>
    selectScopesByType(state, type.id),
  ).length;

  return (
    <div
      className={cn(
        "w-full flex items-stretch overflow-hidden rounded-lg transition-all group",
        isSelected
          ? "bg-primary/10 dark:bg-primary/15 ring-1 ring-primary/20"
          : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        aria-current={isSelected ? "true" : undefined}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted"
          style={{
            backgroundColor: type.color
              ? hexToRgba(type.color, 0.15)
              : undefined,
          }}
        >
          <ScopeIcon
            name={type.icon}
            color={type.color || undefined}
            className="h-4 w-4"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm",
                isSelected
                  ? "font-medium text-foreground"
                  : "text-foreground/80",
              )}
            >
              {type.label_plural}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {scopeCount} {scopeCount === 1 ? "instance" : "instances"}
          </span>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 py-2 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-1 hover:bg-muted-foreground/10"
          aria-label={`Edit ${type.label_plural}`}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 hover:bg-destructive/10"
          aria-label={`Delete ${type.label_plural}`}
        >
          <Trash2 className="h-3 w-3 text-destructive/70" />
        </button>
      </div>
    </div>
  );
}
