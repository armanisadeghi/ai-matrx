"use client";

/**
 * Custom data on a board: a Table and one Record, from the record store (`@ai-matrx/records`,
 * the `custom` schema — the `/data` system; the older `/data` is not built on).
 *
 * - **Table.** The body IS `/data/<table>`'s table page: `useUnifiedTable` + `UnifiedTableBody`
 *   (`features/unified-data/table-page/UnifiedTable.tsx`), the one component the route renders —
 *   `TablePage` inside `RecordsMount`, reading as the table's own organization, with the same
 *   ports, realtime, Sheet layout, merged-grid knob, table-menu extras and the
 *   `matrx-user/data-tables` surface (`RecordStoreTableSurface`, mounted by the body). Only the
 *   route's chrome is left out (back, title switcher, page capture, the address). Share and the
 *   table's one menu stay, in the table's own toolbar row.
 * - **Record.** The body is records-ui's `Peek` under the same mount and gates, with the
 *   `matrx-user/data-tables` surface scoped to that one row (`RecordStoreRecordSurface`).
 *
 * Picking a table lists every table the person can see across ALL her organizations (the data
 * home's own list, with the shell's organization filter defaulting to All organizations — never
 * the active organization); "New table" on the board is the package's making controls
 * (`makingOnly`, filed in the active organization), whose create answers the new table's id.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Database, Rows3 } from "lucide-react";
import { Peek, RecordsMount, TablesHome, recordsDataSource, rowName } from "@ai-matrx/records-ui";
import { useRecords, useTable } from "@ai-matrx/records/react";

import { Button } from "@/components/ui/button";
import { readOf } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { countsByOrganization, inOrganization, useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { CustomDataRecordsScope } from "@/features/agents/components/variables-management/custom-data/CustomDataRecordsScope";
import { recordsUiHostFor, useAppRecordsConfig, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { NO_ADDRESS, UnifiedTableBody, useUnifiedTable } from "@/features/unified-data/table-page/UnifiedTable";
import { RecordStoreRecordSurface } from "@/features/unified-data/grid-agent-context/RecordStoreRecordSurface";
import { DATA_TABLES_SURFACE } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";

import type { DataHomeTableRow } from "@/features/unified-data/hub/doors";
import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";
import { titleToAdopt } from "./feature-items.logic";
import { RecordList } from "./feature-items";
import { tablesToPick } from "@/features/unified-data/hub/tablePicking";
import { dataHomeTables, findTables } from "./record-finders";

const TABLE_ENTITY = "data-table";

function tableSource(id: string | null): NodeSource {
  return { kind: "entity", entity: TABLE_ENTITY, id };
}

function tableIdOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === TABLE_ENTITY ? source.id : null;
}

/**
 * The record store for the organization the person works in — ONLY for MAKING a table (a write:
 * a new table is filed in the active organization). Never for choosing one: the list of tables a
 * person can pick is every table across all her organizations (`TablesAcrossOrganizations`), and
 * a table or record once picked reads as its OWN organization (`useUnifiedTable`). Law:
 * common-docs/policies/access-ladder.md.
 */
