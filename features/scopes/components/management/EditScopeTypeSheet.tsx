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
  Plus,
  Trash2,
} from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
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
import { slugifyKey, toSlug, isValidSlug } from "@/features/scopes/utils/slugify";
import { isScopesRpcErr } from "@/features/scopes/types";

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
        display_name: i.display_name,
        initialDisplayName: i.display_name,
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
            max_assignments: maxParsed ?? undefined,
          }),
        );
        if (isScopesRpcErr(res)) throw new Error(res.error.message);
      }

      // Context items: archive, rename, create
      for (const row of items) {
        if (row.toDelete && !row.id.startsWith("new:")) {
          const res = await dispatch(
            deleteContextItem({ item_id: row.id, scope_type_id: scopeType.id }),
          );
          if (isScopesRpcErr(res)) throw new Error(res.error.message);
          continue;
        }
        const trimmedName = row.display_name.trim();
        if (!trimmedName) continue;
        if (row.id.startsWith("new:")) {
          const res = await dispatch(
            createContextItem({
              scope_type_id: scopeType.id,
              key: slugifyKey(trimmedName) || trimmedName.toLowerCase(),
              display_name: trimmedName,
            }),
          );
          if (isScopesRpcErr(res)) throw new Error(res.error.message);
        } else if (trimmedName !== row.initialDisplayName) {
          const res = await dispatch(
            updateContextItem({ item_id: row.id, display_name: trimmedName }),
          );
          if (isScopesRpcErr(res)) throw new Error(res.error.message);
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
      if (isScopesRpcErr(res)) throw new Error(res.error.message);
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
              style={{ fontSize: "16px" }}
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
              style={{ fontSize: "16px" }}
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
                    value={row.display_name}
                    onChange={(e) =>
                      patchItem(row.rowId, { display_name: e.target.value })
                    }
                    onKeyDown={(e) => handleRowKeyDown(e, idx)}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleDelete(row.rowId)}
                    disabled={busy}
                    aria-label={`${removed ? "Restore" : "Remove"} ${row.display_name || `context item ${idx + 1}`}`}
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
              <Label htmlFor={ids.slug} className="text-xs">
                URL slug
              </Label>
              <div className="flex gap-2">
                <Input
                  id={ids.slug}
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
                Leave blank to keep the current slug. Must be unique in this
                organization.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={ids.sortOrder} className="text-xs">
                  Sort order
                </Label>
                <Input
                  id={ids.sortOrder}
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
          <Button onClick={handleSave} disabled={busy || !labelSingular.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>
    </MatrxDynamicPanelHost>
  );
}
