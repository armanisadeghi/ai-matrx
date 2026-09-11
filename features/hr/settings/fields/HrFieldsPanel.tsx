// features/hr/settings/fields/HrFieldsPanel.tsx
//
// ROUTE 73 — CUSTOM FIELDS AND CUSTOM TABS.
//
// 🚨 THE AUTHORING SURFACE IS NOT BUILT HERE, ON PURPOSE.
// `CustomFieldsSection`, `CustomFieldInput` and `customFieldColumns` are the PLATFORM
// client kit, owned by lane L14, and they do not exist yet. Building a competing
// editor in `features/hr/` would produce a second renderer for one shape — the exact
// defect the one-component law exists to prevent, and the kind that is never removed
// once two surfaces depend on it.
//
// So this panel does the half that is honest today: it READS
// `platform.custom_field_definition` and `platform.custom_field_target` (both live,
// both in a PostgREST-exposed schema) and renders the registry as it actually is,
// with the governance rules stated in words. The authoring half is a registered,
// countable promise in `lib/coming-soon/registry.ts` naming L14 as its owner.
//
// ── THE GOVERNANCE RULES, STATED ON THE PAGE (SPEC-EMPLOYEES §7.4) ─────────
//  • `field_key`, `field_type` and `reference_target_token` are IMMUTABLE once any
//    value exists. The admin surface offers archive-and-recreate instead — changing
//    a type under stored values silently reinterprets every one of them.
//  • DELETING A DEFINITION NEVER DELETES VALUES. Orphaned keys are reported and
//    purged only by an explicit, logged action.
//  • A `restricted`-tier field is NEVER in an AI Provision. `ai_exposure` governs the
//    other two tiers; restricted is not a setting, it is a ceiling.

"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, ClipboardList, Info, Lock } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";

import { useHrContext } from "../../shared/useHrContext";
import { fetchHrCustomFieldRegistry } from "../service";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrCustomFieldDefinition, HrCustomFieldTarget } from "../types";
import { ArchivedDisclosure } from "@ai-matrx/design-system";

// THE RECORD-TYPE NAMES ARE READ, NOT WRITTEN HERE (DD-097). This file used to
// carry a seven-entry `TOKEN_LABEL` map that matched a seven-entry token list in
// `service.ts`; live `platform.custom_field_target` enables five tokens, three of
// which appeared in neither. `platform.entity_types.label` is the one place a
// token's human name lives, and `fetchHrCustomFieldRegistry` reads it.

