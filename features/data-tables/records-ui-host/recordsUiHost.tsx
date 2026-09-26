"use client";

/**
 * THE ONE RECORDS-UI HOST BINDING (one-grid merge, step 7).
 *
 * Every place in this app that draws a record-store table — the /data-v2 table page, the table
 * window, the dataset overlay, a chat table artifact, the quick data sheet, the tables picker,
 * the chat "view table" modal — hands `@ai-matrx/records-ui` the SAME ports: links, toasts, files,
 * members, share, the record chat, agent row actions, "ask an agent", number click-through, and
 * (merged grid) the agent grid context, Clean HTML and the icon picker. Before this module the
 * list lived inline in `app/(core)/data-v2/[tableId]/page.tsx` and nothing else had it; a second
 * copy would drift within a week. `recordsUiHostFor` is the list, written once; the hook
 * `useRecordsUiPorts` builds the ports that need React (the launcher, the organization list).
 *
 * Rights are NOT decided here: every mount passes `letTheStoreDecideRights`, and the store's own
 * doors answer who sees and changes what.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RecordsMount,
  TablePage,
  personActor,
  recordsDataSource,
  type AgentBuildAsk,
  type HostLayout,
  type OpenRecordsAsk,
  type RecordsUiHost,
} from "@ai-matrx/records-ui";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import { getOrganizationMembers } from "@/features/organizations/service";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { runRowAgentAction, type RowAgentActionTarget } from "@/features/unified-data/row-agent-action/rowAgentAction";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { RECORDS_FILES } from "@/features/unified-data/recordsFiles";
import { RECORDS_TEXT } from "@/features/unified-data/recordsCleanText";
import {
  RecordStoreTableSurface,
  useGridContextChannel,
  type GridContextChannel,
} from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";

import { useMergedGridKnob } from "./mergedGridKnob";

type DataSource = ReturnType<typeof recordsDataSource>;

/** The ports a host builds with React (see `useRecordsUiPorts`). */
export interface RecordsUiPorts {
  members: NonNullable<RecordsUiHost["members"]>;
  onAskForOne: (ask: AgentBuildAsk) => void;
  openRecords: (ask: OpenRecordsAsk) => void;
  runAgentAction: (target: RowAgentActionTarget) => void;
  /** The table's organization — the record chat files its conversation there. */
  organizationId: string | null;
}

export interface RecordsUiHostArgs {
  ports: RecordsUiPorts;
  /** Draw the merged grid (records-ui `grid: "merged"`); off = the classic grid. */
  merged: boolean;
  /** The merged grid's agent channel (`useGridContextChannel`); bound only when `merged`. */
  gridContext?: GridContextChannel | null;
  /** Layouts the host draws beside the package's own (the /data-v2 page's Sheet). */
  layouts?: HostLayout[];
}

/**
 * THE HOST, WRITTEN ONCE. Pure: the same inputs give the same port list on every surface.
 */
export function recordsUiHostFor({ ports, merged, gridContext, layouts }: RecordsUiHostArgs): RecordsUiHost {
  return {
    Link,
    density: "condensed",
    // records-ui 0.87+: the merged grid's control layer; left out = classic.
    ...(merged ? { grid: "merged" as const } : {}),
    // The merged grid's side-chat context (6l), Clean HTML (6m) and row-action icons (6j).
    ...(merged && gridContext ? { onGridContext: gridContext.onGridContext } : {}),
    ...(merged ? RECORDS_TEXT : {}),
    // The page's toasts (the where-it-lives chip's "now lives in …" outlives a re-mount).
    notify: RECORDS_NOTIFY,
    // A value kept as a file opens at /files/f/<id>; the export reads its whole text.
    ...RECORDS_FILES,
    members: ports.members,
    onAskForOne: ports.onAskForOne,
    openRecords: ports.openRecords,
    runAgentAction: ports.runAgentAction,
    share: recordStoreShare,
    // The platform's ONE chat column bound to the record (AGT-N-9) — never a second chat.
    chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={ports.organizationId} />,
    ...(layouts && layouts.length > 0 ? { layouts } : {}),
  };
}

/**
 * The React-built ports, for a table living in `organizationId`.
 *
 * `readsAsMember`: false when the table was given to this person by an outside share (the page
 * knows from the share door); a roster is then not hers to read. Left out, membership is read
 * from her own organization list, which answers the same question.
 */
