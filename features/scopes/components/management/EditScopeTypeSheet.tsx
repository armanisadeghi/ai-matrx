"use client";

// features/scopes/components/management/EditScopeTypeSheet.tsx
//
// Canonical scope-type editor sheet (Lane F W8 rebuild of the legacy
// features/scope-system EditScopeTypeSheet). Reads from the canonical tree
// (makeSelectScopeType) and item catalog (makeSelectItemsForType), and writes
// only through the sanctioned RPC-backed thunks: updateScopeType,
// deleteScopeType, createContextItem, updateContextItem, deleteContextItem.
//
// Item rows support inline rename, add, and archive; deep per-item editing
// (type, sensitivity, tags, reference config) lives on the org's context
// items page, not in a nested sheet.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { ScopeColorPicker } from "@/features/scopes/components/management/ScopeColorPicker";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { makeSelectScopeType } from "@/features/scopes/redux/selectors/tree";
import {
  makeSelectItemsForType,
} from "@/features/scopes/redux/selectors/context-items";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  deleteScopeType,
  updateScopeType,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import {
  createContextItem,
  deleteContextItem,
  updateContextItem,
} from "@/features/scopes/redux/thunks/contextItemMutations";
import { isValidSlug, toFieldKey, toSlug } from "@ai-matrx/records/scopes";
import { isRecordsErr } from "@ai-matrx/records";
import { EditContextItemSheet } from "@/features/scopes/components/pages/EditContextItemSheet";
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";

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
  label: string;
  initialLabel?: string;
  toDelete?: boolean;
};

const newRow = (): ItemDraft => ({
  id: `new:${Math.random().toString(36).slice(2)}`,
  rowId: Math.random().toString(36).slice(2),
  label: "",
});

