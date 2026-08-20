// features/crm/import/connectors/service.ts
//
// Client half of the API contact connectors — provider-generic. The server
// adapter (aidream services/crm/contact_connectors) reads and normalizes the
// SOURCE; everything after `parsedDataFromConnector` is the same wizard spine
// every file import uses: guessMapping → planImport (dedup preview) →
// commitImport (governed resolve-batch). Google People is connector #1;
// Microsoft Graph and the rest add a server registry entry and reuse ALL of
// this file untouched.

import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { ImportConnectorMeta, ParsedImportData } from "../types";

const CONNECTORS_PATH = "/crm/import/connectors";
const CONNECTOR_FETCH_PATH = "/crm/import/connectors/{provider_key}/fetch";
const CONNECTOR_CURSOR_PATH = "/crm/import/connectors/{provider_key}/cursor";

export interface ConnectorConnection {
  connectionId: string;
  accountEmail: string | null;
  accountName: string | null;
  status: string;
  scopeGranted: boolean;
  hasSyncCursor: boolean;
  lastSyncedAt: string | null;
}

export interface ImportConnector {
  providerKey: string;
  displayName: string;
  provider: string;
  platformSlug: string;
  requiredScopes: string[];
  connections: ConnectorConnection[];
}

/** Every registered connector with this user's usable connections. */
export async function listImportConnectors(
  orgId: string,
): Promise<ImportConnector[]> {
  const { data } = await apiGet(CONNECTORS_PATH, {
    query: { organization_id: orgId },
  });
  return data.map((item) => ({
    providerKey: item.provider_key,
    displayName: item.display_name,
    provider: item.provider,
    platformSlug: item.platform_slug,
    requiredScopes: item.required_scopes ?? [],
    connections: (item.connections ?? []).map((connection) => ({
      connectionId: connection.connection_id,
      accountEmail: connection.account_email ?? null,
      accountName: connection.account_name ?? null,
      status: connection.status ?? "",
      scopeGranted: connection.scope_granted ?? false,
      hasSyncCursor: connection.has_sync_cursor ?? false,
      lastSyncedAt: connection.last_synced_at ?? null,
    })),
  }));
}

export interface ConnectorFetchArgs {
  providerKey: string;
  connectionId: string;
  orgId: string;
  /** 'auto' = incremental when a cursor exists; 'full' = re-read everything. */
  mode?: "auto" | "full";
}

/**
 * Read the source and shape it as `ParsedImportData` so the wizard's existing
 * map → dry-run → commit steps work on it unchanged. The headers are the
 * vCard/Google header set `guessMapping` already auto-maps; extra channel
 * values ride the `:::` separator `normalizeMany` already splits.
 */
export async function fetchConnectorContacts(
  args: ConnectorFetchArgs,
): Promise<ParsedImportData> {
  const { data } = await apiPost(
    buildPath(CONNECTOR_FETCH_PATH, { provider_key: args.providerKey }),
    {
      connection_id: args.connectionId,
      organization_id: args.orgId,
      mode: args.mode ?? "auto",
    },
  );

  const headers = [
    "First name",
    "Last name",
    "Full name",
    "Job title",
    "Company",
    "Email",
    "Email 2",
    "Phone",
    "Phone 2",
    "Website",
  ];
  const records = data.records ?? [];
  const rows = records.map((record) => ({
    "First name": record.first_name ?? "",
    "Last name": record.last_name ?? "",
    "Full name": record.display_name ?? "",
    "Job title": record.job_title ?? "",
    Company: record.company ?? "",
    Email: record.emails?.[0] ?? "",
    "Email 2": (record.emails ?? []).slice(1).join(" ::: "),
    Phone: record.phones?.[0] ?? "",
    "Phone 2": (record.phones ?? []).slice(1).join(" ::: "),
    Website: (record.urls ?? []).join(" ::: "),
  }));
  const rowMeta = records.map((record) => ({
    externalId: record.external_id || undefined,
  }));

  const deleted = data.deleted_external_ids ?? [];
  const parseWarnings = [
    ...(data.warnings ?? []),
    ...(deleted.length > 0
      ? [
          `${deleted.length} contact${deleted.length === 1 ? " was" : "s were"} deleted in ${data.source_label} since the last sync. Imports never delete CRM records — review those contacts in your CRM if they should go.`,
        ]
      : []),
    ...(data.incremental
      ? [
          `Incremental sync: only contacts added or changed in ${data.source_label} since the last import are listed.`,
        ]
      : []),
  ].slice(0, 5);

  const connector: ImportConnectorMeta = {
    providerKey: data.provider_key,
    platformSlug: data.platform_slug,
    connectionId: args.connectionId,
    accountEmail: data.account_email ?? undefined,
    syncToken: data.sync_token ?? undefined,
    incremental: data.incremental ?? false,
    deletedExternalIds: deleted,
  };

  return {
    headers,
    rows,
    parseWarnings,
    format: "connector",
    sourceLabel: data.account_email
      ? `${data.source_label} (${data.account_email})`
      : data.source_label,
    connector,
    rowMeta,
  };
}

/**
 * Advance the incremental-sync cursor — called by the wizard only AFTER a
 * fully successful commit. Skipped on any failure so the next run re-reads
 * the same delta; the resolver makes the re-read idempotent.
 */
export async function persistConnectorCursor(args: {
  providerKey: string;
  connectionId: string;
  orgId: string;
  syncToken: string;
  counts?: Record<string, number>;
}): Promise<void> {
  await apiPost(
    buildPath(CONNECTOR_CURSOR_PATH, { provider_key: args.providerKey }),
    {
      connection_id: args.connectionId,
      organization_id: args.orgId,
      sync_token: args.syncToken,
      counts: args.counts ?? {},
    },
  );
}
