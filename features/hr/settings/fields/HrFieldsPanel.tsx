// features/hr/settings/fields/HrFieldsPanel.tsx
//
// ROUTE 73 — CUSTOM FIELDS AND CUSTOM TABS.
//
// FIELDS COME FROM, AND GO TO, THE CUSTOM STORE — never `platform.custom_field_definition`.
// An organization's custom fields on a platform record type (`hr_employee`, ...) are read with
// `custom.entity_fields` (`useEntityFields`), declared with `FieldEditor entityToken`
// (`custom.entity_field_declare`), renamed/retired with `useEntityFieldMutation`
// (`custom.entity_field_update` / `entity_field_retire`), all from @ai-matrx/records(-ui) — the
// platform's ONE field editor, never an HR fork. `platform.custom_field_target` (which tokens are on,
// their ceilings) is still read as policy, read-only.
//
// ── THE GOVERNANCE RULES, STATED ON THE PAGE (SPEC-EMPLOYEES §7.4) ─────────
//  • A field's key and type are IMMUTABLE once any value exists: archive and recreate instead.
//  • DELETING A DEFINITION NEVER DELETES VALUES.
//  • A `restricted`-tier field is NEVER in an AI Provision.

"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { RecordsProvider, useEntityFieldMutation, useEntityFields } from "@ai-matrx/records/react";
import type { Field } from "@ai-matrx/records";
import { FIELD_SENSITIVITY_LABEL, FieldEditor, RefusalLine, fieldTypeLabel } from "@ai-matrx/records-ui";
import { ConfirmDelete } from "@ai-matrx/design-system/controls";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { useHrContext } from "../../shared/useHrContext";
import { fetchHrCustomFieldRegistry } from "../service";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrCustomFieldTarget } from "../types";

// THE RECORD-TYPE NAMES ARE READ, NOT WRITTEN HERE (DD-097). This file used to
// carry a seven-entry `TOKEN_LABEL` map that matched a seven-entry token list in
// `service.ts`; live `platform.custom_field_target` enables five tokens, three of
// which appeared in neither. `platform.entity_types.label` is the one place a
// token's human name lives, and `fetchHrCustomFieldRegistry` reads it.

/** The AI ceiling's stored values, in words. Sensitivity words come from the records package. */
export const AI_CEILING_LABEL: Record<string, string> = {
  allowed: "AI may read these fields",
  aggregate_only: "AI sees only totals, never a person's value",
  never: "Kept from AI entirely",
};
export const VALIDATION_LABEL: Record<string, string> = {
  advisory: "Warns, never blocks",
  permissive: "Warns, never blocks",
  strict: "Blocks a bad value",
};
const UNRECOGNIZED = "Not recognized";
const sensitivityWords = (v: string | null | undefined) =>
  v ? ((FIELD_SENSITIVITY_LABEL as Record<string, string>)[v] ?? UNRECOGNIZED) : "Not set";
const wordsFrom = (map: Record<string, string>, v: string | null | undefined) =>
  v ? (map[v] ?? UNRECOGNIZED) : "Not set";

