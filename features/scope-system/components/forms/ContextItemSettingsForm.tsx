"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X, Hash, Tag as TagIcon, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateContextItem,
  deleteContextItem,
  selectContextItemById,
  listScopeTypeItems,
  type ContextFetchHint,
  type ContextSensitivity,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  FETCH_HINT_CONFIG,
  SENSITIVITY_CONFIG,
  VALUE_TYPE_CONFIG,
  DEFAULT_CATEGORIES,
} from "@/features/agent-context/constants";
import { toSlug, isValidSlug, isReservedSlug } from "@/features/scope-system/utils/slugify";
import { CustomComponentConfigurator } from "@/features/agents/components/variables-management/CustomComponentConfigurator";
import { componentToValueType } from "@/features/scope-system/utils/componentValueType";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";

interface ContextItemSettingsFormProps {
  itemId: string;
  /** Called after a successful save. */
  onSaved?: () => void;
  /** When provided, shows a Cancel button that calls this. */
  onCancelled?: () => void;
  /** Called after a successful delete. */
  onDeleted?: () => void;
}

/**
 * The full editor for a context item's own settings (the THING — applies to every
 * scope of its type). Shared by the quick-edit drawer (`EditContextItemSheet`) and
 * the full-page Manage route, so there is exactly one form.
 */
export function ContextItemSettingsForm({
  itemId,
  onSaved,
  onCancelled,
  onDeleted,
}: ContextItemSettingsFormProps) {
  const dispatch = useAppDispatch();
  const item = useAppSelector((s) => selectContextItemById(s, itemId));

  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [customComponent, setCustomComponent] = useState<
    VariableCustomComponent | undefined
  >(undefined);
  const [fetchHint, setFetchHint] = useState<ContextFetchHint>("on_demand");
  const [sensitivity, setSensitivity] = useState<ContextSensitivity>("internal");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [statusNote, setStatusNote] = useState("");
  const [reviewIntervalDays, setReviewIntervalDays] = useState("");
  const [sortOrder, setSortOrder] = useState("");

  useEffect(() => {
    if (!item) return;
    setDisplayName(item.display_name);
    setSlug(item.slug ?? "");
    setDescription(item.description ?? "");
    setCategory(item.category ?? "");
    setCustomComponent(item.custom_component ?? undefined);
    setFetchHint(item.fetch_hint);
    setSensitivity(item.sensitivity);
    setTags(item.tags ?? []);
    setTagInput("");
    setStatusNote(item.status_note ?? "");
    setReviewIntervalDays(
      item.review_interval_days != null ? String(item.review_interval_days) : "",
    );
    setSortOrder(item.sort_order != null ? String(item.sort_order) : "");
  }, [item]);

  function addTag() {
    const next = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (next && !tags.includes(next)) setTags([...tags, next]);
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  async function handleSave() {
    if (!item) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      toast.error("Display name is required");
      return;
    }
    const trimmedSlug = slug.trim();
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
      // The chosen component drives the storage discriminator; keep value_type in sync.
      const derivedValueType = componentToValueType(customComponent);
      await dispatch(
        updateContextItem({
          id: item.id,
          display_name: trimmedName,
          slug: trimmedSlug || null,
          description: description.trim(),
          category: category.trim() || null,
          value_type: derivedValueType,
          custom_component: customComponent ?? null,
          fetch_hint: fetchHint,
          sensitivity,
          tags,
          status_note: statusNote.trim() || null,
          review_interval_days: reviewIntervalDays.trim()
            ? Number(reviewIntervalDays)
            : null,
          sort_order: sortOrder.trim() ? Number(sortOrder) : undefined,
        }),
      ).unwrap();
      dispatch(listScopeTypeItems(item.scope_type_id));
      toast.success(`Updated "${trimmedName}"`);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: `Delete "${item.display_name}"?`,
      description: `This removes this context item from every scope of this type. Existing values stay in history but won't display anywhere.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await dispatch(deleteContextItem(item.id)).unwrap();
      dispatch(listScopeTypeItems(item.scope_type_id));
      toast.success(`Deleted "${item.display_name}"`);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const derivedValueType = componentToValueType(customComponent);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs">Display name</Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
        />
        <p className="text-[10px] font-mono text-muted-foreground">
          <Hash className="h-2.5 w-2.5 inline -mt-0.5" /> {item.key}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL slug</Label>
        <div className="flex gap-2">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={toSlug(displayName) || "url-slug"}
            style={{ fontSize: "16px" }}
            disabled={busy}
            className="flex-1 font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSlug(toSlug(displayName))}
            disabled={busy || !displayName.trim()}
          >
            Auto
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Human-readable segment in the item URL. Must be unique within this scope
          type.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <ProTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minHeight={80}
          autoGrow
          placeholder="What is this context item for? When should an agent use it?"
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Brand & Identity"
          style={{ fontSize: "16px" }}
          disabled={busy}
          list="context-item-settings-category-suggestions"
        />
        <datalist id="context-item-settings-category-suggestions">
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* ── Input component (shared with the Agent Builder) ──────────────── */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Input component</Label>
          <span className="text-[10px] text-muted-foreground">
            stored as{" "}
            <code className="font-mono">
              {VALUE_TYPE_CONFIG[derivedValueType]?.label ?? derivedValueType}
            </code>
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The same components used in the Agent Builder. The storage type is
          derived automatically from the component you pick.
        </p>
        <CustomComponentConfigurator
          value={customComponent}
          onChange={setCustomComponent}
          readonly={busy}
        />
        {derivedValueType !== item.value_type && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300 inline-flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            Storage type changes to {derivedValueType} on save — existing values
            won&apos;t auto-convert.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Fetch hint</Label>
        <Select
          value={fetchHint}
          onValueChange={(v) => setFetchHint(v as ContextFetchHint)}
          disabled={busy}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FETCH_HINT_CONFIG) as ContextFetchHint[]).map((k) => (
              <SelectItem key={k} value={k}>
                {FETCH_HINT_CONFIG[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {FETCH_HINT_CONFIG[fetchHint].description}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Sensitivity</Label>
        <Select
          value={sensitivity}
          onValueChange={(v) => setSensitivity(v as ContextSensitivity)}
          disabled={busy}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SENSITIVITY_CONFIG) as ContextSensitivity[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SENSITIVITY_CONFIG[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {SENSITIVITY_CONFIG[sensitivity].description}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tags</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag and press Enter"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            style={{ fontSize: "16px" }}
            disabled={busy}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={busy || !tagInput.trim()}
          >
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-xs gap-1 pl-2 pr-1"
              >
                <TagIcon className="h-2.5 w-2.5" />
                <code className="font-mono">{t}</code>
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="hover:bg-muted-foreground/10 rounded p-0.5"
                  aria-label="Remove tag"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Sort order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="0"
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
          <p className="text-[10px] text-muted-foreground">Lower shows first</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Review interval (days)</Label>
          <Input
            type="number"
            value={reviewIntervalDays}
            onChange={(e) => setReviewIntervalDays(e.target.value)}
            placeholder="No schedule"
            min={1}
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
          <p className="text-[10px] text-muted-foreground">Stale after N days</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <div className="px-3 py-1.5 text-sm bg-muted rounded-md text-muted-foreground capitalize">
            {item.status?.replace(/_/g, " ") || "—"}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Status note</Label>
        <ProTextarea
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          minHeight={64}
          autoGrow
          placeholder="Notes about the current state of this item"
          disabled={busy}
        />
      </div>

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
        <Button onClick={handleSave} disabled={busy || !displayName.trim()}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
