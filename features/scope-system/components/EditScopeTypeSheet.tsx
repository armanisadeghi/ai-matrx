"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Check,
  Pencil,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { ScopeColorPicker } from "./ScopeColorPicker";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateScopeType,
  deleteScopeType,
  selectScopeTypeById,
  fetchScopeTypes,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  createContextItem,
  updateContextItem,
  deleteContextItem,
  selectItemsByType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { slugifyKey, toSlug } from "@/features/scope-system/utils/slugify";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EditContextItemSheet } from "./EditContextItemSheet";

interface EditScopeTypeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  typeId: string;
  onDeleted?: () => void;
}

type ItemDraft = {
  /** Existing item id, or `new:<rowId>` for an unsaved row. */
  id: string;
  rowId: string;
  display_name: string;
  initialDisplayName?: string;
  toDelete?: boolean;
};

const newRow = (): ItemDraft => ({
  id: `new:${Math.random().toString(36).slice(2)}`,
  rowId: Math.random().toString(36).slice(2),
  display_name: "",
});

export function EditScopeTypeSheet({
  open,
  onOpenChange,
  orgId,
  typeId,
  onDeleted,
}: EditScopeTypeSheetProps) {
  const dispatch = useAppDispatch();
  const scopeType = useAppSelector((s) => selectScopeTypeById(s, typeId));
  const existingItems = useAppSelector((s) => selectItemsByType(s, typeId));

  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Basics
  const [labelSingular, setLabelSingular] = useState("");
  const [labelPlural, setLabelPlural] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [color, setColor] = useState("blue");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);

  // Advanced
  const [sortOrder, setSortOrder] = useState(0);
  const [maxAssignments, setMaxAssignments] = useState("");

  // Full-edit sheet
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Refs to per-row inputs so we can focus the next/new row on Enter
  const rowInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !scopeType) return;
    setLabelSingular(scopeType.label_singular);
    setLabelPlural(scopeType.label_plural);
    setIcon(scopeType.icon || "Folder");
    setColor(scopeType.color || "blue");
    setDescription(scopeType.description);
    setSlug(scopeType.slug ?? "");
    setSortOrder(scopeType.sort_order);
    setMaxAssignments(
      scopeType.max_assignments_per_entity != null
        ? String(scopeType.max_assignments_per_entity)
        : "",
    );
    setAdvancedOpen(false);
    dispatch(listScopeTypeItems(typeId));
  }, [open, scopeType, typeId, dispatch]);

  useEffect(() => {
    if (!open) return;
    setItems(
      existingItems.map((i) => ({
        id: i.id,
        rowId: i.id,
        display_name: i.display_name,
        initialDisplayName: i.display_name,
      })),
    );
  }, [open, existingItems]);

  // After we append a new row, focus its input.
  useEffect(() => {
    const target = pendingFocusRowRef.current;
    if (!target) return;
    const el = rowInputsRef.current.get(target);
    if (el) {
      el.focus();
      pendingFocusRowRef.current = null;
    }
  }, [items]);

  function patchItem(rowId: string, patch: Partial<ItemDraft>) {
    setItems((rows) =>
      rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  function appendNewRow() {
    const row = newRow();
    pendingFocusRowRef.current = row.rowId;
    setItems((rows) => [...rows, row]);
  }

  function toggleDelete(rowId: string) {
    setItems((rows) => {
      const row = rows.find((r) => r.rowId === rowId);
      if (!row) return rows;
      if (row.id.startsWith("new:")) {
        return rows.filter((r) => r.rowId !== rowId);
      }
      return rows.map((r) =>
        r.rowId === rowId ? { ...r, toDelete: !r.toDelete } : r,
      );
    });
  }

  function handleRowKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    row: ItemDraft,
    index: number,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      // If there's a row below, focus it. Otherwise create a new row.
      const next = items[index + 1];
      if (next) {
        rowInputsRef.current.get(next.rowId)?.focus();
      } else {
        appendNewRow();
      }
    }
  }

  async function handleSave() {
    if (!scopeType) return;
    const trimmedSingular = labelSingular.trim();
    const trimmedPlural = labelPlural.trim() || trimmedSingular;
    if (!trimmedSingular) {
      toast.error("Name is required");
      return;
    }
    const trimmedSlug = slug.trim();
    if (trimmedSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      toast.error("URL slug must be lowercase letters, numbers, and hyphens");
      return;
    }
    setBusy(true);
    try {
      const labelChanged =
        trimmedSingular !== scopeType.label_singular ||
        trimmedPlural !== scopeType.label_plural;
      const iconChanged = (icon || "Folder") !== scopeType.icon;
      const descriptionChanged = description !== scopeType.description;
      const colorChanged = color !== scopeType.color;
      const slugChanged = trimmedSlug !== (scopeType.slug ?? "");
      const sortChanged = sortOrder !== scopeType.sort_order;
      const maxChanged =
        (maxAssignments ? parseInt(maxAssignments, 10) : null) !==
        scopeType.max_assignments_per_entity;

      if (
        labelChanged ||
        iconChanged ||
        descriptionChanged ||
        colorChanged ||
        slugChanged ||
        sortChanged ||
        maxChanged
      ) {
        await dispatch(
          updateScopeType({
            type_id: scopeType.id,
            label_singular: trimmedSingular,
            label_plural: trimmedPlural,
            icon: icon || "Folder",
            description,
            color,
            slug: slugChanged ? trimmedSlug || undefined : undefined,
            sort_order: sortOrder,
            max_assignments: maxAssignments
              ? parseInt(maxAssignments, 10)
              : undefined,
          }),
        ).unwrap();
      }

      // Context items: delete, rename, create
      for (const row of items) {
        if (row.toDelete && !row.id.startsWith("new:")) {
          await dispatch(deleteContextItem(row.id)).unwrap();
          continue;
        }
        const trimmedName = row.display_name.trim();
        if (row.id.startsWith("new:")) {
          if (!trimmedName) continue;
          await dispatch(
            createContextItem({
              scope_type_id: scopeType.id,
              key: slugifyKey(trimmedName) || trimmedName.toLowerCase(),
              slug: toSlug(trimmedName) || undefined,
              display_name: trimmedName,
            }),
          ).unwrap();
        } else if (trimmedName !== row.initialDisplayName) {
          if (!trimmedName) continue;
          await dispatch(
            updateContextItem({
              id: row.id,
              display_name: trimmedName,
            }),
          ).unwrap();
        }
      }

      dispatch(listScopeTypeItems(scopeType.id));
      dispatch(fetchScopeTypes(orgId));

      toast.success(`Updated "${trimmedPlural}"`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!scopeType) return;
    const ok = await confirm({
      title: `Delete ${scopeType.label_singular}?`,
      description: `This permanently deletes the "${scopeType.label_plural}" scope, all its scopes, context items, and stored values. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await dispatch(deleteScopeType(scopeType.id)).unwrap();
      dispatch(fetchScopeTypes(orgId));
      toast.success(`Deleted "${scopeType.label_plural}"`);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  if (!scopeType) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => (!busy ? onOpenChange(o) : null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Edit scope type</SheetTitle>
            <SheetDescription>
              Rename, change the icon and color, manage context items, and
              adjust advanced settings.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Names */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name (one item)</Label>
                <Input
                  value={labelSingular}
                  onChange={(e) => setLabelSingular(e.target.value)}
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name (many)</Label>
                <Input
                  value={labelPlural}
                  onChange={(e) => setLabelPlural(e.target.value)}
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
            </div>

            {/* Icon + Color in one row */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <div className="space-y-1.5">
                <Label className="text-xs">Icon</Label>
                <IconInputWithValidation
                  value={icon}
                  onChange={setIcon}
                  showLucideLink={false}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <ScopeColorPicker
                  value={color}
                  onChange={setColor}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <ProTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                minHeight={64}
                autoGrow
                disabled={busy}
              />
            </div>

            {/* Rapid-add context items list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  Context items ({items.filter((i) => !i.toDelete).length})
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Press Enter to add another
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((row, idx) => {
                  const isNew = row.id.startsWith("new:");
                  const removed = !!row.toDelete;
                  return (
                    <div key={row.rowId} className="flex items-center gap-1.5">
                      <Input
                        ref={(el) => {
                          if (el) rowInputsRef.current.set(row.rowId, el);
                          else rowInputsRef.current.delete(row.rowId);
                        }}
                        placeholder="Context item name"
                        value={row.display_name}
                        onChange={(e) =>
                          patchItem(row.rowId, {
                            display_name: e.target.value,
                          })
                        }
                        onKeyDown={(e) => handleRowKeyDown(e, row, idx)}
                        disabled={busy || removed}
                        style={{ fontSize: "16px" }}
                        className={
                          removed
                            ? "line-through text-muted-foreground bg-rose-50/40 dark:bg-rose-950/20"
                            : isNew
                              ? "border-emerald-400/60 dark:border-emerald-600/50"
                              : ""
                        }
                      />
                      {!isNew && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingItemId(row.id)}
                          disabled={busy}
                          aria-label="Open full editor"
                          title="Full edit (type, sensitivity, tags, …)"
                          className="shrink-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleDelete(row.rowId)}
                        disabled={busy}
                        aria-label={removed ? "Restore" : "Remove"}
                        title={removed ? "Restore" : "Remove"}
                        className={`shrink-0 ${
                          removed
                            ? "text-emerald-600"
                            : "text-muted-foreground hover:text-rose-600"
                        }`}
                      >
                        {removed ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={appendNewRow}
                disabled={busy}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add context item
              </Button>
            </div>

            {/* Advanced */}
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                disabled={busy}
              >
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advanced
                <span className="text-xs font-normal">
                  URL slug, sort order, max assignments
                </span>
              </button>
            </div>

            {advancedOpen && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL slug</Label>
                  <div className="flex gap-2">
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder={toSlug(labelPlural) || "url-slug"}
                      style={{ fontSize: "16px" }}
                      disabled={busy}
                      className="flex-1 font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSlug(toSlug(labelPlural))}
                      disabled={busy || !labelPlural.trim()}
                    >
                      Auto
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Used in the page URL, e.g. /organizations/acme/scopes/
                    <span className="font-mono">
                      {slug || toSlug(labelPlural) || "url-slug"}
                    </span>
                    . Must be unique in this organization.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sort order</Label>
                    <Input
                      type="number"
                      value={sortOrder}
                      onChange={(e) =>
                        setSortOrder(parseInt(e.target.value, 10) || 0)
                      }
                      min={0}
                      style={{ fontSize: "16px" }}
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max assignments</Label>
                    <Input
                      type="number"
                      value={maxAssignments}
                      onChange={(e) => setMaxAssignments(e.target.value)}
                      placeholder="Unlimited"
                      min={1}
                      style={{ fontSize: "16px" }}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={busy}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={busy || !labelSingular.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save changes
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <EditContextItemSheet
        open={!!editingItemId}
        onOpenChange={(o) => !o && setEditingItemId(null)}
        itemId={editingItemId}
      />
    </>
  );
}
