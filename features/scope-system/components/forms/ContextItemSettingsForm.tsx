"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Loader2,
  Trash2,
  X,
  Hash,
  Tag as TagIcon,
  AlertTriangle,
} from "lucide-react";
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
import { toast } from "@/lib/toast";
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
import { CustomComponentConfigurator } from "@/features/agents/components/variables-management/CustomComponentConfigurator";
import { componentToValueType } from "@/features/scope-system/utils/componentValueType";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScopeType,
  makeSelectScopeTypesForOrg,
} from "@/features/scopes/redux/selectors/tree";
import {
  EntryModeToggle,
  type EntryMode,
} from "@/features/scopes/components/reference/EntryModeToggle";
import { ReferenceConfigFields } from "@/features/scopes/components/reference/ReferenceConfigFields";
import { ContextItemCurrentValues } from "./ContextItemCurrentValues";
import { parseReferenceSource } from "@/features/scopes/utils/referenceSource";

interface ContextItemSettingsFormProps {
  itemId: string;
  /** Focus the first editable field when this form opens in a panel/window. */
  autoFocus?: boolean;
  /** Called after a successful save. */
  onSaved?: () => void;
  /** When provided, shows a Cancel button that calls this. */
  onCancelled?: () => void;
  /** Called after a successful delete. */
  onDeleted?: () => void;
}

/**
 * The full editor for a context item's own settings (the THING — applies to every
 * scope of its type). Shared by the quick-edit panel (`EditContextItemSheet`) and
 * the full-page Manage route, so there is exactly one form.
 */
