"use client";

/**
 * SkillCategoryTreeEditor
 *
 * Full CRUD editor for the `skill.category` tree.
 *
 *   - Drag-to-reparent via `@dnd-kit/sortable` over a flattened list of
 *     visible rows. On drop, computes (parent_category_id, sort_order)
 *     for the moved row + renumbers affected siblings.
 *   - Inline rename (double-click label, Enter to save, Escape to cancel).
 *   - Color swatches + custom HEX input.
 *   - Icon name input (free-string; tooltip shows the rendered Lucide icon
 *     when the name resolves).
 *   - "+ Add child" / "Delete" per row, "+ New root category" at top.
 *
 * Writes are smart-dispatched through the skills thunks: Supabase direct
 * for owned rows, Python admin endpoints for system rows.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkillCategories } from "../hooks/useSkillCategories";
import {
  createCategoryThunk,
  deleteCategoryThunk,
  reparentCategoryThunk,
  updateCategoryThunk,
} from "../redux/skillsThunks";
import type { CategoryRow } from "../types";

interface SkillCategoryTreeEditorProps {
  onBack: () => void;
}

interface FlatNode {
  id: string;
  depth: number;
  parentId: string | null;
  row: CategoryRow;
  hasChildren: boolean;
}

const COLOR_SWATCHES = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#9ca3af", // gray
];

export function SkillCategoryTreeEditor({
  onBack,
}: SkillCategoryTreeEditorProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const dispatch = useAppDispatch();
  const { categories, loading, error, reload } = useSkillCategories();

  // Collapsed state per node id — default expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<{
    parentId: string | null;
  } | null>(null);

  // Flatten the visible tree into a sortable list.
  const flatNodes = useMemo<FlatNode[]>(() => {
    const byParent: Record<string, CategoryRow[]> = {};
    for (const c of categories) {
      const key = c.parentCategoryId ?? "__root__";
      (byParent[key] ??= []).push(c);
    }
    for (const k of Object.keys(byParent)) {
      byParent[k].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.label.localeCompare(b.label),
      );
    }
    const out: FlatNode[] = [];
    const walk = (parentId: string | null, depth: number) => {
      const kids = byParent[parentId ?? "__root__"] ?? [];
      for (const k of kids) {
        const grandKids = byParent[k.id] ?? [];
        out.push({
          id: k.id,
          depth,
          parentId,
          row: k,
          hasChildren: grandKids.length > 0,
        });
        if (!collapsed.has(k.id)) {
          walk(k.id, depth + 1);
        }
      }
    };
    walk(null, 0);
    return out;
  }, [categories, collapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActiveId(null);
      const activeIdStr = String(e.active.id);
      const overId = e.over ? String(e.over.id) : null;
      if (!overId || activeIdStr === overId) return;

      const activeNode = flatNodes.find((n) => n.id === activeIdStr);
      const overNode = flatNodes.find((n) => n.id === overId);
      if (!activeNode || !overNode) return;

      // Drop policy: dragging row A over row B puts A as a sibling of B
      // under B's parent. (Drop *into* a folder is handled by dragging
      // onto the folder's drop indicator — simplified to "match drop
      // target's parent" for v1; "+ Add child" button covers explicit
      // nesting.)
      const newParentId = overNode.parentId;

      // Build the new sibling order under the destination parent.
      const siblings = flatNodes
        .filter((n) => n.parentId === newParentId)
        .map((n) => n.id);
      const fromIdx = siblings.indexOf(activeIdStr);
      const overIdx = siblings.indexOf(overId);

      let newOrder: string[];
      if (fromIdx === -1) {
        // Moved across parents — insert before overId.
        newOrder = [...siblings];
        newOrder.splice(overIdx, 0, activeIdStr);
      } else {
        newOrder = [...siblings];
        newOrder.splice(fromIdx, 1);
        newOrder.splice(overIdx, 0, activeIdStr);
      }

      try {
        await dispatch(
          reparentCategoryThunk({
            id: activeIdStr,
            newParentId,
            newSiblingOrder: newOrder,
          }),
        ).unwrap();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to move category.",
        );
      }
    },
    [dispatch, flatNodes],
  );

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRename = useCallback(
    async (id: string, label: string) => {
      try {
        await dispatch(updateCategoryThunk({ id, patch: { label } })).unwrap();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to rename category.",
        );
      }
    },
    [dispatch],
  );

  const onSetColor = useCallback(
    async (id: string, color: string | null) => {
      try {
        await dispatch(updateCategoryThunk({ id, patch: { color } })).unwrap();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update color.",
        );
      }
    },
    [dispatch],
  );

  const onSetIconName = useCallback(
    async (id: string, iconName: string | null) => {
      try {
        await dispatch(
          updateCategoryThunk({ id, patch: { iconName } }),
        ).unwrap();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update icon.",
        );
      }
    },
    [dispatch],
  );

  const onDelete = useCallback(
    async (row: CategoryRow) => {
      const ok = await confirm({
        title: `Delete “${row.label}”?`,
        description:
          "Deactivates the category. Skills already pointing at it stay assigned but the category disappears from pickers.",
        confirmLabel: "Delete category",
        variant: "destructive",
      });
      if (!ok) return;
      try {
        await dispatch(deleteCategoryThunk({ id: row.id })).unwrap();
        toast.success(`Deleted “${row.label}”.`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete category.",
        );
      }
    },
    [dispatch],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header
        onBack={onBack}
        onReload={reload}
        onNewRoot={() => setCreatingUnder({ parentId: null })}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && categories.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading categories…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : categories.length === 0 && !creatingUnder ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No categories yet. Click <strong>+ New category</strong> to add one.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={flatNodes.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="py-2">
                {flatNodes.map((node) => (
                  <SortableCategoryRow
                    key={node.id}
                    node={node}
                    collapsed={collapsed.has(node.id)}
                    onToggleCollapse={() => toggleCollapse(node.id)}
                    onRename={(label) => onRename(node.id, label)}
                    onSetColor={(color) => onSetColor(node.id, color)}
                    onSetIconName={(name) => onSetIconName(node.id, name)}
                    onAddChild={() => setCreatingUnder({ parentId: node.id })}
                    onDelete={() => onDelete(node.row)}
                    isAdmin={isAdmin}
                  />
                ))}
                {creatingUnder && (
                  <CreateCategoryRow
                    parentId={creatingUnder.parentId}
                    depth={
                      creatingUnder.parentId
                        ? (flatNodes.find(
                            (n) => n.id === creatingUnder.parentId,
                          )?.depth ?? 0) + 1
                        : 0
                    }
                    onCancel={() => setCreatingUnder(null)}
                    onCreated={() => setCreatingUnder(null)}
                  />
                )}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeId
                ? (() => {
                    const node = flatNodes.find((n) => n.id === activeId);
                    if (!node) return null;
                    return (
                      <div className="px-3 py-1.5 rounded-md border border-border bg-card shadow-md text-sm">
                        {node.row.label}
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function SortableCategoryRow({
  node,
  collapsed,
  onToggleCollapse,
  onRename,
  onSetColor,
  onSetIconName,
  onAddChild,
  onDelete,
  isAdmin,
}: {
  node: FlatNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (label: string) => Promise<void>;
  onSetColor: (color: string | null) => Promise<void>;
  onSetIconName: (name: string | null) => Promise<void>;
  onAddChild: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isSystemRow = !node.row.userId;
  // Non-admins viewing a system row → read-only.
  const readOnly = isSystemRow && !isAdmin;

  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(node.row.label);
  useEffect(() => setDraftLabel(node.row.label), [node.row.label]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const commitRename = async () => {
    const v = draftLabel.trim();
    setRenaming(false);
    if (!v || v === node.row.label) return;
    await onRename(v);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, paddingLeft: `${node.depth * 16 + 8}px` }}
      className={cn(
        "flex items-center gap-1.5 py-1 pr-2 group rounded text-sm",
        "hover:bg-muted/40 transition-colors",
      )}
    >
      {/* Drag handle */}
      {!readOnly ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      ) : (
        <span className="inline-block h-5 w-5" />
      )}

      {/* Expand / collapse */}
      {node.hasChildren ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      ) : (
        <span className="inline-block h-5 w-5" />
      )}

      {/* Color swatch + picker */}
      <ColorSwatchButton
        color={node.row.color}
        readOnly={readOnly}
        onChange={onSetColor}
      />

      {/* Label (inline rename) */}
      {renaming ? (
        <Input
          ref={inputRef}
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitRename();
            } else if (e.key === "Escape") {
              setDraftLabel(node.row.label);
              setRenaming(false);
            }
          }}
          className="h-6 text-sm flex-1 min-w-0"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => !readOnly && setRenaming(true)}
          className={cn(
            "flex-1 text-left truncate",
            !readOnly && "cursor-text",
          )}
          title={
            readOnly ? "Read-only (system category)" : "Double-click to rename"
          }
        >
          {node.row.label}
        </button>
      )}

      <Badge
        variant="outline"
        className="h-4 px-1 text-[10px] font-normal text-muted-foreground"
      >
        {node.row.categoryKey}
      </Badge>

      {isSystemRow && (
        <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
          System
        </Badge>
      )}

      {/* Icon name editor (typeahead) */}
      {!readOnly && (
        <IconNamePicker iconName={node.row.iconName} onChange={onSetIconName} />
      )}

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={onAddChild}
            aria-label="Add child category"
            title="Add child"
            className="inline-flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete category"
            title="Delete"
            className="inline-flex items-center justify-center h-6 w-6 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color swatch + picker
