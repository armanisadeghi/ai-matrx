"use client";

// features/scopes/components/management/NewScopeInline.tsx
//
// Canonical inline "add a scope" form (Lane F W8 rebuild of the legacy
// features/scope-system NewScopeInline). Runs entirely on the canonical
// module: item catalog via ensureScopeTypeItems / makeSelectItemsForType,
// writes via the sanctioned RPC-backed thunks (createScope,
// createContextItem, setContextValue). No legacy slice touches anything.
//
// Renders, stacked top-to-bottom: name + slug + description, one
// `ContextValueInput` per existing context item (a `reference` item can't be
// set before the scope exists — it shows a note instead), and optional
// brand-new context-item rows (name + value) that propagate to every scope
// of the type.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Info, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createScope,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { createContextItem } from "@/features/scopes/redux/thunks/contextItemMutations";
import { setContextValue } from "@/features/scopes/redux/thunks/setContextValue";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  makeSelectItemsForType,
  makeSelectItemsStatusForType,
} from "@/features/scopes/redux/selectors/context-items";
import { buildScopeValuePayload } from "@/features/scopes/utils/scopeValuePayload";
import {
  isReservedSlug,
  isValidSlug,
  slugifyKey,
  toSlug,
} from "@/features/scopes/utils/slugify";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { customComponentOf } from "@/features/scopes/utils/customComponent";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ContextItemRow } from "@/features/scopes/types";

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
  const dispatch = useAppDispatch();

  const selectItemsForType = useMemo(() => makeSelectItemsForType(), []);
  const items = useAppSelector((s) => selectItemsForType(s, typeId));
  const selectItemsStatus = useMemo(() => makeSelectItemsStatusForType(), []);
  const itemsStatus = useAppSelector((s) => selectItemsStatus(s, typeId));

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

  useEffect(() => {
    void dispatch(ensureScopeTypeItems(typeId));
  }, [dispatch, typeId]);
  void itemsStatus; // catalog renders whatever is loaded; the thunk dedupes

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

  async function writeValue(scopeId: string, item: ContextItemRow, raw: unknown) {
    const res = await dispatch(
      setContextValue({
        scope_id: scopeId,
        context_item_id: item.id,
        source_type: "manual",
        ...buildScopeValuePayload(raw, item.value_type),
      }),
    );
    if (isScopesRpcErr(res)) throw new Error(res.error.message);
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
      const created = await dispatch(
        createScope({
          org_id: orgId,
          type_id: typeId,
          name: trimmedName,
          description: description.trim(),
          slug: trimmedSlug || undefined,
        }),
      );
      if (isScopesRpcErr(created)) throw new Error(created.error.message);
      const scope = created.data;

      for (const item of items) {
        if (item.value_type === "reference") continue; // no scope id existed yet to point at
        const draft = existingValues[item.id];
        if (isEmptyDraft(draft)) continue;
        await writeValue(scope.id, item, draft);
      }

      let newItemsCreated = 0;
      for (const row of newItems) {
        const displayName = row.display_name.trim();
        if (!displayName) continue;
        const itemRes = await dispatch(
          createContextItem({
            scope_type_id: typeId,
            key: slugifyKey(displayName) || displayName.toLowerCase(),
            display_name: displayName,
          }),
        );
        if (isScopesRpcErr(itemRes)) throw new Error(itemRes.error.message);
        newItemsCreated++;
        const v = row.value.trim();
        if (v) {
          await writeValue(scope.id, itemRes.data, v);
        }
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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card p-5 space-y-5"
    >
      {/* Core: name + slug + description (stacked) */}
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
              {item.value_type === "reference" ? (
                <p className="text-xs text-muted-foreground">
                  Reference fields are set from the {labelSingular}
                  &apos;s own page once it&apos;s created.
                </p>
              ) : (
                <ContextValueInput
                  id={`new-scope-val-${item.id}`}
                  aria-labelledby={`new-scope-label-${item.id}`}
                  valueType={item.value_type}
                  customComponent={customComponentOf(item)}
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
              New context items are added to <strong>all {labelPlural}</strong>{" "}
              — define once, fill everywhere.
            </span>
          </div>
          {newItems.map((row) => (
            <div key={row.rowId} className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  ref={(element) => {
                    if (element) newItemNameRefs.current.set(row.rowId, element);
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
      </div>
    </form>
  );
}
