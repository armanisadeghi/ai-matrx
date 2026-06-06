"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { createScope } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  createContextItem,
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { slugifyKey, toSlug } from "@/features/scope-system/utils/slugify";
import { EditContextItemSheet } from "./EditContextItemSheet";

interface NewScopeInlineProps {
  orgId: string;
  typeId: string;
  labelSingular: string;
  labelPlural: string;
  onCreated?: (scopeId: string) => void;
  onCancel?: () => void;
}

type NewItemRow = {
  rowId: string;
  display_name: string;
  value: string;
};

const newRow = (): NewItemRow => ({
  rowId: Math.random().toString(36).slice(2),
  display_name: "",
  value: "",
});

/**
 * Inline form for adding a scope. Renders, stacked top-to-bottom:
 * - Name + description (compact)
 * - One textarea per existing context item on the scope type
 * - "Add context item" rows that let the user define brand-new context items
 *   with values, right here
 *
 * On submit: create_scope → set_scope_context_value for each existing filled
 * item → create_context_item + set_scope_context_value for each new (name,
 * value) pair. New items propagate to every other scope of the type.
 *
 * IMPORTANT: every value editor is a Textarea (never an Input). Inputs were
 * silently swapped to Textareas above a char-count threshold, which unmounts
 * the focused field mid-keystroke. That bug caused the "I can't even type
 * into the fields" feedback.
 */
export function NewScopeInline({
  orgId,
  typeId,
  labelSingular,
  labelPlural,
  onCreated,
  onCancel,
}: NewScopeInlineProps) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => selectItemsByType(s, typeId));
  const itemsLoaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, typeId),
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingValues, setExistingValues] = useState<Record<string, string>>(
    {},
  );
  const [newItems, setNewItems] = useState<NewItemRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!itemsLoaded) dispatch(listScopeTypeItems(typeId));
  }, [dispatch, typeId, itemsLoaded]);

  function setExistingValue(itemId: string, value: string) {
    setExistingValues((prev) => ({ ...prev, [itemId]: value }));
  }

  function addNewItemRow() {
    setNewItems((rows) => [...rows, newRow()]);
  }
  function removeNewItemRow(rowId: string) {
    setNewItems((rows) => rows.filter((r) => r.rowId !== rowId));
  }
  function updateNewItemRow(rowId: string, patch: Partial<NewItemRow>) {
    setNewItems((rows) =>
      rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      const scope = await dispatch(
        createScope({
          org_id: orgId,
          type_id: typeId,
          name: trimmedName,
          description: description.trim(),
          slug: toSlug(trimmedName) || undefined,
        }),
      ).unwrap();

      for (const item of items) {
        const v = (existingValues[item.id] ?? "").trim();
        if (!v) continue;
        await dispatch(
          setScopeContextValue({
            scope_id: scope.id,
            context_item_id: item.id,
            value_text: v,
          }),
        ).unwrap();
      }

      let newItemsCreated = 0;
      for (const row of newItems) {
        const displayName = row.display_name.trim();
        if (!displayName) continue;
        const created = await dispatch(
          createContextItem({
            scope_type_id: typeId,
            key: slugifyKey(displayName) || displayName.toLowerCase(),
            slug: toSlug(displayName) || undefined,
            display_name: displayName,
          }),
        ).unwrap();
        newItemsCreated++;
        const v = row.value.trim();
        if (v) {
          await dispatch(
            setScopeContextValue({
              scope_id: scope.id,
              context_item_id: created.id,
              value_text: v,
            }),
          ).unwrap();
        }
      }

      if (newItemsCreated > 0) {
        dispatch(listScopeTypeItems(typeId));
      }

      toast.success(
        newItemsCreated > 0
          ? `Added "${scope.name}" + ${newItemsCreated} new context item${newItemsCreated === 1 ? "" : "s"}`
          : `Added "${scope.name}"`,
      );
      setName("");
      setDescription("");
      setExistingValues({});
      setNewItems([]);
      onCreated?.(scope.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border bg-card p-5 space-y-5"
      >
        {/* Core: name + description (stacked) */}
        <div className="space-y-1.5">
          <Label className="text-xs">{labelSingular} name</Label>
          <Input
            autoFocus
            placeholder={`e.g. ${labelSingular}…`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            required
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Input
            placeholder="Short note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            style={{ fontSize: "16px" }}
          />
        </div>

        {/* Existing context items — stacked, always textarea */}
        {items.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-border">
            <Label className="text-xs">Context items</Label>
            {items.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setEditingItemId(item.id)}
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                  title="Edit this context item"
                  disabled={busy}
                >
                  {item.display_name}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <ProTextarea
                  id={`new-scope-val-${item.id}`}
                  value={existingValues[item.id] ?? ""}
                  onChange={(e) => setExistingValue(item.id, e.target.value)}
                  placeholder="Leave blank to fill later"
                  disabled={busy}
                  minHeight={80}
                  autoGrow
                />
                {item.description && (
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Brand-new context items, inline */}
        {newItems.length > 0 && (
          <div className="space-y-3 rounded-md border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-3">
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                New context items are added to{" "}
                <strong>all {labelPlural}</strong> — define once, fill
                everywhere.
              </span>
            </div>
            {newItems.map((row) => (
              <div key={row.rowId} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New context item name"
                    value={row.display_name}
                    onChange={(e) =>
                      updateNewItemRow(row.rowId, {
                        display_name: e.target.value,
                      })
                    }
                    disabled={busy}
                    style={{ fontSize: "16px" }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeNewItemRow(row.rowId)}
                    disabled={busy}
                    aria-label="Remove context item row"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ProTextarea
                  placeholder="Value for this one (optional)"
                  value={row.value}
                  onChange={(e) =>
                    updateNewItemRow(row.rowId, { value: e.target.value })
                  }
                  disabled={busy}
                  minHeight={80}
                  autoGrow
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addNewItemRow}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add context item
          </Button>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add {labelSingular}
            </Button>
          </div>
        </div>
      </form>

      <EditContextItemSheet
        open={!!editingItemId}
        onOpenChange={(o) => !o && setEditingItemId(null)}
        itemId={editingItemId}
      />
    </>
  );
}
