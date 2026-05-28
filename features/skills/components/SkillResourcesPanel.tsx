"use client";

/**
 * SkillResourcesPanel — lists, creates, edits, deletes, and reorders
 * resources for a given skill. Writes go Supabase direct via the
 * `skl_resources` thunks; RLS gates everything by parent-skill ownership.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  makeSelectResourcesForSkill,
  makeSelectResourcesStatusForSkill,
} from "../redux/skillsSelectors";
import {
  createSkillResourceThunk,
  deleteSkillResourceThunk,
  fetchSkillResourcesThunk,
  reorderSkillResourcesThunk,
  updateSkillResourceThunk,
} from "../redux/skillsThunks";
import type { ResourceRow } from "../types";

interface SkillResourcesPanelProps {
  skillId: string;
  editable?: boolean;
}

const RESOURCE_TYPES: Array<{ value: string; label: string }> = [
  { value: "reference", label: "Reference" },
  { value: "snippet", label: "Snippet" },
  { value: "example", label: "Example" },
  { value: "template", label: "Template" },
  { value: "documentation", label: "Documentation" },
];

const MAX_CONTENT_PREVIEW = 240;

export function SkillResourcesPanel({
  skillId,
  editable = true,
}: SkillResourcesPanelProps) {
  const dispatch = useAppDispatch();

  const selectResources = useMemo(makeSelectResourcesForSkill, []);
  const selectStatus = useMemo(makeSelectResourcesStatusForSkill, []);
  const resources = useAppSelector((state) => selectResources(state, skillId));
  const status = useAppSelector((state) => selectStatus(state, skillId));

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Lazy-load on first mount + when skillId changes.
  useEffect(() => {
    if (!skillId) return;
    if (status === "idle") {
      void dispatch(fetchSkillResourcesThunk({ skillId }));
    }
  }, [dispatch, skillId, status]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      if (!e.over || e.active.id === e.over.id) return;
      const fromId = String(e.active.id);
      const toId = String(e.over.id);
      const ids = resources.map((r) => r.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(toId);
      if (from === -1 || to === -1) return;
      const newIds = [...ids];
      newIds.splice(from, 1);
      newIds.splice(to, 0, fromId);
      try {
        await dispatch(
          reorderSkillResourcesThunk({ skillId, orderedIds: newIds }),
        ).unwrap();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to reorder resources.",
        );
      }
    },
    [dispatch, resources, skillId],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        Resources
        <span className="text-muted-foreground/70 tabular-nums">
          ({resources.length})
        </span>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
            className={cn(
              "ml-auto inline-flex items-center gap-1 h-6 px-2 rounded text-xs",
              "border border-dashed border-border text-muted-foreground",
              "hover:bg-accent hover:text-foreground transition-colors",
            )}
          >
            <Plus className="h-3 w-3" />
            Add resource
          </button>
        )}
      </div>

      {status === "loading" && resources.length === 0 ? (
        <div className="flex items-center justify-start gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading resources…
        </div>
      ) : status === "error" ? (
        <div className="text-xs text-destructive">
          Failed to load resources for this skill.
        </div>
      ) : resources.length === 0 && !creating ? (
        <div className="text-xs text-muted-foreground/80">
          No resources yet.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={resources.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="rounded-md border border-border divide-y divide-border/60 bg-card">
              {resources.map((r) => (
                <SortableResourceRow
                  key={r.id}
                  row={r}
                  editable={editable}
                  isEditing={editingId === r.id}
                  onStartEdit={() => {
                    setEditingId(r.id);
                    setCreating(false);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {creating && (
        <ResourceEditor
          skillId={skillId}
          onCancel={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function SortableResourceRow({
  row,
  editable,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: {
  row: ResourceRow;
  editable: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete resource “${row.filename}”?`,
      description: "Soft-delete — the row is set to is_active=false and stops appearing in the picker.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await dispatch(
        deleteSkillResourceThunk({
          resourceId: row.id,
          skillId: row.skillId,
        }),
      ).unwrap();
      toast.success(`Deleted “${row.filename}”.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete resource.",
      );
    }
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="px-3 py-2">
        <ResourceEditor
          skillId={row.skillId}
          existing={row}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 px-3 py-2 group"
    >
      {editable ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-grab active:cursor-grabbing mt-0.5"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      ) : (
        <span className="inline-block h-5 w-5" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{row.filename}</span>
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] font-normal text-muted-foreground"
          >
            {row.resourceType}
          </Badge>
          {row.mimeType && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px] font-normal text-muted-foreground font-mono"
            >
              {row.mimeType}
            </Badge>
          )}
        </div>
        {row.content && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {row.content.length > MAX_CONTENT_PREVIEW
              ? `${row.content.slice(0, MAX_CONTENT_PREVIEW)}…`
              : row.content}
          </p>
        )}
      </div>

      {editable && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit"
            title="Edit"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete"
            title="Delete"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editor (used for both create + edit)
// ---------------------------------------------------------------------------

function ResourceEditor({
  skillId,
  existing,
  onCancel,
  onSaved,
}: {
  skillId: string;
  existing?: ResourceRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const [filename, setFilename] = useState(existing?.filename ?? "");
  const [resourceType, setResourceType] = useState(
    existing?.resourceType ?? "reference",
  );
  const [content, setContent] = useState(existing?.content ?? "");
  const [mimeType, setMimeType] = useState(existing?.mimeType ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!existing;
  const showSoftWarning =
    content.length > 256 * 1024
      ? "Large content (>256 KB). Consider linking to a storage path instead."
      : null;

  const save = async () => {
    const trimmedFile = filename.trim();
    if (!trimmedFile) {
      toast.error("Filename is required.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && existing) {
        await dispatch(
          updateSkillResourceThunk({
            resourceId: existing.id,
            patch: {
              filename: trimmedFile,
              resourceType: resourceType.trim() || "reference",
              content: content,
              mimeType: mimeType.trim() || null,
            },
          }),
        ).unwrap();
        toast.success(`Saved “${trimmedFile}”.`);
      } else {
        await dispatch(
          createSkillResourceThunk({
            draft: {
              skillId,
              filename: trimmedFile,
              resourceType: resourceType.trim() || "reference",
              content,
              mimeType: mimeType.trim() || null,
              sortOrder: 0,
            },
          }),
        ).unwrap();
        toast.success(`Created “${trimmedFile}”.`);
      }
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save resource.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Filename
          </Label>
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="usage.md"
            className="h-8 text-sm font-mono"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Type
          </Label>
          <select
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            className={cn(
              "h-8 px-2 text-sm rounded-md w-full",
              "bg-background border border-border text-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          >
            {RESOURCE_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
            {!RESOURCE_TYPES.some((rt) => rt.value === resourceType) && (
              <option value={resourceType}>{resourceType}</option>
            )}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          MIME type
        </Label>
        <Input
          value={mimeType}
          onChange={(e) => setMimeType(e.target.value)}
          placeholder="text/markdown"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Content
        </Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Inline text / markdown content for this resource."
          className="font-mono text-xs"
        />
        {showSoftWarning && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {showSoftWarning}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          )}
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {isEdit ? "Save" : "Create"}
        </button>
      </div>
    </div>
  );
}
