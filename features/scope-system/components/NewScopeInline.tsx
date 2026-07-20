"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Plus, X, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { createScope } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  createContextItem,
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import {
  slugifyKey,
  toSlug,
  isValidSlug,
  isReservedSlug,
} from "@/features/scope-system/utils/slugify";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { EditContextItemSheet } from "./EditContextItemSheet";

interface NewScopeInlineProps {
  orgId: string;
  typeId: string;
  labelSingular: string;
  labelPlural: string;
  /** For the URL slug preview line under the slug field. */
  orgSlugOrId?: string;
  typeSlugOrId?: string;
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
 * - One `ContextValueInput` per existing context item on the scope type
 *   (type-appropriate editor — text/number/boolean/date/custom-component; a
 *   `reference` item can't be set here since there's no scope id yet — it
 *   shows a "set after creating" note instead)
 * - "Add context item" rows that let the user define brand-new context items
 *   with values, right here (always `value_type="string"` — matching
 *   `createContextItem`'s default when no type is specified)
 *
 * On submit: create_scope → set_scope_context_value for each existing filled
 * item (via `buildScopeValuePayload`, so a boolean/number/date item lands in
 * its real column, not as raw text) → create_context_item +
 * set_scope_context_value for each new (name, value) pair. New items
 * propagate to every other scope of the type.
 *
 * IMPORTANT: every value editor renders through `ContextValueInput` in its
 * stable compact mode. Text values stay textareas for the full lifetime of the
 * field — they never swap element types mid-keystroke — while the dense create
 * form avoids inserting rich-editor toolbar controls between every value.
 */
export function NewScopeInline({
  orgId,
  typeId,
  labelSingular,
  labelPlural,
  orgSlugOrId,
  typeSlugOrId,
  onCreated,
  onCancel,
}: NewScopeInlineProps) {
  const generatedId = useId();
  const nameId = `new-scope-name-${generatedId}`;
  const slugId = `new-scope-slug-${generatedId}`;
  const descriptionId = `new-scope-description-${generatedId}`;
  const addItemButtonRef = useRef<HTMLButtonElement>(null);
  const newItemNameRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRowRef = useRef<string | null>(null);
  const editItemButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => selectItemsByType(s, typeId));
  const itemsLoaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, typeId),
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  // Unknown, not string — a custom-component item's draft is a structured
  // object (see `buildScopeValuePayload`), everything else is a string.
  const [existingValues, setExistingValues] = useState<Record<string, unknown>>(
    {},
  );
  const [newItems, setNewItems] = useState<NewItemRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!itemsLoaded) dispatch(listScopeTypeItems(typeId));
  }, [dispatch, typeId, itemsLoaded]);

  useEffect(() => {
    const rowId = pendingFocusRowRef.current;
    if (!rowId) return;
    newItemNameRefs.current.get(rowId)?.focus();
    pendingFocusRowRef.current = null;
  }, [newItems]);

  function setExistingValue(itemId: string, value: unknown) {
    setExistingValues((prev) => ({ ...prev, [itemId]: value }));
  }

  function isEmptyDraft(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === "string") return v.trim() === "";
    return false;
  }

  function addNewItemRow() {
    const row = newRow();
    pendingFocusRowRef.current = row.rowId;
    setNewItems((rows) => [...rows, row]);
  }
  function removeNewItemRow(rowId: string) {
    setNewItems((rows) => rows.filter((r) => r.rowId !== rowId));
    requestAnimationFrame(() => addItemButtonRef.current?.focus());
  }
  function updateNewItemRow(rowId: string, patch: Partial<NewItemRow>) {
    setNewItems((rows) =>
      rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(toSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const trimmedSlug = slug.trim() || toSlug(trimmedName);
    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      toast.error("URL slug must be lowercase letters, numbers, and hyphens");
      return;
    }
    if (trimmedSlug && isReservedSlug(trimmedSlug)) {
      toast.error(`"${trimmedSlug}" is a reserved word — choose another slug`);
      return;
    }

    setBusy(true);
    try {
      const scope = await dispatch(
        createScope({
          org_id: orgId,
          type_id: typeId,
          name: trimmedName,
          description: description.trim(),
          slug: trimmedSlug || undefined,
        }),
      ).unwrap();

      for (const item of items) {
        if (item.value_type === "reference") continue; // no scope id existed yet to point at
        const draft = existingValues[item.id];
        if (isEmptyDraft(draft)) continue;
        await dispatch(
          setScopeContextValue({
            scope_id: scope.id,
            context_item_id: item.id,
            ...buildScopeValuePayload(draft, item.value_type),
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
      setSlug("");
      setSlugTouched(false);
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

  const submitActions = (
    <div className="flex items-center justify-end gap-2">
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
  );

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border bg-card p-5 space-y-5"
      >
        {/* Core: name + description (stacked) */}
        <div className="space-y-1.5">
          <Label htmlFor={nameId} className="text-xs">
            {labelSingular} name
          </Label>
          <Input
            id={nameId}
            autoFocus
            placeholder={`e.g. ${labelSingular}…`}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={busy}
            required
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={slugId} className="text-xs">
            URL slug
          </Label>
          <div className="flex gap-2">
            <Input
              id={slugId}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder={toSlug(name) || "url-slug"}
              disabled={busy}
              style={{ fontSize: "16px" }}
              className="flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSlugTouched(false);
                setSlug(toSlug(name));
              }}
              disabled={busy || !name.trim()}
            >
              Auto
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {orgSlugOrId && typeSlugOrId ? (
              <>
                Used in the page URL, e.g. /organizations/{orgSlugOrId}/scopes/
                <span className="font-mono">
                  {typeSlugOrId}/{slug || toSlug(name) || "url-slug"}
                </span>
                . Must be unique within its scope type.
              </>
            ) : (
              <>
                Human-readable segment in this {labelSingular.toLowerCase()}
                &apos;s URL. Must be unique within its scope type.
              </>
            )}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={descriptionId} className="text-xs">
            Description (optional)
          </Label>
          <Input
            id={descriptionId}
            placeholder="Short note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            style={{ fontSize: "16px" }}
          />
        </div>

        {/* Existing context items — one ContextValueInput per item */}
        {items.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-border">
            <p className="text-xs font-medium">Context items</p>
            {items.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5">
                  <Label
                    id={`new-scope-label-${item.id}`}
                    htmlFor={
                      item.value_type === "reference"
                        ? undefined
                        : `new-scope-val-${item.id}`
                    }
                    className="text-sm font-medium text-foreground"
                  >
                    {item.display_name}
                  </Label>
                  <button
                    ref={(element) => {
                      if (element)
                        editItemButtonRefs.current.set(item.id, element);
                      else editItemButtonRefs.current.delete(item.id);
                    }}
                    type="button"
                    onClick={() => setEditingItemId(item.id)}
                    className="rounded-sm text-muted-foreground opacity-60 transition-opacity hover:text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Edit ${item.display_name} definition`}
                    disabled={busy}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {item.value_type === "reference" ? (
                  <p className="text-xs text-muted-foreground">
                    Reference fields are set from the {labelSingular}
                    &apos;s own page once it's created.
                  </p>
                ) : (
                  <ContextValueInput
                    id={`new-scope-val-${item.id}`}
                    aria-labelledby={`new-scope-label-${item.id}`}
                    valueType={item.value_type}
                    customComponent={item.custom_component}
                    value={existingValues[item.id] ?? ""}
                    onChange={(v) => setExistingValue(item.id, v)}
                    displayName={item.display_name}
                    placeholder="Leave blank to fill later"
                    disabled={busy}
                    compact
                    minHeight={80}
                    maxHeight={600}
                  />
                )}
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
                    ref={(element) => {
                      if (element)
                        newItemNameRefs.current.set(row.rowId, element);
                      else newItemNameRefs.current.delete(row.rowId);
                    }}
                    aria-label="New context item name"
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
                <ContextValueInput
                  id={`new-context-item-value-${row.rowId}`}
                  aria-label={`Value for ${row.display_name || "new context item"}`}
                  valueType="string"
                  value={row.value}
                  onChange={(v) =>
                    updateNewItemRow(row.rowId, { value: String(v ?? "") })
                  }
                  placeholder="Value for this one (optional)"
                  disabled={busy}
                  compact
                  minHeight={80}
                  maxHeight={600}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            ref={addItemButtonRef}
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
          {submitActions}
        </div>
      </form>

      <EditContextItemSheet
        open={!!editingItemId}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          const previousItemId = editingItemId;
          setEditingItemId(null);
          requestAnimationFrame(() => {
            if (previousItemId)
              editItemButtonRefs.current.get(previousItemId)?.focus();
          });
        }}
        itemId={editingItemId}
      />
    </>
  );
}
