// features/unified-data/connect-database/service.ts — LANE VISION-REACH, wave 3.
//
// The three server calls behind "Connect a database" (aidream `/external-databases`, router
// aidream/api/routers/external_databases.py). The server tests the connection, lists what it may
// read, keeps the connection string SEALED in the organization's vault, and lands one picked
// table as a Synced custom table through `custom.table_sync`. 🚨 The connection string goes UP in
// the body of `inspect` / `connect` (the person typed it) and NOTHING sent back ever carries it;
// never put it in a URL, a log line, an error or any state that outlives the form.

import { postJson } from "@/lib/python-client";

export interface OutsideColumn {
  name: string;
  type: string;
}

export interface OutsideTable {
  schema_name: string;
  name: string;
  columns: OutsideColumn[];
  key: string[];
  row_estimate: number;
}

export interface InspectAnswer {
  label: string;
  tables: OutsideTable[];
}

export interface SyncAnswer {
  table_id: string;
  created: boolean;
  rows_inserted: number;
  rows_updated: number;
  rows_archived: number;
  /** Rows archived here that the outside table still has: Refresh brought them back. */
  rows_restored: number;
  /** Live rows in the synced table after this sync. */
  rows_total: number;
  /** What the sync could not reconcile, one sentence each. */
  warnings: string[];
  synced_at: string;
}

/** Test a connection string and list the tables it may read. The server stores nothing. */
export async function inspectDatabase(organizationId: string, connectionString: string): Promise<InspectAnswer> {
  const { data } = await postJson<InspectAnswer>(
    "/external-databases/inspect",
    { organization_id: organizationId, connection_string: connectionString },
    { organizationId },
  );
  return data;
}

/** One outside table becomes a Synced table in this organization. */
export async function connectTable(
  organizationId: string,
  connectionString: string,
  table: { schema_name: string; name: string },
): Promise<SyncAnswer> {
  const { data } = await postJson<SyncAnswer>(
    "/external-databases/tables",
    {
      organization_id: organizationId,
      connection_string: connectionString,
      schema_name: table.schema_name,
      table_name: table.name,
    },
    { organizationId },
  );
  return data;
}

/** Re-read the outside table behind a Synced table. */
export async function refreshSyncedTable(organizationId: string, tableId: string): Promise<SyncAnswer> {
  const { data } = await postJson<SyncAnswer>(
    "/external-databases/refresh",
    { organization_id: organizationId, table_id: tableId },
    { organizationId },
  );
  return data;
}

/** The provider word `custom.table_sync` keys an outside-database table on. */
export const OUTSIDE_DATABASE_PROVIDER = "postgres";

/** Where the Connect a database page lives. */
export const CONNECT_DATABASE_PATH = "/data/connect";