export function ContextItemSettingsForm({
  itemId,
  autoFocus = false,
  onSaved,
  onCancelled,
  onDeleted,
}: ContextItemSettingsFormProps) {
  const dispatch = useAppDispatch();
  const item = useAppSelector((s) => selectContextItemById(s, itemId));

  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [customComponent, setCustomComponent] = useState<
    VariableCustomComponent | undefined
  >(undefined);
  const [fetchHint, setFetchHint] = useState<ContextFetchHint>("on_demand");
  const [sensitivity, setSensitivity] =
    useState<ContextSensitivity>("internal");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [statusNote, setStatusNote] = useState("");
  const [reviewIntervalDays, setReviewIntervalDays] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const uid = useId();
  const ids = {
    displayName: `${uid}-display-name`,
    entryMode: `${uid}-entry-mode`,
    description: `${uid}-description`,
    category: `${uid}-category`,
    fetchHint: `${uid}-fetch-hint`,
    sensitivity: `${uid}-sensitivity`,
    tags: `${uid}-tags`,
    sortOrder: `${uid}-sort-order`,
    reviewInterval: `${uid}-review-interval`,
    statusNote: `${uid}-status-note`,
    categoryList: `${uid}-category-suggestions`,
  };

  // Value shape: the first decision (EntryModeToggle) — direct-typed value
  // vs. a reference fence. Reference config below is only meaningful in
  // "reference" mode.
  const [entryMode, setEntryMode] = useState<EntryMode>("direct");
  const [allowedReferenceTypes, setAllowedReferenceTypes] = useState<string[]>(
    [],
  );
  const [maxItems, setMaxItems] = useState("1");
  const [allowedScopeTypeIds, setAllowedScopeTypeIds] = useState<string[]>([]);
  const [datasetTemplateId, setDatasetTemplateId] = useState<string | null>(null);
  const isReference = entryMode === "reference";

  useEffect(() => {
    if (!item) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selecting a different item intentionally resets the controlled editor fields.
    setDisplayName(item.display_name);
    setDescription(item.description ?? "");
    setCategory(item.category ?? "");
    setCustomComponent(item.custom_component ?? undefined);
    setFetchHint(item.fetch_hint);
    setSensitivity(item.sensitivity);
    setTags(item.tags ?? []);
    setTagInput("");
    setStatusNote(item.status_note ?? "");
    setReviewIntervalDays(
      item.review_interval_days != null
        ? String(item.review_interval_days)
        : "",
    );
    setSortOrder(item.sort_order != null ? String(item.sort_order) : "");
    setEntryMode(item.value_type === "reference" ? "reference" : "direct");
    setAllowedReferenceTypes(item.allowed_reference_types ?? []);
    setMaxItems(item.max_items != null ? String(item.max_items) : "1");
    setAllowedScopeTypeIds(item.allowed_scope_type_ids ?? []);
    const source = parseReferenceSource(item.reference_source);
    setDatasetTemplateId(
      source?.container_type === "dataset_template" ? source.template_id : null,
    );
  }, [item]);

  // Org scope types, for the "scope" reference type's allowed-scope-type filter.
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const scopeTypeNode = useAppSelector((s) =>
    selectScopeType(s, item?.scope_type_id ?? null),
  );
  const orgId = scopeTypeNode?.organization_id ?? null;
  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const orgScopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  function toggleReferenceType(t: string) {
    setAllowedReferenceTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }
  function toggleAllowedScopeType(id: string) {
    setAllowedScopeTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectDatasetTemplate(templateId: string | null) {
    setDatasetTemplateId(templateId);
    if (templateId) {
      setAllowedReferenceTypes(["dataset"]);
      setMaxItems("1");
      setAllowedScopeTypeIds([]);
    }
  }

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
    if (isReference && allowedReferenceTypes.length === 0) {
      toast.error("Select at least one reference type");
      return;
    }
    const maxItemsNum = Math.max(1, Number(maxItems) || 1);
    setBusy(true);
    try {
      // Reference items skip the custom-component derivation entirely — the
      // two value sources are mutually exclusive on one item.
      const derivedValueType = isReference
        ? "reference"
        : componentToValueType(customComponent);
      await dispatch(
        updateContextItem({
          id: item.id,
          display_name: trimmedName,
          description: description.trim(),
          category: category.trim() || null,
          value_type: derivedValueType,
          custom_component: isReference ? null : (customComponent ?? null),
          fetch_hint: fetchHint,
          sensitivity,
          tags,
          status_note: statusNote.trim() || null,
          review_interval_days: reviewIntervalDays.trim()
            ? Number(reviewIntervalDays)
            : null,
          sort_order: sortOrder.trim() ? Number(sortOrder) : undefined,
          allowed_reference_types: isReference ? allowedReferenceTypes : null,
          max_items: isReference ? maxItemsNum : 1,
          allowed_scope_type_ids:
            isReference && allowedReferenceTypes.includes("scope")
              ? allowedScopeTypeIds
              : null,
          reference_source:
            isReference && datasetTemplateId
              ? {
                  container_type: "dataset_template",
                  template_id: datasetTemplateId,
                  dimension: "whole",
                  provision: "per_scope",
                }
              : null,
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
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={ids.displayName} className="text-xs">
          Display name
        </Label>
        <Input
          id={ids.displayName}
          data-panel-initial-focus={autoFocus ? "" : undefined}
          autoFocus={autoFocus}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
        />
        <p className="text-[10px] font-mono text-muted-foreground">
          <Hash className="h-2.5 w-2.5 inline -mt-0.5" /> Identifier: {item.key}
          {item.slug ? ` · URL: ${item.slug}` : ""}
        </p>
      </div>


      {/* ── Value shape — the first decision: direct-typed value vs. reference.
          Flat section set off by a hairline (Linear/Stripe settings pattern) —
          never a nested bordered card, which wastes width on small screens. ── */}
      <section className="space-y-4 border-t border-border pt-5">
        <div className="space-y-2">
          <Label
            htmlFor={ids.entryMode}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block"
          >
            Value type
          </Label>
          <EntryModeToggle
            id={ids.entryMode}
            value={entryMode}
            onChange={setEntryMode}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">
            {isReference
              ? "Points at a file, scope, link, or other Matrx entity instead of a typed-in value — stored as a canonical matrx reference fence."
              : "A typed-in value (text, number, date, …), authored with the input component below."}
          </p>
        </div>

        {isReference ? (
          <ReferenceConfigFields
            allowedReferenceTypes={allowedReferenceTypes}
            onToggleReferenceType={toggleReferenceType}
            maxItems={maxItems}
            onMaxItemsChange={setMaxItems}
            allowedScopeTypeIds={allowedScopeTypeIds}
            onToggleAllowedScopeType={toggleAllowedScopeType}
            orgScopeTypes={orgScopeTypes}
            organizationId={orgId}
            datasetTemplateId={datasetTemplateId}
            onDatasetTemplateChange={selectDatasetTemplate}
            disabled={busy}
            className="space-y-3"
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Input component
              </Label>
              <span className="text-[11px] text-muted-foreground shrink-0">
                stored as{" "}
                <code className="font-mono text-foreground">
                  {VALUE_TYPE_CONFIG[derivedValueType]?.label ??
                    derivedValueType}
                </code>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The same components used in the Agent Builder. The storage type is
              derived automatically from the component you pick.
            </p>
            <CustomComponentConfigurator
              value={customComponent}
              onChange={setCustomComponent}
              readonly={busy}
            />
            {derivedValueType !== item.value_type && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 inline-flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                Storage type changes to {derivedValueType} on save — existing
                values won&apos;t auto-convert.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="space-y-1.5">
        <Label htmlFor={ids.description} className="text-xs">
          Description
        </Label>
        <ProTextarea
          id={ids.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minHeight={80}
          maxHeight={600}
          autoGrow
          placeholder="What is this context item for? When should an agent use it?"
          disabled={busy}
          enableTextStats={false}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.category} className="text-xs">
          Category
        </Label>
        <Input
          id={ids.category}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Brand & Identity"
          style={{ fontSize: "16px" }}
          disabled={busy}
          list={ids.categoryList}
        />
        <datalist id={ids.categoryList}>
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.fetchHint} className="text-xs">
          Fetch hint
        </Label>
        <Select
          value={fetchHint}
          onValueChange={(v) => setFetchHint(v as ContextFetchHint)}
          disabled={busy}
        >
          <SelectTrigger id={ids.fetchHint}>
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
        <Label htmlFor={ids.sensitivity} className="text-xs">
          Sensitivity
        </Label>
        <Select
          value={sensitivity}
          onValueChange={(v) => setSensitivity(v as ContextSensitivity)}
          disabled={busy}
        >
          <SelectTrigger id={ids.sensitivity}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SENSITIVITY_CONFIG) as ContextSensitivity[]).map(
              (k) => (
                <SelectItem key={k} value={k}>
                  {SENSITIVITY_CONFIG[k].label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {SENSITIVITY_CONFIG[sensitivity].description}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.tags} className="text-xs">
          Tags
        </Label>
        <div className="flex gap-2">
          <Input
            id={ids.tags}
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
                  aria-label={`Remove ${t}`}
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
          <Label htmlFor={ids.sortOrder} className="text-xs">
            Sort order
          </Label>
          <Input
            id={ids.sortOrder}
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
          <Label htmlFor={ids.reviewInterval} className="text-xs">
            Review interval (days)
          </Label>
          <Input
            id={ids.reviewInterval}
            type="number"
            value={reviewIntervalDays}
            onChange={(e) => setReviewIntervalDays(e.target.value)}
            placeholder="No schedule"
            min={1}
            style={{ fontSize: "16px" }}
            disabled={busy}
          />
          <p className="text-[10px] text-muted-foreground">
            Stale after N days
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <div className="px-3 py-1.5 text-sm bg-muted rounded-md text-muted-foreground capitalize">
            {item.status?.replace(/_/g, " ") || "—"}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.statusNote} className="text-xs">
          Status note
        </Label>
        <ProTextarea
          id={ids.statusNote}
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          minHeight={64}
          maxHeight={600}
          autoGrow
          placeholder="Notes about the current state of this item"
          disabled={busy}
          enableTextStats={false}
        />
      </div>

      {/* Keep this read-only preview after the editable sequence so links inside
          reference values do not interrupt field-to-field tabbing. */}
      {orgId && (
        <ContextItemCurrentValues
          itemId={item.id}
          scopeTypeId={item.scope_type_id}
          orgId={orgId}
          labelPlural={scopeTypeNode?.label_plural}
        />
      )}

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button
          type="button"
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
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelled}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || !displayName.trim()}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