function WorkingOrganizationRecords({ children }: { children: ReactNode }) {
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target a new table is filed in the organization the person works in
  const active = useOrganizationRequired();
  const recordsConfig = useAppRecordsConfig(active.organizationId ?? null);
  const ports = useRecordsUiPorts({ organizationId: active.organizationId, dataSource: recordsConfig.dataSource });
  if (active.organizationState !== "ready" || !active.organizationId) {
    return <OrganizationContextNotice state={active.organizationState} what="Data records" />;
  }
  return (
    <RecordsMount // org-filter: write-target the record store only for MAKING a table; choosing one reads across every organization
      letTheStoreDecideRights
      config={recordsConfig}
      host={recordsUiHostFor({ ports, merged: false })}
    >
      {children}
    </RecordsMount>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

/**
 * Every table the person can see, across ALL her organizations — the data home's own list
 * (`useTablesEverywhere`), one flat list with each row naming its organization, and the shell's
 * organization filter (All organizations on every open, never remembered, never the active org).
 */
function TablesAcrossOrganizations({
  onChoose,
  onCancel,
}: {
  onChoose: (row: DataHomeTableRow) => void;
  onCancel: () => void;
}) {
  const tables = useTablesEverywhere();
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const rows = tablesToPick(inOrganization(tables.rows, orgFilter));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <EntityOrgFilter
          orgId={orgFilter}
          onChange={setOrgFilter}
          counts={{ byKind: {}, narrow: { all: countsByOrganization(tables.rows) } }}
          countsLoading={tables.loading}
        />
      </div>
      <RecordList
        rows={rows}
        read={readOf(
          { loading: tables.loading, error: tables.error },
          { what: "your tables", onRetry: tables.reload },
        )}
        rowKey={(t) => t.table_id}
        rowText={(t) => `${t.table_name} ${t.organization_name}`}
        onChoose={onChoose}
        onCancel={onCancel}
        emptyState={<>No tables yet. Make one with New table.</>}
        renderRow={(t) => (
          <>
            <span className="min-w-0 flex-1 truncate">{t.table_name}</span>
            <span className="shrink-0 truncate text-xs text-muted-foreground">{t.organization_name}</span>
          </>
        )}
      />
    </div>
  );
}

function TablePicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <TablesAcrossOrganizations
        onCancel={onCancel}
        onChoose={(t) => onPick([{ title: t.table_name, source: tableSource(t.table_id) }])}
      />
    </div>
  );
}

/** A new table: the package's own making controls; the table it makes becomes this tile. */
function TableDraftBody({ onSource }: ItemBodyProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <WorkingOrganizationRecords>
        <TablesHome makingOnly onOpenTable={(tableId: string) => onSource(tableSource(tableId))} />
      </WorkingOrganizationRecords>
    </div>
  );
}

/** Adopt the table's own name as the tile title (inside the mount: it reads through its client). */
function AdoptTableName({ tableId, source, title, onSource }: { tableId: string } & Pick<ItemBodyProps, "source" | "title" | "onSource">) {
  const table = useTable(tableId);
  const next = titleToAdopt(title, table.data?.name);
  useEffect(() => {
    if (next) onSource(source, next);
  }, [next, source, onSource]);
  return null;
}

export function TableRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const mount = useUnifiedTable({ tableId: id, address: NO_ADDRESS });
  return (
    <div className={mount.mountsTheTable ? "h-full min-h-0 overflow-y-auto px-2 pb-2 pt-1" : "h-full min-h-0 overflow-y-auto p-4"}>
      <UnifiedTableBody
        mount={mount}
        before={<AdoptTableName tableId={id} source={source} title={title} onSource={onSource} />}
      />
    </div>
  );
}

function TableItemBody(props: ItemBodyProps) {
  const id = tableIdOf(props.source);
  return id ? <TableRecordBody key={id} id={id} {...props} /> : <TableDraftBody {...props} />;
}

// ─── Record ──────────────────────────────────────────────────────────────────

function recordIdsOf(source: NodeSource): { tableId: string; recordId: string } | null {
  return source.kind === "record" ? { tableId: source.tableId, recordId: source.recordId } : null;
}

/** The chosen table's records, read through the store's own page read and named its own way. */
function RecordChoices({
  tableId,
  onPick,
  onBack,
}: {
  tableId: string;
  onPick: PickerProps["onPick"];
  onBack: () => void;
}) {
  const table = useTable(tableId);
  const records = useRecords(tableId);
  const titleField = table.data?.title_field ?? null;
  const tableName = table.data?.name?.trim() || "this table";
  return (
    <RecordList
      rows={records.data?.rows ?? []}
      read={readOf(
        { loading: records.loading && !records.data, error: records.error },
        { what: `the records in ${tableName}`, onRetry: records.reload },
      )}
      rowKey={(r) => r.id}
      rowText={(r) => rowName(r, titleField)}
      onChoose={(r) =>
        onPick([{ title: rowName(r, titleField), source: { kind: "record", tableId, recordId: r.id } }])
      }
      onCancel={onBack}
      emptyState={<>{tableName} has no records yet. Bring the table in and add one there.</>}
      renderRow={(r) => <span className="min-w-0 flex-1 truncate">{rowName(r, titleField)}</span>}
    />
  );
}

