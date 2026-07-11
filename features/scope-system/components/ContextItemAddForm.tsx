"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { slugifyKey, toSlug } from "@/features/scope-system/utils/slugify";
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
  const [allowedReferenceTypes, setAllowedReferenceTypes] = useState<
    string[]
  >([]);
  const [maxItems, setMaxItems] = useState("1");
  const [allowedScopeTypeIds, setAllowedScopeTypeIds] = useState<string[]>(
    [],
  );

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fetchHint, setFetchHint] = useState<ContextFetchHint>("on_demand");
  const [sensitivity, setSensitivity] =
    useState<ContextSensitivity>("internal");
  const [sortOrder, setSortOrder] = useState("");

  const [busy, setBusy] = useState(false);

  const isReference = entryMode === "reference";
  const valueType: ContextValueType = isReference ? "reference" : primitiveType;

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

  // Org scope types, for the "scope" reference type's allowed-scope-type filter.
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const scopeTypeNode = useAppSelector((s) =>
    selectScopeType(s, scopeTypeId),
  );
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
    setPrimitiveType(defaultValueType === "reference" ? "string" : defaultValueType);
    setDescription("");
    setCategory("");
    setTags([]);
    setTagInput("");
    setValue("");
    setAllowedReferenceTypes([]);
    setMaxItems("1");
    setAllowedScopeTypeIds([]);
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
          slug: toSlug(trimmed) || undefined,
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
        }),
      ).unwrap();

      onAdded?.(item);

      const hasValue =
        valueType !== "reference" &&
        value != null &&
        (typeof value !== "string" || value.trim() !== "");
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
    <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        New field is added to <strong>all {labelPlural}</strong> — define once,
        fill values per {labelPlural.replace(/s$/, "").toLowerCase()}.
      </p>

      {/* Name */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Name</Label>
        <Input
          ref={nameRef}
          autoFocus
          placeholder="e.g. Website URL"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
          className="mt-0.5"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(true);
            }
            if (e.key === "Escape") onClose();
          }}
        />
      </div>

      {/* Value type — Direct Entry vs. Reference, the first decision */}
      <div className="space-y-2">
        <Label className="text-[10px] text-muted-foreground">
          Value type
        </Label>
        <EntryModeToggle
          value={entryMode}
          onChange={setEntryMode}
          disabled={busy}
        />

        {isReference ? (
          <ReferenceConfigFields
            allowedReferenceTypes={allowedReferenceTypes}
            onToggleReferenceType={toggleReferenceType}
            maxItems={maxItems}
            onMaxItemsChange={setMaxItems}
            allowedScopeTypeIds={allowedScopeTypeIds}
            onToggleAllowedScopeType={toggleAllowedScopeType}
            orgScopeTypes={orgScopeTypes}
            disabled={busy}
            className="space-y-2 rounded-md border border-border bg-background/60 p-2.5"
          />
        ) : (
          <Select
            value={primitiveType}
            onValueChange={(v) => setPrimitiveType(v as ContextValueType)}
            disabled={busy}
          >
            <SelectTrigger className="w-full sm:w-48">
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

      {/* Description */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Description</Label>
        <Input
          placeholder="What is this field for? (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={busy}
          className="mt-0.5"
        />
      </div>

      {/* Category + Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Category</Label>
          <Select
            value={category || NO_CATEGORY}
            onValueChange={(v) => setCategory(v === NO_CATEGORY ? "" : v)}
            disabled={busy}
          >
            <SelectTrigger className="mt-0.5">
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
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Tags</Label>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 min-h-9">
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
              className="flex-1 min-w-[6rem] bg-transparent outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {scopeId && valueType === "reference" && (
        <p className="text-[11px] text-muted-foreground">
          Reference fields are configured and set from the item's own page once
          it's created.
        </p>
      )}
      {scopeId && valueType !== "reference" && (
        <div>
          <Label className="text-[10px] text-muted-foreground">
            Value for this one (optional)
          </Label>
          <ContextValueInput
            valueType={valueType}
            value={value}
            onChange={setValue}
            placeholder="Leave blank to fill later"
            disabled={busy}
            minHeight={56}
            maxHeight={600}
            className="mt-0.5"
          />
        </div>
      )}

      {/* Advanced: sort order, fetch hint, sensitivity */}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Sort order
            </Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Auto (end)"
              style={{ fontSize: "16px" }}
              disabled={busy}
              className="mt-0.5"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Fetch hint
            </Label>
            <Select
              value={fetchHint}
              onValueChange={(v) => setFetchHint(v as ContextFetchHint)}
              disabled={busy}
            >
              <SelectTrigger className="mt-0.5">
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
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Sensitivity
            </Label>
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as ContextSensitivity)}
              disabled={busy}
            >
              <SelectTrigger className="mt-0.5">
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
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
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
