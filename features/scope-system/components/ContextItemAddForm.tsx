"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/official/Field";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createContextItem,
  type ContextItem,
  type ContextValueType,
  type ContextFetchHint,
  type ContextSensitivity,
} from "@/features/scope-system/redux/contextItemsSlice";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import { slugifyKey } from "@/features/scope-system/utils/slugify";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import {
  EntryModeToggle,
  type EntryMode,
} from "@/features/scopes/components/reference/EntryModeToggle";
import { ReferenceConfigFields } from "@/features/scopes/components/reference/ReferenceConfigFields";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScopeType,
  makeSelectScopeTypesForOrg,
} from "@/features/scopes/redux/selectors/tree";
import {
  VALUE_TYPE_CONFIG,
  DEFAULT_CATEGORIES,
  FETCH_HINT_CONFIG,
  SENSITIVITY_CONFIG,
} from "@/features/agent-context/constants";

const NO_CATEGORY = "__none__";

/** Direct-entry primitive types — "Reference" is a separate first-class mode, never mixed into this list. */
const PRIMITIVE_VALUE_TYPES = (
  Object.keys(VALUE_TYPE_CONFIG) as ContextValueType[]
).filter((k) => k !== "reference");

/** Dense form control height — matches `Button size="sm"` / `SelectTrigger size="sm"` / EntryModeToggle. */
const CONTROL_CLASS = "h-7 px-2 text-xs";

interface ContextItemAddFormProps {
  scopeTypeId: string;
  labelPlural: string;
  /** When present, the optional "value for this one" field is shown and saved. */
  scopeId?: string;
  /** Called with the freshly-created item (e.g. to splice a cache placeholder). */
  onAdded?: (item: ContextItem) => void;
  /** Called when the user cancels or finishes (plain "Add"). */
  onClose: () => void;
  defaultValueType?: ContextValueType;
}

/**
 * The single inline "add a context item" form, shared by the scope-type page
 * and the scope detail page. Name / type / description / category / tags are
 * always visible (the whole point is to encourage filling them in); Advanced
 * holds sort order, fetch hint, and sensitivity. "Add & next" keeps the form
 * open and refocuses for rapid entry.
 *
 * Density: every control is `h-7` / `text-xs` (Button/Select/ToggleGroup sm).
 * Labels come from canonical `Field` — no mixed `text-[10px]` / giant toggles.
 */
