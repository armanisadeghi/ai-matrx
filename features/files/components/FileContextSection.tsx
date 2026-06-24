"use client";

// features/files/components/FileContextSection.tsx
//
// Canonical context assignment for files — org, scope types/scopes, projects,
// and tasks. Two entry points, one behavior:
//
//   • FileContextDialog  — modal opened from … / right-click menus
//   • FileContextPicker  — compact chips + popover (inline surfaces)
//
// Writes:
//   • Scopes → ctx_scope_assignments via ContextAssignmentField (live).
//   • Projects/tasks → logged until ctx_associations migration lands.

import { useMemo } from "react";
import { Building2, ChevronDown, FileText } from "lucide-react";
import { ContextAssignmentDialog } from "@/features/scopes/components/context-assignment/ContextAssignmentDialog";
import { ContextAssignmentPopover } from "@/features/scopes/components/context-assignment/ContextAssignmentPopover";
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
  type ContextAssignmentSaveResult,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import {
  ContextSummaryChips,
  type ContextSummaryInput,
} from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import { setRowScopes } from "@/features/scopes/components/context-assignment/data";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { cn } from "@/lib/utils";

function fileOnSaved(fileId: string, afterSave?: () => void) {
  return (r: ContextAssignmentSaveResult) => {
    if (!r.ok) return;
    setRowScopes(
      "file",
      fileId,
      r.selection.scopeIds.filter((id) => !id.startsWith("new:")),
    );
    afterSave?.();
  };
}

function useFileContextField(fileId: string, fileName: string) {
  const entityScopes = useEntityScopes({
    entityType: "file",
    entityId: fileId,
  });

  const onSaved = useMemo(
    () => fileOnSaved(fileId, () => void entityScopes.refresh()),
    [fileId, entityScopes.refresh],
  );

  const summary: ContextSummaryInput = useMemo(
    () => ({ scopeIds: entityScopes.scopeIds }),
    [entityScopes.scopeIds],
  );

  const fieldProps = {
    mode: "assignment" as const,
    writeMode: "live" as const,
    subject: {
      entityType: "file" as const,
      entityId: fileId,
      title: fileName,
      icon: FileText,
    },
    hideSubject: true,
    onSaved,
  };

  return { summary, fieldProps, entityScopes };
}

export type FileContextDialogProps = {
  fileId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Modal picker — host drives open state from a menu item. */
export function FileContextDialog({
  fileId,
  fileName,
  open,
  onOpenChange,
}: FileContextDialogProps) {
  const { fieldProps } = useFileContextField(fileId, fileName);
  return (
    <ContextAssignmentDialog
      {...fieldProps}
      open={open}
      onOpenChange={onOpenChange}
      sectionHeight={320}
    />
  );
}

export type FileContextPickerProps = {
  fileId: string;
  fileName: string;
  className?: string;
  size?: "sm" | "default";
  align?: "start" | "center" | "end";
};

/** Compact control: scope chips; click opens the canonical picker. */
export function FileContextPicker({
  fileId,
  fileName,
  className,
  size = "sm",
  align = "start",
}: FileContextPickerProps) {
  const { summary, fieldProps } = useFileContextField(fileId, fileName);

  return (
    <ContextAssignmentPopover
      {...fieldProps}
      align={align}
      sectionHeight={320}
      trigger={
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            className,
          )}
        >
          <ContextSummaryChips
            value={summary}
            size={size}
            emptyText="Set context…"
            className="min-w-0 flex-1"
          />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

export type FileContextSectionProps = Pick<
  ContextAssignmentFieldProps,
  "hideSubject" | "sectionHeight" | "className" | "fill" | "checkboxVariant"
> & {
  fileId: string;
  fileName: string;
};

/** Full inline field — expanded panels / detail tabs. */
export function FileContextSection({
  fileId,
  fileName,
  hideSubject = true,
  sectionHeight = 280,
  className,
  fill,
  checkboxVariant,
}: FileContextSectionProps) {
  const { fieldProps } = useFileContextField(fileId, fileName);

  return (
    <ContextAssignmentField
      key={fileId}
      {...fieldProps}
      checkboxVariant={checkboxVariant}
      sectionHeight={sectionHeight}
      className={className}
      fill={fill}
      hideSubject={hideSubject}
    />
  );
}

/** Menu label + icon shared by file action menus. */
export const FILE_CONTEXT_MENU_LABEL = "Set context";
export const FileContextMenuIcon = Building2;
