"use client";

// features/spaces/data/DataMount.tsx — the record store a data block reads through.
//
// Sample: the agency installed into memory (`templatePreview`), read-only. Live: the app's own records
// config (the /data page's: session-carrying client, the person as actor, realtime, the app's host
// ports), bound to the TABLE's own organization — never the active one (access ladder).

import { RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import type { ReactNode } from "react";

import { recordsUiHostFor, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";

import { agencySample } from "./sources";

let liveSource: ReturnType<typeof recordsDataSource> | null = null;
function liveDataSource() {
  liveSource ??= recordsDataSource(createClient());
  return liveSource;
}

function SampleMount({ children }: { children: ReactNode }) {
  return (
    <RecordsMount config={agencySample().config} letTheStoreDecideRights>
      {children}
    </RecordsMount>
  );
}

function LiveBound({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const userId = useAppSelector(selectUserId);
  const dataSource = liveDataSource();
  const ports = useRecordsUiPorts({ organizationId, dataSource });
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource, actor: personActor(userId), organizationId, realtime: createRecordsRealtimePort(organizationId) }}
      host={recordsUiHostFor({ ports, merged: false })}
    >
      {children}
    </RecordsMount>
  );
}

function LiveMount({ tableId, children, held }: { tableId: string; children: ReactNode; held: (line: string, retry?: () => void) => ReactNode }) {
  const opens = useObjectOrganization(liveDataSource(), tableId);
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
  if (sample) return <SampleMount>{children}</SampleMount>;
  return (
    <LiveMount tableId={tableId} held={held}>
      {children}
    </LiveMount>
  );
}
