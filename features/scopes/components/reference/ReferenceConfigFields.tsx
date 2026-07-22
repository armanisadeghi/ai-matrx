"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, Eye, Link2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/official/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scopesService,
  type DatasetTableTemplate,
} from "@/features/scopes/service/scopesService";
import {
  CONTEXT_REFERENCE_TYPE_OPTIONS,
  referenceTypeLabel,
} from "@/features/scopes/utils/referenceCell";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  ENTITY_TYPE_METADATA,
  REFERENCE_CATEGORY_DISPLAY,
  SCHEMA_DISPLAY,
  isEntityTypeToken,
} from "@/types/generated/entity-types.generated";
import { ReferenceValuePicker } from "@/features/scopes/components/reference/ReferenceValuePicker";

export interface ReferenceConfigOrgScopeType {
  id: string;
  label_singular: string;
}

/**
 * The two synthetic reference types with no `platform.entity_types` row
 * (`url` has no Matrx-owned id; `scope` candidates come from the scope tree).
 * They form the always-first "Basics" bucket.
 */
const BASICS_BUCKET = "__basics__";
const SYNTHETIC_TYPES = new Set(["url", "scope"]);
const GROUP_SELECT_NONE = "__group_none__";

// Buckets: an admin-assigned reference category wins (prefixed keys keep the
// two namespaces from colliding); otherwise the type's schema.
function bucketForType(t: string): string {
  if (SYNTHETIC_TYPES.has(t) || !isEntityTypeToken(t)) return BASICS_BUCKET;
  const meta = ENTITY_TYPE_METADATA[t];
  const cat = meta.referenceCategory;
  if (cat && REFERENCE_CATEGORY_DISPLAY[cat]?.isActive) return `cat:${cat}`;
  return `schema:${meta.schema}`;
}

function bucketLabel(bucket: string): string {
  if (bucket === BASICS_BUCKET) return "Basics";
  if (bucket.startsWith("cat:")) {
    const slug = bucket.slice(4);
    return REFERENCE_CATEGORY_DISPLAY[slug]?.label ?? slug;
  }
  const schema = bucket.slice("schema:".length);
  return SCHEMA_DISPLAY[schema]?.label ?? schema;
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === "url") return <Link2 className={className} />;
  const Icon = tryGetEntityInfo(type)?.Icon;
  return Icon ? <Icon className={className} /> : null;
}

export interface ReferenceConfigFieldsProps {
  allowedReferenceTypes: string[];
  onToggleReferenceType: (type: string) => void;
  maxItems: string;
  onMaxItemsChange: (value: string) => void;
  allowedScopeTypeIds: string[];
  onToggleAllowedScopeType: (id: string) => void;
  orgScopeTypes: ReferenceConfigOrgScopeType[];
  organizationId?: string | null;
  datasetTemplateId?: string | null;
  onDatasetTemplateChange?: (templateId: string | null) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Override the allowed-type choices. Defaults to every option
   * (`CONTEXT_REFERENCE_TYPE_OPTIONS`). A host that can't support a subtype in
   * its context (e.g. the System Context admin can't resolve a user `scope`
   * from the member-less system org) passes a filtered list.
   */
  typeOptions?: string[];
  /**
   * Show the live "what will filling this field look like" picker preview
   * (default true). A host that already renders a REAL value input beside
   * this config (the add form on a scope page) turns it off to avoid two
   * near-identical pickers.
   */
  showPreview?: boolean;
  /**
   * Scope used by the preview's `scope` sub-picker to resolve the org tree.
   * Optional — without it every other type still previews fine.
   */
  previewScopeId?: string | null;
}

/**
 * THE reference-config editor — every field a `value_type="reference"`
 * context item needs (allowed types, cardinality, and, when "scope" is
 * allowed, which scope types). Shown immediately once "Reference" is chosen
 * on `EntryModeToggle` — never gated behind a second toggle. Shared by
 * `ContextItemAddForm` and `ContextItemSettingsForm`; do not re-implement
 * this block a third time.
 *
 * Type selection is TWO-TIER via paired selects: tier 1 the DB schema
 * (pretty name from `platform.schemas` via the generated `SCHEMA_DISPLAY`,
 * plus a "Basics" bucket for the synthetic `url`/`scope` types), tier 2 the
 * entity types in that schema. Both selects stay mounted at all times so the
 * layout never shifts. The set is deliberately open — every `reference_pickable`
 * type in `platform.entity_types` is offered; we do not predetermine what a
 * user may associate. Typing in the search repoints tier 2 at matches across
 * ALL buckets. Selections span buckets and stay visible in the "Selected"
 * chip row. The optional preview mounts the REAL `ReferenceValuePicker`
 * against throwaway local state — nothing picked there is saved.
 *
 * Labels use canonical `Field`.
 */
