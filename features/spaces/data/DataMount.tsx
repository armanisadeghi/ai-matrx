"use client";

// features/spaces/data/DataMount.tsx — the record store a data block reads through.
//
// Sample: the agency installed into memory (`templatePreview`), read-only. Live: the app's own records
// config (the /data page's: session-carrying client, the person as actor, realtime, the app's host
// ports), bound to the TABLE's own organization — never the active one (access ladder).

import { RecordsMount } from "@ai-matrx/records-ui";
import type { RecordsConfig } from "@ai-matrx/records";
import type { ReactNode } from "react";

import { recordsUiHostFor, useAppRecordsConfig, useRecordsDataSource, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";

import { usePublishedRows } from "./published-rows";
import { agencySample } from "./sources";

/**
 * The sample's live port. The in-memory world lives in this tab only: nothing outside it can change
 * a row, and a change made here re-reads through the store already. So the port is truthful with
 * nothing to forward — the sample's lists ARE live, and say so.
 */
const SAMPLE_REALTIME: NonNullable<RecordsConfig["realtime"]> = { subscribeRecords: () => () => undefined };

let sampleConfig: RecordsConfig | null = null;
function sampleRecordsConfig(): RecordsConfig {
  sampleConfig ??= { ...agencySample().config, realtime: SAMPLE_REALTIME };
  return sampleConfig;
}

function SampleMount({ children }: { children: ReactNode }) {
  return (
    <RecordsMount config={sampleRecordsConfig()} letTheStoreDecideRights>
      {children}
    </RecordsMount>
  );
}

/** A real table: the app's one records config (session, the person as actor, realtime) bound to
 *  the table's own organization, with the app's host ports — the same mount /data uses. */
function LiveBound({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const config = useAppRecordsConfig(organizationId);
  const ports = useRecordsUiPorts({ organizationId, dataSource: config.dataSource });
  return (
    // org-filter: write-target a data block reads and writes as the table's own organization
    <RecordsMount letTheStoreDecideRights config={config} host={recordsUiHostFor({ ports, merged: true })}>
      {children}
    </RecordsMount>
  );
}

function LiveMount({ tableId, children, held }: { tableId: string; children: ReactNode; held: (line: string, retry?: () => void) => ReactNode }) {
  const opens = useObjectOrganization(useRecordsDataSource(), tableId);
  if (opens.state === "found") return <LiveBound organizationId={opens.organizationId}>{children}</LiveBound>;
  if (opens.state === "resolving") return <>{held("")}</>;
  return <>{held(opens.state === "unavailable" ? "This database can’t be opened right now." : "This database isn’t shared with you.", opens.retry)}</>;
}

export function DataMount({
  sample,
  tableId,
  children,
  held,
}: {
  sample: boolean;
  tableId: string;
  children: ReactNode;
  held: (line: string, retry?: () => void) => ReactNode;
}) {
  const published = usePublishedRows();
  if (sample) return <SampleMount>{children}</SampleMount>;
  // A page on the web: the rows the page itself published (content.space_public_view), never a live read.
  if (published) {
    const config = published.get(tableId);
    if (!config) return <>{held("This database isn’t published with this page.")}</>;
    return (
      <RecordsMount config={config} letTheStoreDecideRights>
        {children}
      </RecordsMount>
    );
  }
  return (
    <LiveMount tableId={tableId} held={held}>
      {children}
    </LiveMount>
  );
}