function RecordPicker({ onPick, onCancel }: PickerProps) {
  const [table, setTable] = useState<{ id: string; organizationId: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {table ? "Choose the record." : "Choose the table the record is in."}
      </p>
      <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
        {table ? (
          // The record store, bound to the organization the TABLE lives in — never the active one.
          <CustomDataRecordsScope tableId={table.id} organizationId={table.organizationId}>
            <RecordChoices tableId={table.id} onPick={onPick} onBack={() => setTable(null)} />
          </CustomDataRecordsScope>
        ) : (
          <TablesAcrossOrganizations
            onCancel={onCancel}
            onChoose={(t) => setTable({ id: t.table_id, organizationId: t.organization_id })}
          />
        )}
      </div>
    </div>
  );
}

function RecordBody({ source }: ItemBodyProps) {
  const ids = recordIdsOf(source);
  const mount = useUnifiedTable({ tableId: ids?.tableId ?? "", address: NO_ADDRESS });
  if (!ids) return null;
  return (
    <div className="h-full min-h-0 overflow-y-auto p-2">
      <UnifiedTableBody
        mount={mount}
        content={
          <RecordStoreRecordSurface tableId={ids.tableId} recordId={ids.recordId}>
            <Peek tableId={ids.tableId} recordId={ids.recordId} />
          </RecordStoreRecordSurface>
        }
      />
    </div>
  );
}

export const DATA_ITEMS: readonly BoardItemType[] = [
  {
    key: TABLE_ENTITY,
    surface: { name: DATA_TABLES_SURFACE },
    // A data table is not a registered entity type, so it has no thread of its own: the tile's
    // comments go on the board (the door says so).
    comments: null,
    label: "Table",
    kindLabel: "data table",
    icon: Database,
    group: "work",
    accent: "emerald",
    status: { none: "Its load state lives in the grid's own mount, which an idle tile does not run." },
    defaultSize: { w: 960, h: 620 },
    matches: (s) => s.kind === "entity" && s.entity === TABLE_ENTITY,
    Body: TableItemBody,
    // Wakes with its grid, scroll, selection and open cell intact: the gates keep their answers
    // (lib/kept-answer), so a wake never drops to "Opening the table…" (lane REMOUNT-SAFETY).
    sleeps: true,
    startNew: { label: "New table", create: () => ({ title: "New table", source: tableSource(null) }) },
    bringIn: { label: "Table", Picker: TablePicker },
    // Tables are not in the search projection: the table picker's own list, matched on the name.
    record: {
      place: (id, title) => ({ title: title?.trim() || "Table", source: tableSource(id) }),
      find: (query, limit) =>
        findTables(TABLE_ENTITY, query, limit, () => dataHomeTables(recordsDataSource(createClient()), null)),
    },
    href: (s) => {
      const id = tableIdOf(s);
      return id ? `/data/${id}` : null;
    },
  },
  {
    key: "record",
    surface: { name: DATA_TABLES_SURFACE },
    comments: (s) => (s.kind === "record" ? { token: "record", id: s.recordId } : null),
    label: "Record",
    kindLabel: "data record",
    icon: Rows3,
    group: "work",
    accent: "emerald",
    status: { none: "A record has no lifecycle of its own; its table holds it." },
    defaultSize: { w: 560, h: 640 },
    matches: (s) => s.kind === "record",
    Body: RecordBody,
    sleeps: true,
    bringIn: { label: "Record", Picker: RecordPicker },
    href: (s) => {
      const ids = recordIdsOf(s);
      return ids ? `/data/${ids.tableId}?record=${ids.recordId}` : null;
    },
  },
];