export function EditScopeTypeSheet({
  open,
  onOpenChange,
  orgId,
  typeId,
  onDeleted,
}: EditScopeTypeSheetProps) {
  const dispatch = useAppDispatch();
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const scopeType = useAppSelector((s) => selectScopeType(s, typeId));
  const selectItemsForType = useMemo(() => makeSelectItemsForType(), []);
  const existingItems = useAppSelector((s) => selectItemsForType(s, typeId));

  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Basics
  const [labelSingular, setLabelSingular] = useState("");
  const [labelPlural, setLabelPlural] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [color, setColor] = useState("blue");
  const [items, setItems] = useState<ItemDraft[]>([]);
  /** The saved field whose full editor (kind, sensitivity, tags, …) is open. */
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Advanced
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [maxAssignments, setMaxAssignments] = useState("");
  const uid = useId();
  const ids = {
    singular: `${uid}-singular`,
    plural: `${uid}-plural`,
    icon: `${uid}-icon`,
    slug: `${uid}-slug`,
    sortOrder: `${uid}-sort-order`,
    maxAssignments: `${uid}-max-assignments`,
  };

  const rowInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !scopeType) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening on a different entity intentionally resets the controlled editor fields.
    setLabelSingular(scopeType.label_singular);
    setLabelPlural(scopeType.label_plural);
    setIcon(scopeType.icon || "Folder");
    setColor(scopeType.color || "blue");
    setSortOrder(scopeType.sort_order);
    setSlug("");
    setMaxAssignments(
      scopeType.max_assignments_per_entity != null
        ? String(scopeType.max_assignments_per_entity)
        : "",
    );
    setAdvancedOpen(false);
    void dispatch(ensureScopeTypeItems(typeId));
  }, [open, scopeType, typeId, dispatch]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- server-backed item changes intentionally reset this controlled row editor.
    setItems(
      existingItems.map((i) => ({
        id: i.id,
        rowId: i.id,
        label: i.label,
        initialLabel: i.label,
      })),
    );
  }, [open, existingItems]);

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
    index: number,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
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
    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      toast.error("URL slug must be lowercase letters, numbers, and hyphens");
      return;
    }
    setBusy(true);
    try {
      const maxParsed = maxAssignments ? parseInt(maxAssignments, 10) : null;
      const changed =
        trimmedSingular !== scopeType.label_singular ||
        trimmedPlural !== scopeType.label_plural ||
        (icon || "Folder") !== scopeType.icon ||
        color !== scopeType.color ||
        !!trimmedSlug ||
        sortOrder !== scopeType.sort_order ||
        maxParsed !== scopeType.max_assignments_per_entity;

      if (changed) {
        const res = await dispatch(
          updateScopeType({
            type_id: scopeType.id,
            label_singular: trimmedSingular,
            label_plural: trimmedPlural,
            icon: icon || "Folder",
            color,
            slug: trimmedSlug || undefined,
            sort_order: sortOrder,
            max_assignments_per_entity: maxParsed,
          }),
        );
        if (isRecordsErr(res)) throw new Error(res.error.message);
      }

      // Context items: archive, rename, create
      for (const row of items) {
        if (row.toDelete && !row.id.startsWith("new:")) {
          const res = await dispatch(
            deleteContextItem({ item_id: row.id, scope_type_id: scopeType.id }),
          );
          if (isRecordsErr(res)) throw new Error(res.error.message);
          continue;
        }
        const trimmedName = row.label.trim();
        if (!trimmedName) continue;
        if (row.id.startsWith("new:")) {
          const res = await dispatch(
            createContextItem({
              scope_type_id: scopeType.id,
              key: toFieldKey(trimmedName) || trimmedName.toLowerCase(),
              label: trimmedName,
            }),
          );
          if (isRecordsErr(res)) throw new Error(res.error.message);
        } else if (trimmedName !== row.initialLabel) {
          const res = await dispatch(
            updateContextItem({ item_id: row.id, scope_type_id: scopeType.id, label: trimmedName }),
          );
          if (isRecordsErr(res)) throw new Error(res.error.message);
        }
      }

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
    const okToDelete = await confirm({
      title: `Delete ${scopeType.label_singular}?`,
      description: `This archives the "${scopeType.label_plural}" scope type and hides its scopes and context items. Stored values are retained for recovery.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!okToDelete) return;
    setBusy(true);
    try {
      const res = await dispatch(
        deleteScopeType({ type_id: scopeType.id, organization_id: orgId }),
      );
      if (isRecordsErr(res)) throw new Error(res.error.message);
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
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Edit scope type"
      description="Rename, change the icon and color, manage context items, and adjust advanced settings."
      expandButtonLabel="Scope type"
      dismissDisabled={busy}
      initialFocus
      position="right"
      defaultSize={38}
    >
      <div className="space-y-5">
        {/* Names */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={ids.singular} className="text-xs">
              Name (one item)
            </Label>
            <Input
              id={ids.singular}
              data-panel-initial-focus
              autoFocus
              value={labelSingular}
              onChange={(e) => setLabelSingular(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.plural} className="text-xs">
              Name (many)
            </Label>
            <Input
              id={ids.plural}
              value={labelPlural}
              onChange={(e) => setLabelPlural(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {/* Icon + Color */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div className="space-y-1.5">
            <Label htmlFor={ids.icon} className="text-xs">
              Icon
            </Label>
            <IconInputWithValidation
              id={ids.icon}
              value={icon}
              onChange={setIcon}
              showLucideLink={false}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <ScopeColorPicker value={color} onChange={setColor} disabled={busy} />
          </div>
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
                    aria-label={`Context item ${idx + 1} name`}
                    value={row.label}
                    onChange={(e) =>
                      patchItem(row.rowId, { label: e.target.value })
                    }
                    onKeyDown={(e) => handleRowKeyDown(e, idx)}
                    disabled={busy || removed}
                    mark={!removed && isNew ? "changed" : undefined}
                  />
                  {!isNew && (
                    <Button
                      icon={<Pencil />}
                      type="button"
                      variant="quiet"
                      onClick={() => setEditingItemId(row.id)}
                      disabled={busy}
                      aria-label={`Open full editor for ${row.label || `context item ${idx + 1}`}`}
                      title="Full edit (type, sensitivity, tags, …)"
                      className="shrink-0"
                    />
                  )}
                  <Button
                    icon={removed ? (
                      <Check />
                    ) : (
                      <Trash2 />
                    )}
                    type="button"
                    variant="quiet"
                    onClick={() => toggleDelete(row.rowId)}
                    disabled={busy}
                    aria-label={`${removed ? "Restore" : "Remove"} ${row.label || `context item ${idx + 1}`}`}
                    title={removed ? "Restore" : "Remove"}
                    className={`shrink-0 ${
                      removed
                        ? "text-emerald-600"
                        : "text-muted-foreground hover:text-rose-600"
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <Button
            icon={<Plus />}
            type="button"
            variant="quiet"
            onClick={appendNewRow}
            disabled={busy}
          >
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
              <Label htmlFor={ids.slug} className="text-xs">
                URL slug
              </Label>
              <div className="flex gap-2">
                <Input mono
                  id={ids.slug}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={toSlug(labelPlural) || "url-slug"}
                  disabled={busy}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSlug(toSlug(labelPlural))}
                  disabled={busy || !labelPlural.trim()}
                >
                  Auto
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Leave blank to keep the current slug. Must be unique in this
                organization.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={ids.sortOrder} className="text-xs">
                  Sort order
                </Label>
                <ClampedNumberInput
                  id={ids.sortOrder}
                  value={sortOrder}
                  min={0}
                  disabled={busy}
                  className="text-base"
                  onChange={setSortOrder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.maxAssignments} className="text-xs">
                  Max assignments
                </Label>
                <Input
                  id={ids.maxAssignments}
                  type="number"
                  value={maxAssignments}
                  onChange={(e) => setMaxAssignments(e.target.value)}
                  placeholder="Unlimited"
                  min={1}
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button
            icon={<Trash2 />}
            variant="outline"
            onClick={handleDelete}
            disabled={busy}
          >
            Delete
          </Button>
          <div className="flex-1" />
          <Button
            variant="quiet"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button icon={busy && <Loader2 className="animate-spin" />} variant="primary" onClick={handleSave} disabled={busy || !labelSingular.trim()}>
            Save changes
          </Button>
        </div>
      </div>
    </MatrxDynamicPanelHost>

    <EditContextItemSheet
      open={!!editingItemId}
      onOpenChange={(o) => !o && setEditingItemId(null)}
      itemId={editingItemId}
    />
    </>
  );
}