export function useRecordsUiPorts({
  organizationId,
  dataSource,
  readsAsMember = true,
}: {
  organizationId: string | null;
  dataSource: DataSource;
  readsAsMember?: boolean;
}): RecordsUiPorts {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const { organizations: myOrganizations, loading: myOrganizationsLoading } = useUserOrganizations();
  const { launchMandate } = useAgentLauncher();

  /** WHO IS IN THIS ORGANIZATION — the package's `members` port (FLD-11). */
  const members = useCallback(async () => {
    // A person given this table from outside has no roster to read (403 on every open).
    if (!readsAsMember || !organizationId) return [];
    // While her list loads, answer empty; the port's identity changes when it lands.
    if (myOrganizationsLoading || !myOrganizations.some((o) => o.id === organizationId)) return [];
    const roster = await getOrganizationMembers(organizationId);
    return roster.map((member) => ({
      userId: member.userId,
      name: member.user?.displayName ?? null,
      email: member.user?.email ?? null,
      avatarUrl: member.user?.avatarUrl ?? null,
    }));
  }, [organizationId, readsAsMember, myOrganizations, myOrganizationsLoading]);

  /** A NUMBER ON THE CANVAS CLICKS THROUGH to exactly the records it counted (lane DRILL). */
  const openRecords = useCallback(
    (ask: OpenRecordsAsk) => {
      const BUCKETS = /_(day|week|month|quarter|year)$/;
      const groupable = Object.keys(ask.filter ?? {}).filter((key) => !BUCKETS.test(key));
      const next = new URLSearchParams();
      next.set("view", groupable.length > 0 ? "kanban" : "grid");
      const field = groupable[groupable.length - 1];
      if (field) next.set("group", field);
      if (ask.label) next.set("from", ask.label);
      if (ask.filter && Object.keys(ask.filter).length > 0) {
        next.set("filter", JSON.stringify(ask.filter));
      }
      router.push(`/data-v2/${ask.tableId}?${next.toString()}`);
    },
    [router],
  );

  /**
   * ASK AN AGENT FOR A WHOLE FORM, BOOKING PAGE, PORTAL OR DIGEST (`onAskForOne`). Launches the
   * `data.page_guidance` MANDATE, never an agent id; the sentence rides as context, never as
   * `user_input`; a floating chat so the launch opens something (lane AGENT-BUILDS).
   */
  const onAskForOne = useCallback(
    (ask: AgentBuildAsk) => {
      void launchMandate(MANDATE_KEYS.data__page_guidance, {
        surfaceKey: `data-v2:${ask.tableId}`,
        organizationId,
        sourceFeature: "udt",
        config: { displayMode: "floating-chat", autoRun: false, allowChat: true },
        runtime: {
          context: {
            records_table_id: ask.tableId,
            records_wanted: ask.kind,
            records_suggested_wording: ask.suggestion,
          },
        },
      });
    },
    [launchMandate, organizationId],
  );

  /** A TABLE'S AGENT BUTTON (`runAgentAction`): the same `data.row_action` job the older grid starts. */
  const runAgentAction = useCallback(
    (target: RowAgentActionTarget) => {
      if (!organizationId) return;
      void runRowAgentAction({
        target,
        dataSource,
        actor: personActor(userId),
        organizationId,
        actingPersonId: userId ?? null,
        launchMandate,
        onRefused: (title, why) => toast.error(title, { description: why }),
      });
    },
    [dataSource, launchMandate, organizationId, userId],
  );

  return { members, onAskForOne, openRecords, runAgentAction, organizationId };
}

/** One data seam per mount, carrying the person's session. */
export function useRecordsDataSource(): DataSource {
  return useMemo(() => recordsDataSource(createClient()), []);
}

/**
 * A RECORD-STORE TABLE OPENED BY ID OUTSIDE ITS PAGE (the window, the overlay, a chat artifact, the
 * quick sheet, the picker's preview, the chat modal). The table page itself — records-ui
 * `TablePage` — inside the host's own chrome: it fills the box it is given and draws no header of
 * its own (the host already names the table), so the table's Share and menu sit at the end of its
 * one toolbar row. Which grid draws is the `data_tables.merged_grid` Feature Knob, read for the
 * TABLE's organization and this person.
 */
export function RecordStoreTableHost({
  tableId,
  organizationId,
  menuExtras,
  className,
}: {
  tableId: string;
  /** The organization the table lives in (`locateTable`'s answer), never the active one. */
  organizationId: string;
  /** Host actions for the table's one menu ("Open in a window", "Revert to text", …). */
  menuExtras?: Array<{ key: string; label: string; onSelect: () => void }>;
  className?: string;
}): ReactNode {
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const ports = useRecordsUiPorts({ organizationId, dataSource });
  const merged = useMergedGridKnob(organizationId);
  const gridContext = useGridContextChannel();
  const realtime = useMemo(() => createRecordsRealtimePort(organizationId), [organizationId]);
  const host = recordsUiHostFor({ ports, merged, gridContext });
  return (
    <div
      className={className ?? "flex h-full min-h-0 flex-1 flex-col overflow-hidden"}
      data-record-store-table={tableId}
      data-grid={merged ? "merged" : "classic"}
    >
      <RecordsMount
        letTheStoreDecideRights
        config={{ dataSource, actor: personActor(userId), organizationId, realtime }}
        host={host}
      >
        <RecordStoreTableSurface channel={gridContext} enabled={merged}>
          <TablePage tableId={tableId} menuExtras={menuExtras} />
        </RecordStoreTableSurface>
      </RecordsMount>
    </div>
  );
}
