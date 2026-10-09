"use client";

/**
 * THE ONE TABLE PICKER for anything that names a table by reference — the agent builder's
 * "From my data" binding and a Table / Tables agent variable in every run form.
 *
 * The list is the data home's (`useTablesEverywhere` → `custom.data_home_tables`): every table the
 * person can see across ALL her organizations, with the shell's lanes (`EntityScopeTabs`, All on
 * every open) and organization filter (`EntityOrgFilter`, All organizations on every open, never
 * remembered, never the active organization — common-docs/policies/access-ladder.md). Tables only by
 * default (`tablesToPick`); the tables the app keeps are one footer click away.
 *
 * Extracted from `CustomDataBindingPicker` (2026-10-03) so the run form's Table input is the same
 * picker, never a second one. The caller owns the `useTablesEverywhere()` read so a parent that also
 * needs the chosen row (its organization) reads the list once.
 */

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { CreatablePicker, type CreatableOption } from "@/components/ui/creatable-picker";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import {
  DATA_HOME_SCOPES,
  DATA_HOME_SHELL_LANES,
  isDataHomeScope,
  type DataHomeScope,
} from "./dataHomeScope";
import type { DataHomeTableRow } from "./doors";
import { tablesToPick } from "./tablePicking";
import { countsByOrganization, inLane, inOrganization, type TablesEverywhere } from "./useTablesEverywhere";

/** What a table row says beside its name: its organization, and what kind of table it is. */
export function tableHint(row: DataHomeTableRow): string {
  const parts = [row.organization_name];
  if (row.kind && row.kind !== "table") parts.push(row.kind);
  if (row.platform_owned) parts.push("platform table");
  return parts.join(" · ");
}

export interface TableChooserProps {
  /** The caller's `useTablesEverywhere()` answer. */
  tables: TablesEverywhere;
  /** The chosen table id (null = none). */
  value: string | null;
  onSelect: (tableId: string) => void;
  /** Table ids never offered (a multi-table input hides the ones already chosen). */
  exclude?: readonly string[];
  readonly?: boolean;
  /** The row label; null hides it (the run form already labels the variable). */
  label?: string | null;
  placeholder?: string;
  /** Said when the stored table is no longer in the list. */
  missingNote?: string;
}

export function TableChooser({
  tables,
  value,
  onSelect,
  exclude,
  readonly,
  label = "Table",
  placeholder = "Choose a table…",
  missingNote = "Table unavailable — pick another",
}: TableChooserProps) {
  // All organizations (null) and the All lane every time the picker opens — filters on this list only.
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const [lane, setLane] = useState<DataHomeScope>("all");
  // Tables the app keeps for itself (choice lists, ledgers) are out of sight unless asked for.
  const [showPlatformTables, setShowPlatformTables] = useState(false);

  const excluded = new Set(exclude ?? []);
  const offeredByDefault = new Set(tablesToPick(tables.rows, value).map((t) => t.table_id));
  const shown = (t: DataHomeTableRow) =>
    !excluded.has(t.table_id) && (showPlatformTables || offeredByDefault.has(t.table_id));
  const inOrg = inOrganization(tables.rows, orgFilter);
  const allTables = inLane(inOrg, lane);
  const platformOwnedCount = allTables.filter((t) => t.platform_owned && !excluded.has(t.table_id)).length;
  const laneCounts: EntityScopeCounts = {
    byKind: Object.fromEntries(DATA_HOME_SCOPES.map((k) => [k, inLane(inOrg, k).filter(shown).length])),
    narrow: { all: countsByOrganization(inLane(tables.rows, lane).filter(shown)) },
  };
  // ONE FLAT LIST, never grouped by organization: each row names its organization in its hint.
  const tableOptions: CreatableOption[] = allTables.filter(shown).map((t) => ({
    value: t.table_id,
    label: t.table_name,
    hint: tableHint(t),
    keywords: `${t.organization_name} ${t.kind}`,
  }));
  // Looked up in the COMPLETE answer: a table outside the filter still knows its organization.
  const chosenRow = tables.rows.find((t) => t.table_id === value) ?? null;
  const storedTableMissing = Boolean(value) && !tables.loading && !tables.error && chosenRow === null;
  const filteredOut = chosenRow !== null && !allTables.some((t) => t.table_id === chosenRow.table_id);
  const filteredToOne = orgFilter !== null || lane !== "all";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label !== null && (
          <Label className="shrink-0 text-xs font-medium text-foreground">{label}</Label>
        )}
        {/* THE SHELL'S TAB BAR, on the row it filters — never a private one. */}
        <div className="min-w-[12rem] flex-1">
          <EntityScopeTabs
            scope={makeScope(lane)}
            scopes={[...DATA_HOME_SHELL_LANES]}
            counts={laneCounts}
            countsLoading={tables.loading}
            onChange={(next) => setLane(isDataHomeScope(next.kind) ? next.kind : "all")}
          />
        </div>
        {/* THE SHELL'S ORGANIZATION FILTER, on the row it filters (default All organizations). */}
        <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} counts={laneCounts} countsLoading={tables.loading} />
      </div>
      <CreatablePicker
        value={value}
        options={tableOptions}
        onSelect={onSelect}
        placeholder={
          tables.loading
            ? "Loading your tables…"
            : tables.error
              ? "Your tables could not be read"
              : tableOptions.length === 0
                ? filteredToOne
                  ? "No tables here — choose All and All organizations"
                  : "No tables yet — make one in Data"
                : placeholder
        }
        searchPlaceholder="Search your tables…"
        noun="table"
        manageAction={{ label: "Open Data to add or edit tables", href: "/data" }}
        footerActions={
          platformOwnedCount > 0
            ? [
                {
                  label: showPlatformTables
                    ? "Hide the tables the app keeps"
                    : `Show ${platformOwnedCount} ${platformOwnedCount === 1 ? "table" : "tables"} the app keeps`,
                  note: "Choice lists and other tables the app manages for itself.",
                  onSelect: () => setShowPlatformTables((v) => !v),
                },
              ]
            : undefined
        }
        disabled={readonly}
        loading={tables.loading}
        ariaLabel={label ?? "Table"}
      />
      {tables.error && (
        <p className="text-[11px] text-destructive">
          Your tables could not be read: {tables.error.message}{" "}
          <button type="button" className="underline underline-offset-2" onClick={tables.reload}>
            Try again
          </button>
          <ErrorAlchemyMenu error={tables.error.message} />
        </p>
      )}
      {filteredOut && (
        <p className="text-[11px] text-muted-foreground">
          {chosenRow?.table_name ?? "The chosen table"} is hidden by these filters{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setOrgFilter(null);
              setLane("all");
            }}
          >
            Show everything
          </button>
        </p>
      )}
      {storedTableMissing && <p className="text-[11px] text-warning">{missingNote}</p>}
    </div>
  );
}