export function ContextItemAddForm({
  scopeTypeId,
  labelPlural,
  scopeId,
  onAdded,
  onClose,
  defaultValueType = "string",
}: ContextItemAddFormProps) {
  const dispatch = useAppDispatch();
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const [name, setName] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>(
    defaultValueType === "reference" ? "reference" : "direct",
  );
  const [primitiveType, setPrimitiveType] = useState<ContextValueType>(
    defaultValueType === "reference" ? "string" : defaultValueType,
  );
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [value, setValue] = useState<unknown>("");

  // Reference config — only meaningful in "reference" mode.
  const [allowedReferenceTypes, setAllowedReferenceTypes] = useState<string[]>(
    [],
  );
  const [maxItems, setMaxItems] = useState("1");
  const [allowedScopeTypeIds, setAllowedScopeTypeIds] = useState<string[]>([]);
  const [datasetTemplateId, setDatasetTemplateId] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fetchHint, setFetchHint] = useState<ContextFetchHint>("on_demand");
  const [sensitivity, setSensitivity] =
    useState<ContextSensitivity>("internal");
  const [sortOrder, setSortOrder] = useState("");

  const [busy, setBusy] = useState(false);

  const isReference = entryMode === "reference";
  const valueType: ContextValueType = isReference ? "reference" : primitiveType;

  const ids = {
    name: `${uid}-name`,
    entryMode: `${uid}-entry-mode`,
    primitive: `${uid}-primitive`,
    description: `${uid}-description`,
    category: `${uid}-category`,
    tags: `${uid}-tags`,
    value: `${uid}-value`,
    sort: `${uid}-sort`,
    fetch: `${uid}-fetch`,
    sensitivity: `${uid}-sensitivity`,
  };

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

  // Org scope types, for the "scope" reference type's allowed-scope-type filter.
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const scopeTypeNode = useAppSelector((s) => selectScopeType(s, scopeTypeId));
  const orgId = scopeTypeNode?.organization_id ?? null;
  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const orgScopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  function addTag() {
    const next = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (next && !tags.includes(next)) setTags([...tags, next]);
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function resetFields() {
    setName("");
    setEntryMode(defaultValueType === "reference" ? "reference" : "direct");
    setPrimitiveType(
      defaultValueType === "reference" ? "string" : defaultValueType,
    );
    setDescription("");
    setCategory("");
    setTags([]);
    setTagInput("");
    setValue("");
    setAllowedReferenceTypes([]);
    setMaxItems("1");
    setAllowedScopeTypeIds([]);
    setDatasetTemplateId(null);
    setFetchHint("on_demand");
    setSensitivity("internal");
    setSortOrder("");
  }

  async function submit(keepOpen: boolean) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (isReference && allowedReferenceTypes.length === 0) {
      toast.error("Select at least one reference type");
      return;
    }
    setBusy(true);
    try {
      const maxItemsNum = Math.max(1, Number(maxItems) || 1);
      const item = await dispatch(
        createContextItem({
          scope_type_id: scopeTypeId,
          key: slugifyKey(trimmed) || trimmed.toLowerCase(),
          display_name: trimmed,
          value_type: valueType,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          tags: tags.length ? tags : undefined,
          fetch_hint: fetchHint,
          sensitivity,
          sort_order: sortOrder.trim() ? Number(sortOrder) : undefined,
          allowed_reference_types: isReference
            ? allowedReferenceTypes
            : undefined,
          max_items: isReference ? maxItemsNum : undefined,
          allowed_scope_type_ids:
            isReference && allowedReferenceTypes.includes("scope")
              ? allowedScopeTypeIds
              : undefined,
          reference_source:
            isReference && datasetTemplateId
              ? {
                  container_type: "dataset_template",
                  template_id: datasetTemplateId,
                  dimension: "whole",
                  provision: "per_scope",
                }
              : undefined,
        }),
      ).unwrap();

      onAdded?.(item);

      // A reference value is a `matrx` fence string; buildScopeValuePayload routes
      // it to value_text and write_context_value validates it against the item's
      // just-saved allowed_reference_types.
      const hasValue =
        value != null && (typeof value !== "string" || value.trim() !== "");
      if (scopeId && hasValue) {
        await dispatch(
          setScopeContextValue({
            scope_id: scopeId,
            context_item_id: item.id,
            ...buildScopeValuePayload(value, valueType),
          }),
        ).unwrap();
      }

      toast.success(`Added "${item.display_name}" to all ${labelPlural}`);

      if (keepOpen) {
        resetFields();
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        resetFields();
        onClose();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add context item",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-3">
      <p className="text-xs text-amber-700 dark:text-amber-300">
        New field is added to <strong>all {labelPlural}</strong> — define once,
        fill values per {labelPlural.replace(/s$/, "").toLowerCase()}.
      </p>

      <Field label="Name" htmlFor={ids.name} required>
        <Input
          id={ids.name}
          ref={nameRef}
          autoFocus
          placeholder="e.g. Website URL"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
          className={CONTROL_CLASS}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(true);
            }
            if (e.key === "Escape") onClose();
          }}
        />
      </Field>

      <Field
        label="Value type"
        htmlFor={ids.entryMode}
        help="Direct holds a typed-in value. Reference points at a Matrx entity (file, scope, note, …)."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <EntryModeToggle
              id={ids.entryMode}
              value={entryMode}
              onChange={setEntryMode}
              disabled={busy}
            />
            {!isReference && (
              <Select
                value={primitiveType}
                onValueChange={(v) => setPrimitiveType(v as ContextValueType)}
                disabled={busy}
              >
                <SelectTrigger id={ids.primitive} size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIMITIVE_VALUE_TYPES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {VALUE_TYPE_CONFIG[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {isReference && (
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
          )}
        </div>
      </Field>

      <Field label="Description" htmlFor={ids.description} optional>
        <Input
          id={ids.description}
          placeholder="What is this field for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
          className={CONTROL_CLASS}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category" htmlFor={ids.category} optional>
          <Select
            value={category || NO_CATEGORY}
            onValueChange={(v) => setCategory(v === NO_CATEGORY ? "" : v)}
            disabled={busy}
          >
            <SelectTrigger id={ids.category} size="sm">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>None</SelectItem>
              {DEFAULT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tags" htmlFor={ids.tags} optional>
          <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-0.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                <TagIcon className="h-2.5 w-2.5" />
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="hover:text-rose-600"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id={ids.tags}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                } else if (e.key === "Backspace" && !tagInput && tags.length) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder={tags.length ? "" : "Type and press Enter"}
              disabled={busy}
              style={{ fontSize: "16px" }}
              className="min-w-[6rem] flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        </Field>
      </div>

      {scopeId && (
        <Field label="Value for this one" htmlFor={ids.value} optional>
          {isReference && allowedReferenceTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Choose at least one reference type above to set a value here.
            </p>
          ) : (
            <ContextValueInput
              id={ids.value}
              valueType={valueType}
              value={value}
              onChange={setValue}
              onCommit={setValue}
              referenceConfig={
                isReference
                  ? {
                      allowed_reference_types: allowedReferenceTypes,
                      max_items: Math.max(1, Number(maxItems) || 1),
                      allowed_scope_type_ids: allowedReferenceTypes.includes(
                        "scope",
                      )
                        ? allowedScopeTypeIds
                        : null,
                    }
                  : null
              }
              scopeId={scopeId}
              displayName={name || "Value"}
              placeholder="Leave blank to fill later"
              disabled={busy}
              compact
              minHeight={28}
              maxHeight={200}
            />
          )}
        </Field>
      )}

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        disabled={busy}
      >
        {advancedOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Advanced
        <span className="font-normal">sort order, fetch hint, sensitivity</span>
      </button>

      {advancedOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Sort order" htmlFor={ids.sort} optional>
            <Input
              id={ids.sort}
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Auto (end)"
              style={{ fontSize: "16px" }}
              disabled={busy}
              className={CONTROL_CLASS}
            />
          </Field>
          <Field label="Fetch hint" htmlFor={ids.fetch}>
            <Select
              value={fetchHint}
              onValueChange={(v) => setFetchHint(v as ContextFetchHint)}
              disabled={busy}
            >
              <SelectTrigger id={ids.fetch} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FETCH_HINT_CONFIG) as ContextFetchHint[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {FETCH_HINT_CONFIG[k].label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sensitivity" htmlFor={ids.sensitivity}>
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as ContextSensitivity)}
              disabled={busy}
            >
              <SelectTrigger id={ids.sensitivity} size="sm">
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
          </Field>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => submit(true)}
          disabled={busy || !name.trim()}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Add &amp; next
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => submit(false)}
          disabled={busy || !name.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