export function HrFieldsPanel() {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [targets, setTargets] = useState<HrCustomFieldTarget[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Derived, never set synchronously in an effect body (react-hooks/set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrCustomFieldRegistry({ organizationId });
      if (cancelled) return;
      if (result.ok) {
        setTargets(result.data.targets);
        setLabels(result.data.labels);
        setError(null);
      } else {
        setError(result);
      }
      setLoadedFor(organizationId);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, reload]);

  // The record type's own name: the live registry label, else the entity registry's. A token is an
  // identifier, never a name a person reads — one with neither says so, plainly.
  const labelFor = (token: string | null) =>
    token ? (labels[token] ?? tryGetEntityInfo(token)?.label ?? "Unnamed record type") : "—";
  const enabledTargets = targets.filter((row) => row.is_enabled);
  const recordsConfig = useAppRecordsConfig(organizationId);

  return (
    <HrSettingsShell
      section="fields"
      title="Custom fields"
      description="Extra fields on HR records, and how sensitive each one is."
      loading={organizationId !== null && loadedFor !== organizationId}
      error={error}
      operation="This employer's custom-field registry"
      onRetry={() => setReload((n) => n + 1)}
    >
      <div className="space-y-6 p-4 sm:p-6">
        {/* What each record type allows */}
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-start gap-3 border-b border-border p-4">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                What each record type allows
              </h2>
              <p className="text-sm text-muted-foreground">
                Every HR record type the database has switched on, and the ceilings a
                custom field on that record cannot exceed.
              </p>
            </div>
          </header>
          {targets.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No HR record type has custom fields switched on — not for this employer,
              and not as a platform default. Until one does, nothing can be added to
              any of them.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {targets.map((target) => {
                // Which of the two this row is. Every live row today is a platform
                // default inherited by every employer; an employer's own row would
                // carry its own organization_id. Saying which is the difference
                // between "we decided this" and "the platform decided this".
                const isOwnRow = target.organization_id === organizationId;
                return (
                  <li key={target.id} className="flex flex-wrap gap-2 p-4 text-sm">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {labelFor(target.target_token)}
                      </span>
                      <Badge variant={target.is_enabled ? "secondary" : "outline"}>
                        {target.is_enabled ? "Enabled" : "Off"}
                      </Badge>
                      <Badge variant="outline">
                        {isOwnRow ? "Set by this employer" : "Platform default"}
                      </Badge>
                    </span>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                      {[
                        ["Field limit", target.max_fields == null ? "Unlimited" : String(target.max_fields)],
                        ["Most sensitive a field may be, seen by", sensitivityWords(target.sensitivity_ceiling)],
                        ["AI access", wordsFrom(AI_CEILING_LABEL, target.ai_exposure_ceiling)],
                        ["Checking values", wordsFrom(VALIDATION_LABEL, target.validation_mode)],
                      ].map(([term, value]) => (
                        <div key={term} className="flex gap-1">
                          <dt>{term}</dt>
                          <dd className="font-medium text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* The fields themselves — the custom store, one block per switched-on record type */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Fields defined here</h2>
          {enabledTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No HR record type is switched on to receive custom fields.
            </p>
          ) : (
            <RecordsProvider config={recordsConfig}>
              {enabledTargets.map((target) => (
                <HrTokenFields
                  key={target.target_token}
                  token={target.target_token}
                  label={labelFor(target.target_token)}
                />
              ))}
            </RecordsProvider>
          )}
        </section>

        {/* The rules that are not negotiable */}
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">
            The rules these fields live by
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                A field&apos;s key, type and reference target cannot be changed once
                anything has been stored in it.
              </span>{" "}
              Changing a type under existing values silently reinterprets every one of
              them — a date that becomes text, a number that becomes a list. The way to
              change your mind is to archive the field and create a new one.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Deleting a field never deletes what people put in it.
              </span>{" "}
              The values stay, orphaned and reported, and are purged only by an explicit
              action that is logged. An HR record is evidence; a field definition is
              scaffolding around it.
            </li>
            <li>
              <span className="font-medium text-foreground">
                A restricted field is never given to an AI.
              </span>{" "}
              That is not a setting on the field — it is a ceiling on the tier. The AI
              exposure control governs standard and confidential fields only.
            </li>
            <li>
              <span className="font-medium text-foreground">
                An archived field keeps its values readable and refuses new writes.
              </span>{" "}
              Nothing that was already recorded disappears from a record because
              somebody tidied the registry.
            </li>
            <li>
              Custom fields appear in a &quot;More&quot; section at the bottom of the tab
              they belong to, never mixed in with the built-in fields — so reordering a
              custom field can never move a legally required one.
            </li>
          </ul>
        </section>
      </div>
    </HrSettingsShell>
  );
}

/** One record type's custom fields, through the custom store's own doors. */
function HrTokenFields({ token, label }: { token: string; label: string }) {
  const fields = useEntityFields(token);
  const mutation = useEntityFieldMutation();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const retire = async (field: Field) => {
    const done = await mutation.retire({ field_id: field.id });
    setConfirming(null);
    if (done) fields.reload();
  };

  return (
    <div className="rounded-lg border border-border bg-card" data-hr-field-token={token}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {!adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add a custom field
          </Button>
        ) : null}
      </header>
      {adding ? (
        <div className="border-b border-border p-3">
          <FieldEditor
            entityToken={token}
            tableLabel={label}
            onSaved={() => {
              setAdding(false);
              fields.reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}
      {fields.error ? <RefusalLine error={fields.error} className="p-3" /> : null}
      {mutation.error ? <RefusalLine error={mutation.error} className="p-3" /> : null}
      {fields.loading && !fields.data ? (
        <p className="p-3 text-sm text-muted-foreground">Loading…</p>
      ) : (fields.data ?? []).length === 0 && !fields.error ? (
        <p className="p-3 text-sm text-muted-foreground">No custom fields on {label} yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {(fields.data ?? []).map((field) => (
            <li key={field.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{field.label}</span>
                <span className="text-muted-foreground">
                  {fieldTypeLabel(field)}
                  {field.required ? " · required" : ""}
                  {field.sensitivity ? ` · ${sensitivityWords(field.sensitivity)}` : ""}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(field.id)}>
                Archive
              </Button>
              <ConfirmDelete
                open={confirming === field.id}
                onOpenChange={(open) => setConfirming(open ? field.id : null)}
                title={`Archive ${field.label}?`}
                cost="Its values stay readable on every record, and nobody can add new ones."
                confirmLabel="Archive field"
                busy={mutation.saving}
                onConfirm={() => retire(field)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
