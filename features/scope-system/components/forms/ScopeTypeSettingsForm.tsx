"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateScopeType,
  deleteScopeType,
  selectScopeTypeById,
  fetchScopeTypes,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";

interface ScopeTypeSettingsFormProps {
  typeId: string;
  orgId: string;
  onSaved?: () => void;
  onCancelled?: () => void;
  onDeleted?: () => void;
}

/**
 * A scope type's OWN settings (labels, icon, color, description, sort order,
 * max assignments) — the dimension itself, applies org-wide. Used by the
 * full-page Manage route. (The quick-edit drawer `EditScopeTypeSheet` keeps its
 * own combined settings + inline context-item management; this form is settings
 * only and links out to the dedicated context-items hub.)
 */
export function ScopeTypeSettingsForm({
  typeId,
  orgId,
  onSaved,
  onCancelled,
  onDeleted,
}: ScopeTypeSettingsFormProps) {
  const dispatch = useAppDispatch();
  const scopeType = useAppSelector((s) => selectScopeTypeById(s, typeId));

  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [labelSingular, setLabelSingular] = useState("");
  const [labelPlural, setLabelPlural] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [color, setColor] = useState("blue");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [maxAssignments, setMaxAssignments] = useState("");

  useEffect(() => {
    if (!scopeType) return;
    setLabelSingular(scopeType.label_singular);
    setLabelPlural(scopeType.label_plural);
    setIcon(scopeType.icon || "Folder");
    setColor(scopeType.color || "blue");
    setDescription(scopeType.description);
    setSortOrder(scopeType.sort_order);
    setMaxAssignments(
      scopeType.max_assignments_per_entity != null
        ? String(scopeType.max_assignments_per_entity)
        : "",
    );
  }, [scopeType]);

  async function handleSave() {
    if (!scopeType) return;
    const trimmedSingular = labelSingular.trim();
    const trimmedPlural = labelPlural.trim() || trimmedSingular;
    if (!trimmedSingular) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      await dispatch(
        updateScopeType({
          type_id: scopeType.id,
          label_singular: trimmedSingular,
          label_plural: trimmedPlural,
          icon: icon || "Folder",
          color,
          description,
          sort_order: sortOrder,
          max_assignments: maxAssignments
            ? parseInt(maxAssignments, 10)
            : undefined,
        }),
      ).unwrap();
      dispatch(fetchScopeTypes(orgId));
      toast.success(`Updated "${trimmedPlural}"`);
      onSaved?.();
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
      description: `This permanently deletes the "${scopeType.label_plural}" scope type, all its scopes, context items, and stored values. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await dispatch(deleteScopeType(scopeType.id)).unwrap();
      dispatch(fetchScopeTypes(orgId));
      toast.success(`Deleted "${scopeType.label_plural}"`);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  if (!scopeType) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
          <TailwindColorPicker
            selectedColor={color}
            onColorChange={setColor}
            size="md"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <ProTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minHeight={80}
          maxHeight={600}
          autoGrow
          placeholder="What does this scope type represent?"
          disabled={busy}
        />
      </div>

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
            sort order, max assignments
          </span>
        </button>
      </div>

      {advancedOpen && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              min={0}
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
            <p className="text-[10px] text-muted-foreground">
              Lower shows first
            </p>
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
        {onCancelled && (
          <Button variant="ghost" onClick={onCancelled} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={busy || !labelSingular.trim()}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
