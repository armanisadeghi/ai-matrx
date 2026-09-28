"use client";

/**
 * Custom data on a board: a Table and one Record, from the record store (`@ai-matrx/records`,
 * the `custom` schema — the `/data-v2` system; the older `/data` is not built on).
 *
 * - **Table.** The body IS `/data-v2/<table>`'s table page: `useUnifiedTable` + `UnifiedTableBody`
 *   (`features/unified-data/table-page/UnifiedTable.tsx`), the one component the route renders —
 *   `TablePage` inside `RecordsMount`, reading as the table's own organization, with the same
 *   ports, realtime, Sheet layout, merged-grid knob, table-menu extras and the
 *   `matrx-user/data-tables` surface (`RecordStoreTableSurface`, mounted by the body). Only the
 *   route's chrome is left out (back, title switcher, page capture, the address). Share and the
 *   table's one menu stay, in the table's own toolbar row.
 * - **Record.** The body is records-ui's `Peek` under the same mount and gates, with the
 *   `matrx-user/data-tables` surface scoped to that one row (`RecordStoreRecordSurface`).
 *
 * Picking a table is the package's own `TablesHome` (its lists, New table and Start from an
 * example); "New table" on the board is the same package's making controls (`makingOnly`), whose
 * create answers the new table's id.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, Rows3 } from "lucide-react";
import { Peek, RecordsMount, TablesHome, personActor, recordsDataSource, rowName } from "@ai-matrx/records-ui";
import { useRecords, useTable } from "@ai-matrx/records/react";

import { Button } from "@/components/ui/button";
import { readOf } from "@/components/read-state/ReadGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { recordsUiHostFor, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { NO_ADDRESS, UnifiedTableBody, useUnifiedTable } from "@/features/unified-data/table-page/UnifiedTable";
import { RecordStoreRecordSurface } from "@/features/unified-data/grid-agent-context/RecordStoreRecordSurface";
import { DATA_TABLES_SURFACE } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";

import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";
import { titleToAdopt } from "./feature-items.logic";
import { RecordList } from "./feature-items";

const TABLE_ENTITY = "data-table";

function tableSource(id: string | null): NodeSource {
  return { kind: "entity", entity: TABLE_ENTITY, id };
}

function tableIdOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === TABLE_ENTITY ? source.id : null;
}

/**
 * The record store for the organization the person works in — the scope a LIST of tables has
 * (the same one `/data-v2`'s landing reads). A table or record once picked reads as its OWN
 * organization (`useUnifiedTable`); this is only for choosing and making.
 */
function WorkingOrganizationRecords({ children }: { children: ReactNode }) {
  const userId = useAppSelector(selectUserId);
  const active = useOrganizationRequired();
  const campaign = useUnifiedDataCampaign({
    organizationId: active.organizationId,
    organizationState: active.organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  const ports = useRecordsUiPorts({ organizationId: active.organizationId, dataSource });
  if (active.organizationState !== "ready" || !active.organizationId) {
    return <OrganizationContextNotice state={active.organizationState} what="Data records" />;
  }
  if (campaign.state !== "on") return <UnifiedDataSwitchNotice gate={campaign} what="Data records" />;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{
        dataSource,
        actor: personActor(userId),
        organizationId: active.organizationId,
        realtime: createRecordsRealtimePort(active.organizationId),
      }}
      host={recordsUiHostFor({ ports, merged: false })}
    >
      {children}
    </RecordsMount>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

function TablePicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
        <WorkingOrganizationRecords>
          <TablesHome onOpenTable={(tableId: string) => onPick([{ title: "Table", source: tableSource(tableId) }])} />
        </WorkingOrganizationRecords>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
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

function TableRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
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

function TableBody(props: ItemBodyProps) {
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
  const [tableId, setTableId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {tableId ? "Choose the record." : "Choose the table the record is in."}
      </p>
      <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
        <WorkingOrganizationRecords>
          {tableId ? (
            <RecordChoices tableId={tableId} onPick={onPick} onBack={() => setTableId(null)} />
          ) : (
            <TablesHome onOpenTable={(id: string) => setTableId(id)} />
          )}
        </WorkingOrganizationRecords>
      </div>
      {tableId ? null : (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
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
    label: "Table",
    kindLabel: "data table",
    icon: Database,
    group: "work",
    defaultSize: { w: 960, h: 620 },
    matches: (s) => s.kind === "entity" && s.entity === TABLE_ENTITY,
    Body: TableBody,
    startNew: { label: "New table", create: () => ({ title: "New table", source: tableSource(null) }) },
    bringIn: { label: "Table", Picker: TablePicker },
    href: (s) => {
      const id = tableIdOf(s);
      return id ? `/data-v2/${id}` : null;
    },
  },
  {
    key: "record",
    surface: { name: DATA_TABLES_SURFACE },
    label: "Record",
    kindLabel: "data record",
    icon: Rows3,
    group: "work",
    defaultSize: { w: 560, h: 640 },
    matches: (s) => s.kind === "record",
    Body: RecordBody,
    bringIn: { label: "Record", Picker: RecordPicker },
    href: (s) => {
      const ids = recordIdsOf(s);
      return ids ? `/data-v2/${ids.tableId}?record=${ids.recordId}` : null;
    },
  },
];

