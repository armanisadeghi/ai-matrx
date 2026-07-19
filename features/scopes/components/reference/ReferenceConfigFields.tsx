"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, Eye, Link2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/official/Field";
import { cn } from "@/utils/cn";
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

function bucketSortOrder(bucket: string): number {
  if (bucket === BASICS_BUCKET) return -1;
  if (bucket.startsWith("cat:")) {
    // Admin categories sort before schema buckets — they are deliberate.
    return (REFERENCE_CATEGORY_DISPLAY[bucket.slice(4)]?.sortOrder ?? 50) - 1000;
  }
  return SCHEMA_DISPLAY[bucket.slice("schema:".length)]?.sortOrder ?? 999;
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
 * Type selection is TWO-TIER: tier 1 the DB schema (pretty name from
 * `platform.schemas` via the generated `SCHEMA_DISPLAY`, plus a "Basics"
 * bucket for the synthetic `url`/`scope` types), tier 2 the entity types in
 * that schema. The set is deliberately open — every `reference_pickable`
 * type in `platform.entity_types` is offered; we do not predetermine what a
 * user may associate. Typing in the search filters across ALL buckets.
 * Selections span buckets and stay visible in the "Selected" chip row. The
 * optional preview mounts the REAL `ReferenceValuePicker` against throwaway
 * local state — nothing picked there is saved.
 *
 * Chips use canonical `Button size="sm"` so they match `EntryModeToggle`
 * (`h-7 text-xs`). Labels use canonical `Field`.
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
  const maxId = `${uid}-max`;
  const scopesId = `${uid}-scopes`;
  const templateId = `${uid}-table-template`;
  const previewId = `${uid}-preview`;
  const [templates, setTemplates] = useState<DatasetTableTemplate[]>([]);
  const [typeSearch, setTypeSearch] = useState("");

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
      .sort(
        (a, b) =>
          bucketSortOrder(a.bucket) - bucketSortOrder(b.bucket) ||
          a.label.localeCompare(b.label),
      );
  }, [options]);

  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const activeGroup =
    groups.find((g) => g.bucket === activeBucket) ?? groups[0] ?? null;

  // Search cuts across every bucket (flat result list).
  const searchMatches = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return null;
    return options.filter(
      (t) =>
        referenceTypeLabel(t).toLowerCase().includes(q) ||
        t.toLowerCase().includes(q),
    );
  }, [options, typeSearch]);

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

  const renderTypeChip = (t: string) => {
    const active = allowedReferenceTypes.includes(t);
    return (
      <Button
        key={t}
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !!datasetTemplateId}
        onClick={() => onToggleReferenceType(t)}
        aria-pressed={active}
        className={
          active
            ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15 hover:text-foreground"
            : "text-muted-foreground"
        }
      >
        <TypeIcon type={t} className="mr-1 h-3.5 w-3.5" />
        {referenceTypeLabel(t)}
      </Button>
    );
  };

  return (
    <div className={className ? className : "space-y-3"}>
      <Field label="Allowed types" htmlFor={typesId}>
        <div id={typesId} className="space-y-1.5">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              placeholder="Search all types…"
              disabled={disabled || !!datasetTemplateId}
              style={{ fontSize: "16px" }}
              className="h-7 pl-7 pr-2 text-xs"
            />
          </div>

          {searchMatches ? (
            searchMatches.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" role="group">
                {searchMatches.map(renderTypeChip)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No types match &ldquo;{typeSearch.trim()}&rdquo;.
              </p>
            )
          ) : (
            <>
              {/* Tier 1 — schema buckets (pretty names from platform.schemas) */}
              <div className="flex flex-wrap gap-1" role="tablist">
                {groups.map(({ bucket, label, types }) => {
                  const selectedIn = types.filter((t) =>
                    allowedReferenceTypes.includes(t),
                  ).length;
                  const active = activeGroup?.bucket === bucket;
                  return (
                    <button
                      key={bucket}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={disabled || !!datasetTemplateId}
                      onClick={() => setActiveBucket(bucket)}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                        active
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {label}
                      {selectedIn > 0 && (
                        <span className="rounded bg-primary/15 px-1 text-[10px] tabular-nums">
                          {selectedIn}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tier 2 — the types in the active bucket */}
              {activeGroup && (
                <div className="flex flex-wrap gap-1.5" role="group">
                  {activeGroup.types.map(renderTypeChip)}
                </div>
              )}
            </>
          )}

          {/* Selections span buckets — keep them all visible + removable */}
          {allowedReferenceTypes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">
                Selected:
              </span>
              {allowedReferenceTypes.map((t) => (
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
              <SelectValue
                placeholder="No template"
              />
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
              The table value is provisioned automatically; users edit rows, not columns.
            </p>
          )}
        </Field>
      )}
    </div>
  );
}

export default ReferenceConfigFields;