export function HrFieldsPanel() {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [definitions, setDefinitions] = useState<HrCustomFieldDefinition[]>([]);
  const [targets, setTargets] = useState<HrCustomFieldTarget[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Derived, never set synchronously in an effect body (react-hooks/set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  // THE ARCHIVED-ITEMS LAW (../common-docs/policies/archived-items.md): this
  // table used to render archived and live definitions mixed together with
  // nothing but a badge to tell them apart. Archived rows are now hidden by
  // default and one click away — the count is the real number.
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrCustomFieldRegistry({ organizationId });
      if (cancelled) return;
      if (result.ok) {
        setDefinitions(result.data.definitions);
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

  // A token with no registry label renders as the token itself — the true
  // identifier, never a prettified guess at what it means.
  const labelFor = (token: string | null) =>
    token ? (labels[token] ?? token) : "—";
  const enabledTargets = targets.filter((row) => row.is_enabled);

  const liveDefinitions = definitions.filter((row) => !row.archived_at);
  const archivedDefinitions = definitions.filter((row) => Boolean(row.archived_at));
  const visibleDefinitions = showArchived ? definitions : liveDefinitions;

  const columns: MatrxColumnDef<HrCustomFieldDefinition>[] = [
    {
      id: "display_name",
      accessorKey: "display_name",
      header: "Field",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            {row.display_name}
          </span>
          <span className="block font-mono text-[0.6875rem] text-muted-foreground">
            {row.field_key}
          </span>
        </span>
      ),
    },
    {
      id: "target",
      accessorFn: (row) => labelFor(row.target_token),
      header: "On which record",
      filter: "select",
    },
    { id: "type", accessorKey: "field_type", header: "Type", filter: "select" },
    {
      id: "sensitivity",
      accessorKey: "sensitivity_tier",
      header: "Sensitivity",
      filter: "select",
      cell: (row) => (
        <Badge
          variant={
            row.sensitivity_tier === "restricted"
              ? "destructive"
              : row.sensitivity_tier === "confidential"
                ? "default"
                : "secondary"
          }
        >
          {row.sensitivity_tier}
        </Badge>
      ),
    },
    {
      id: "ai",
      accessorFn: (row) =>
        row.sensitivity_tier === "restricted" ? "never (restricted)" : row.ai_exposure,
      header: "AI exposure",
      filter: "select",
      cell: (row) => (
        <span className="inline-flex items-center gap-1 text-sm text-foreground">
          {row.sensitivity_tier === "restricted" ? (
            <>
              <Lock className="h-3.5 w-3.5" />
              never
            </>
          ) : (
            <>
              <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
              {row.ai_exposure}
            </>
          )}
        </span>
      ),
    },
    {
      id: "required",
      accessorFn: (row) => (row.is_required ? "Required" : "Optional"),
      header: "Required",
      filter: "select",
      mobileHidden: true,
    },
    {
      id: "state",
      accessorFn: (row) => (row.archived_at ? "Archived" : "Live"),
      header: "State",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.archived_at ? "outline" : "secondary"}>
          {row.archived_at ? "Archived" : "Live"}
        </Badge>
      ),
    },
  ];

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
        {/* Who owns the half that is not here */}
        <section className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Creating and editing fields is built on the platform, not inside HR
            </h2>
            <p className="text-sm text-muted-foreground">
              {enabledTargets.length > 0
                ? `Custom fields are enabled for ${enabledTargets.length} HR ${enabledTargets.length === 1 ? "record type" : "record types"}, listed below; defining a field is not available yet.`
                : "Custom fields are not enabled for any HR record type yet, so there is nothing a field could be added to."}{" "}
              Custom fields are a platform capability shared by every part of the
              product, so one editor serves all of them rather than each area growing
              its own. This page shows what is switched on, the fields that exist here
              and how they are governed; the editor arrives with the platform kit.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => announceComingSoon("hr-settings.custom-field-authoring")}
            >
              Add a custom field
            </Button>
          </div>
        </section>

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
                    <span className="text-muted-foreground">
                      up to {target.max_fields ?? "unlimited"} fields · sensitivity
                      ceiling {target.sensitivity_ceiling} · AI ceiling{" "}
                      {target.ai_exposure_ceiling} · validation{" "}
                      {target.validation_mode}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* The registry itself */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Fields defined here</h2>
            <ArchivedDisclosure
              count={archivedDefinitions.length}
              open={showArchived}
              onOpenChange={setShowArchived}
              label="Archived fields"
              className="w-auto"
            />
          </div>
          <NonEditableContextMenu
            sourceFeature="internal"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={(target) => {
              const id = (target as HTMLElement | null)
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row = (id && visibleDefinitions.find((r) => r.id === id)) || null;
              if (!row) return null;
              return {
                [CONTEXT_MENU_ENTITY_KEY]: {
                  type: "custom_field_definition",
                  id: row.id,
                  title: row.display_name,
                },
                content: [
                  row.display_name,
                  row.field_key,
                  row.field_type,
                  `Sensitivity: ${row.sensitivity_tier}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              };
            }}
          >
          <MatrxDataTable
            data={visibleDefinitions}
            columns={columns}
            getRowId={(row) => row.id}
            pageSize={25}
            urlState={{ id: "hr-custom-fields" }}
            toolbar={{ search: true, searchPlaceholder: "Search custom fields" }}
            emptyState={
              // THE ARCHIVED-ITEMS LAW, honesty half (row F10 class fix,
              // 2026-09-10): the table is handed the LIVE half, so "Nothing
              // has been added" is a claim the live half cannot support. With
              // every definition archived it printed exactly that, one line
              // under this section's own "Archived fields (N)" door.
              !showArchived &&
              liveDefinitions.length === 0 &&
              archivedDefinitions.length > 0
                ? {
                    title: `All ${archivedDefinitions.length} custom ${archivedDefinitions.length === 1 ? "field is" : "fields are"} archived`,
                    description:
                      "Nothing is live on an HR record right now. Open “Archived fields” above to see what was defined.",
                  }
                : {
                    title: "No custom fields on HR records",
                    description:
                      enabledTargets.length > 0
                        ? `Nothing has been added beyond the built-in fields. ${enabledTargets.length === 1 ? "One record type is" : `${enabledTargets.length} record types are`} switched on above and ready for fields; the editor that creates them is not available yet.`
                        : "Nothing has been added beyond the built-in fields, and no HR record type is switched on to receive any.",
                  }
            }
          />
          </NonEditableContextMenu>
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
