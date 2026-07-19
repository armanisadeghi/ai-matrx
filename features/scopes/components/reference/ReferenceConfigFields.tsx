"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, Eye, Link2, X } from "lucide-react";
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
import {
  CONTENT_ROLES,
  tryGetEntityInfo,
  type ContentRole,
} from "@/features/scopes/registry/entityRegistry";
import { ReferenceValuePicker } from "@/features/scopes/components/reference/ReferenceValuePicker";

export interface ReferenceConfigOrgScopeType {
  id: string;
  label_singular: string;
}

/**
 * The two synthetic reference types with no `platform.entity_types` row
 * (`url` has no Matrx-owned id; `scope` candidates come from the scope tree).
 * They still need a tier-1 bucket.
 */
const SYNTHETIC_TYPE_ROLE: Record<string, ContentRole> = {
  url: "source",
  scope: "container",
};

function roleForType(t: string): ContentRole {
  return (
    SYNTHETIC_TYPE_ROLE[t] ?? tryGetEntityInfo(t)?.contentRole ?? "destination"
  );
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
 * Type selection is TWO-TIER: tier 1 is the knowledge-model bucket
 * (`content_role` from `platform.entity_types` — Utilities / Sources /
 * Outputs / Workspaces), tier 2 the types in that bucket. Selections span
 * buckets and stay visible in the "Selected" chip row. The optional preview
 * mounts the REAL `ReferenceValuePicker` against throwaway local state so
 * the author sees exactly what fillers will get — nothing it does is saved.
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

  // ── Two-tier grouping ─────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const byRole = new Map<ContentRole, string[]>();
    for (const t of options) {
      const role = roleForType(t);
      byRole.set(role, [...(byRole.get(role) ?? []), t]);
    }
    // CONTENT_ROLES order, only non-empty buckets.
    return CONTENT_ROLES.filter((r) => byRole.has(r.id)).map((r) => ({
      role: r,
      types: byRole.get(r.id)!,
    }));
  }, [options]);

  const [activeRole, setActiveRole] = useState<ContentRole | null>(null);
  const activeGroup =
    groups.find((g) => g.role.id === activeRole) ?? groups[0] ?? null;

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
  // Drop stale preview selections when the allowed set changes under them.
  useEffect(() => {
    setPreviewValue(null);
  }, [allowedReferenceTypes.join("|")]);

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

  return (
    <div className={className ? className : "space-y-3"}>
      <Field label="Allowed types" htmlFor={typesId}>
        <div id={typesId} className="space-y-1.5">
          {/* Tier 1 — knowledge-model buckets */}
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {groups.map(({ role, types }) => {
              const selectedInRole = types.filter((t) =>
                allowedReferenceTypes.includes(t),
              ).length;
              const active = activeGroup?.role.id === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={disabled || !!datasetTemplateId}
                  onClick={() => setActiveRole(role.id)}
                  title={role.tagline}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span
                    className={cn("h-2 w-2 rounded-full", role.accentBar)}
                    aria-hidden
                  />
                  {role.title}
                  {selectedInRole > 0 && (
                    <span className="rounded bg-primary/15 px-1 text-[10px] tabular-nums">
                      {selectedInRole}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tier 2 — the types in the active bucket */}
          {activeGroup && (
            <div className="flex flex-wrap gap-1.5" role="group">
              {activeGroup.types.map((t) => {
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
              })}
            </div>
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