export function ReferenceConfigFields({
  allowedReferenceTypes,
  onToggleReferenceType,
  maxItems,
  onMaxItemsChange,
  allowedScopeTypeIds,
  onToggleAllowedScopeType,
  orgScopeTypes,
  organizationId,
  datasetTemplateId,
  onDatasetTemplateChange,
  disabled,
  className,
  typeOptions,
  showPreview = true,
  previewScopeId,
}: ReferenceConfigFieldsProps) {
  const uid = useId();
  const options = typeOptions ?? CONTEXT_REFERENCE_TYPE_OPTIONS;
  const typesId = `${uid}-types`;
  const groupSelectId = `${uid}-group`;
  const typeSelectId = `${uid}-type`;
  const maxId = `${uid}-max`;
  const scopesId = `${uid}-scopes`;
  const templateId = `${uid}-table-template`;
  const previewId = `${uid}-preview`;
  const [templates, setTemplates] = useState<DatasetTableTemplate[]>([]);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeSelectKey, setTypeSelectKey] = useState(0);

  // ── Two-tier grouping: schema buckets ────────────────────────────────────
  const groups = useMemo(() => {
    const byBucket = new Map<string, string[]>();
    for (const t of options) {
      const b = bucketForType(t);
      byBucket.set(b, [...(byBucket.get(b) ?? []), t]);
    }
    return [...byBucket.entries()]
      .map(([bucket, types]) => ({
        bucket,
        label: bucketLabel(bucket),
        types: [...types].sort((a, b) =>
          referenceTypeLabel(a).localeCompare(referenceTypeLabel(b)),
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [options]);

  const defaultBucket = groups[0]?.bucket ?? GROUP_SELECT_NONE;
  const [activeBucket, setActiveBucket] = useState(defaultBucket);
  const activeGroup =
    groups.find((g) => g.bucket === activeBucket) ?? groups[0] ?? null;
  const searching = typeSearch.trim().length > 0;

  // Search cuts across every bucket (flat result list).
  const searchMatches = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter(
        (t) =>
          referenceTypeLabel(t).toLowerCase().includes(q) ||
          t.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        referenceTypeLabel(a).localeCompare(referenceTypeLabel(b)),
      );
  }, [options, typeSearch]);

  const typeSelectOptions = searching
    ? searchMatches
    : (activeGroup?.types ?? []);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveBucket(GROUP_SELECT_NONE);
      return;
    }
    if (!groups.some((group) => group.bucket === activeBucket)) {
      setActiveBucket(groups[0].bucket);
    }
  }, [groups, activeBucket]);

  const pickerDisabled = disabled || !!datasetTemplateId;

  // ── Throwaway preview state — NEVER persisted anywhere ────────────────────
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const previewConfig = useMemo(
    () => ({
      allowed_reference_types: allowedReferenceTypes,
      max_items: Math.max(1, Number(maxItems) || 1),
      allowed_scope_type_ids: allowedReferenceTypes.includes("scope")
        ? allowedScopeTypeIds
        : null,
    }),
    [allowedReferenceTypes, maxItems, allowedScopeTypeIds],
  );
  const allowedKey = allowedReferenceTypes.join("|");
  // Drop stale preview selections when the allowed set changes under them.
  useEffect(() => {
    setPreviewValue(null);
  }, [allowedKey]);

  useEffect(() => {
    if (!organizationId || !onDatasetTemplateChange) {
      return;
    }
    let cancelled = false;
    void scopesService.listTableTemplates(organizationId).then((result) => {
      if (cancelled) return;
      setTemplates(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, onDatasetTemplateChange]);

  const addReferenceType = (type: string) => {
    if (pickerDisabled || allowedReferenceTypes.includes(type)) return;
    onToggleReferenceType(type);
    setTypeSelectKey((key) => key + 1);
  };

  return (
    <div className={className ? className : "space-y-3"}>
      <Field label="Allowed types" htmlFor={typesId}>
        <div id={typesId} className="space-y-1.5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              placeholder="Search all types…"
              disabled={pickerDisabled}
              style={{ fontSize: "16px" }}
              className="h-7 pl-7 pr-2 text-xs"
            />
          </div>

          <div className="grid max-w-md grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Select
              value={
                groups.some((group) => group.bucket === activeBucket)
                  ? activeBucket
                  : GROUP_SELECT_NONE
              }
              onValueChange={(value) => {
                if (value !== GROUP_SELECT_NONE) setActiveBucket(value);
              }}
              disabled={pickerDisabled || groups.length === 0 || searching}
            >
              <SelectTrigger id={groupSelectId} size="sm" aria-label="Group">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(({ bucket, label, types }) => {
                  const selectedIn = types.filter((t) =>
                    allowedReferenceTypes.includes(t),
                  ).length;
                  return (
                    <SelectItem key={bucket} value={bucket}>
                      {label}
                      {selectedIn > 0 ? ` (${selectedIn} selected)` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select
              key={typeSelectKey}
              onValueChange={addReferenceType}
              disabled={pickerDisabled || typeSelectOptions.length === 0}
            >
              <SelectTrigger id={typeSelectId} size="sm" aria-label="Type">
                <SelectValue
                  placeholder={
                    searching
                      ? typeSelectOptions.length > 0
                        ? "Add from search results…"
                        : "No search matches"
                      : "Add a type…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {typeSelectOptions.map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    disabled={allowedReferenceTypes.includes(t)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <TypeIcon type={t} className="h-3.5 w-3.5" />
                      {referenceTypeLabel(t)}
                      {allowedReferenceTypes.includes(t) ? " (selected)" : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {searching && typeSelectOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No types match &ldquo;{typeSearch.trim()}&rdquo;.
            </p>
          ) : null}

          {/* Selections span buckets — keep them all visible + removable */}
          {allowedReferenceTypes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">
                Selected:
              </span>
              {[...allowedReferenceTypes]
                .sort((a, b) =>
                  referenceTypeLabel(a).localeCompare(referenceTypeLabel(b)),
                )
                .map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]"
                  >
                    <TypeIcon type={t} className="h-3 w-3" />
                    {referenceTypeLabel(t)}
                    {!disabled && !datasetTemplateId && (
                      <button
                        type="button"
                        onClick={() => onToggleReferenceType(t)}
                        className="hover:text-rose-600"
                        aria-label={`Remove ${referenceTypeLabel(t)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              Select at least one type.
            </p>
          )}
        </div>
      </Field>

      <Field
        label="Max items"
        htmlFor={maxId}
        description="1 = a single value. Higher allows a list (e.g. several files)."
      >
        <Input
          id={maxId}
          type="number"
          min={1}
          value={maxItems}
          onChange={(e) => onMaxItemsChange(e.target.value)}
          style={{ fontSize: "16px" }}
          disabled={disabled || !!datasetTemplateId}
          className="h-7 w-28 px-2 text-xs"
        />
      </Field>

      {allowedReferenceTypes.includes("scope") && (
        <Field
          label="Allowed scope types"
          htmlFor={scopesId}
          description="Leave all unselected to allow any scope type in the org."
        >
          {orgScopeTypes.length === 0 ? (
            <p id={scopesId} className="text-xs text-muted-foreground">
              Loading scope types…
            </p>
          ) : (
            <div id={scopesId} className="flex flex-wrap gap-1.5" role="group">
              {orgScopeTypes.map((st) => {
                const active = allowedScopeTypeIds.includes(st.id);
                return (
                  <Button
                    key={st.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onToggleAllowedScopeType(st.id)}
                    aria-pressed={active}
                    className={
                      active
                        ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15 hover:text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {st.label_singular}
                  </Button>
                );
              })}
            </div>
          )}
        </Field>
      )}

      {showPreview && allowedReferenceTypes.length > 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5 space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Eye className="h-3 w-3" />
            Preview — this is exactly what filling this field looks like.
            Nothing you pick here is saved.
          </p>
          <ReferenceValuePicker
            id={previewId}
            aria-label="Reference field preview"
            config={previewConfig}
            value={previewValue}
            onChange={setPreviewValue}
            scopeId={previewScopeId ?? ""}
          />
        </div>
      )}

      {onDatasetTemplateChange && (
        <Field
          label="Per-scope table template"
          htmlFor={templateId}
          description="Optional. Creates one table for every scope and locks its columns to this template."
        >
          <Select
            value={datasetTemplateId ?? "__none__"}
            onValueChange={(value) =>
              onDatasetTemplateChange(value === "__none__" ? null : value)
            }
            disabled={disabled || !organizationId}
          >
            <SelectTrigger id={templateId} size="sm" className="max-w-md">
              <SelectValue placeholder="No template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No template</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} ({template.fields.length} columns)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {datasetTemplateId && (
            <p className="text-xs text-muted-foreground">
              The table value is provisioned automatically; users edit rows, not
              columns.
            </p>
          )}
        </Field>
      )}
    </div>
  );
}

export default ReferenceConfigFields;