// ---------------------------------------------------------------------------

function ColorSwatchButton({
  color,
  readOnly,
  onChange,
}: {
  color: string | null;
  readOnly?: boolean;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(color ?? "");

  if (readOnly) {
    return (
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0 border border-border"
        style={{ backgroundColor: color ?? "transparent" }}
        aria-hidden
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Set color"
          className={cn(
            "inline-block h-3 w-3 rounded-full shrink-0 border border-border",
            "hover:scale-125 transition-transform",
          )}
          style={{ backgroundColor: color ?? "transparent" }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="text-xs text-muted-foreground mb-1.5">Color</div>
        <div className="grid grid-cols-6 gap-1 mb-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => {
                onChange(c);
                setCustom(c);
                setOpen(false);
              }}
              className={cn(
                "h-5 w-5 rounded-full border border-border",
                "hover:scale-110 transition-transform",
                color === c && "ring-2 ring-ring",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="#000000"
            className="h-7 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => {
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(custom.trim())) {
                onChange(custom.trim());
                setOpen(false);
              }
            }}
            className="inline-flex items-center h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Set
          </button>
          {color && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setCustom("");
                setOpen(false);
              }}
              aria-label="Clear color"
              title="Clear color"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Icon name picker (typeahead — free-string for now; the agent-connections
// renderer already has fall-back logic for unrecognised names)
// ---------------------------------------------------------------------------

function IconNamePicker({
  iconName,
  onChange,
}: {
  iconName: string | null;
  onChange: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(iconName ?? "");
  useEffect(() => setDraft(iconName ?? ""), [iconName]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Set icon"
          title={iconName ? `Icon: ${iconName}` : "Set icon"}
          className={cn(
            "inline-flex items-center justify-center h-6 px-1.5 rounded text-[10px] font-mono",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            "border border-dashed border-border",
          )}
        >
          {iconName || "icon"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <Label className="text-xs text-muted-foreground">
          Lucide icon name (e.g. <span className="font-mono">Brain</span>,{" "}
          <span className="font-mono">Folder</span>)
        </Label>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Brain"
            className="h-7 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => {
              onChange(draft.trim() || null);
              setOpen(false);
            }}
            className="inline-flex items-center h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Set
          </button>
          {iconName && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setDraft("");
                setOpen(false);
              }}
              aria-label="Clear icon"
              title="Clear icon"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Resolved at render time. Unknown names render as a fallback dot.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Inline create row
// ---------------------------------------------------------------------------

function CreateCategoryRow({
  parentId,
  depth,
  onCancel,
  onCreated,
}: {
  parentId: string | null;
  depth: number;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [isSystem, setIsSystem] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-derive key from label until the user customises it.
  const keyTouchedRef = useRef(false);
  useEffect(() => {
    if (keyTouchedRef.current) return;
    setKey(
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100),
    );
  }, [label]);

  const create = async () => {
    const trimmedLabel = label.trim();
    const trimmedKey = key.trim();
    if (!trimmedLabel || !trimmedKey) {
      toast.error("Label and key are required.");
      return;
    }
    setSaving(true);
    try {
      await dispatch(
        createCategoryThunk({
          draft: {
            label: trimmedLabel,
            categoryKey: trimmedKey,
            parentCategoryId: parentId,
            isSystem: isSystem && isAdmin,
          },
        }),
      ).unwrap();
      toast.success(`Created “${trimmedLabel}”.`);
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create category.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 py-1 pr-2 bg-accent/30 rounded text-sm"
      style={{ paddingLeft: `${depth * 16 + 28}px` }}
    >
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        className="h-7 text-sm flex-1 min-w-0"
        autoFocus
      />
      <Input
        value={key}
        onChange={(e) => {
          keyTouchedRef.current = true;
          setKey(e.target.value);
        }}
        placeholder="category_key"
        className="h-7 text-xs font-mono w-40"
      />
      {isAdmin && (
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Checkbox
            checked={isSystem}
            onCheckedChange={(v) => setIsSystem(v === true)}
          />
          System
        </label>
      )}
      <button
        type="button"
        onClick={create}
        disabled={saving}
        className="inline-flex items-center h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  onBack,
  onReload,
  onNewRoot,
}: {
  onBack: () => void;
  onReload: () => void;
  onNewRoot: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/60">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 flex-1">
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">Categories</div>
      </div>
      <button
        type="button"
        onClick={onNewRoot}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        New category
      </button>
      <button
        type="button"
        onClick={onReload}
        className={cn(
          "h-8 px-3 rounded-md text-xs",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        Refresh
      </button>
    </div>
  );
}
