"use client";

/**
 * THE ONE RECORDS-UI HOST BINDING (one-grid merge, step 7).
 *
 * Every place in this app that draws a record-store table — the /data table page, the table
 * window, the dataset overlay, a chat table artifact, the quick data sheet, the tables picker,
 * the chat "view table" modal — hands `@ai-matrx/records-ui` the SAME ports: links, toasts, files,
 * members, share, the record chat, agent row actions, "ask an agent", number click-through, the
 * app's file window for an attachment cell (`pickFiles`), and (merged grid) the agent grid context,
 * Clean HTML, the icon picker and markdown cells (`renderText` slot "cell"). Before this module the
 * list lived inline in `app/(core)/data/[tableId]/page.tsx` and nothing else had it; a second
 * copy would drift within a week. `recordsUiHostFor` is the list, written once; the hook
 * `useRecordsUiPorts` builds the ports that need React (the launcher, the organization list).
 *
 * Rights are NOT decided here: every mount passes `letTheStoreDecideRights`, and the store's own
 * doors answer who sees and changes what.
 */

import { RecordBodyEditor } from "@/features/data-tables/records-ui-host/RecordBodyEditor";
import { RecordBodySpace } from "@/features/spaces/embed/RecordBodySpace";
import { DynamicIcon } from "@ai-matrx/icons";
import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  personActor,
  recordsDataSource,
  tableRightsAt,
  type AgentBuildAsk,
  type OpenRecordsAsk,
  type RecordsUiHost,
} from "@ai-matrx/records-ui";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { recordPageHref } from "@/features/unified-data/table-page/recordPageHref";
import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { APPLETS_PORT } from "@/features/agent-apps/embed/appletsPort";
import { RecordScopedChat } from "@/features/unified-data/record-chat/RecordScopedChat";
import { RecordRunsSection } from "@/features/workflow-runtime/simple-builder/RecordRunsSection";
import { LinkedRecordsSection } from "@/features/scopes/components/linked-records/LinkedRecordsSection";
import { useOpenLinkRecordSheet } from "@/features/overlays/openers/linkRecordSheet";
import { getOrganizationMembers } from "@/features/organizations/service";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { runRowAgentAction, type RowAgentActionTarget } from "@/features/unified-data/row-agent-action/rowAgentAction";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { RECORDS_FILES } from "@/features/unified-data/recordsFiles";
import { RECORDS_TEXT } from "@/features/unified-data/recordsCleanText";
import { RECORDS_REFERENCES } from "@/features/unified-data/recordsReferences";
import { RECORDS_AGENT_PORTS } from "@/features/data-tables/records-ui-host/recordsAgentPorts";
import {
  type GridContextChannel,
} from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { createRecordsRealtimePort } from "@ai-matrx/records/realtime";
import type { DataBuildOrAskOffer } from "@ai-matrx/agents/generated/provision-offers";


type DataSource = ReturnType<typeof recordsDataSource>;

/** The ports a host builds with React (see `useRecordsUiPorts`). */
export interface RecordsUiPorts {
  members: NonNullable<RecordsUiHost["members"]>;
  onAskForOne: (ask: AgentBuildAsk) => void;
  openRecords: (ask: OpenRecordsAsk) => void;
  runAgentAction: (target: RowAgentActionTarget) => void;
  /** The table's organization — the record chat files its conversation there. */
  organizationId: string | null;
  /** "Link a record…" on a store record: the one record picker, pointed at that record. */
  linkRecord?: (target: { tableId: string; recordId: string; name: string }) => void;
}

export interface RecordsUiHostArgs {
  ports: RecordsUiPorts;
  /** Draw the merged grid (records-ui `grid: "merged"`); off = the classic grid. */
  merged: boolean;
  /** The merged grid's agent channel (`useGridContextChannel`); bound only when `merged`. */
  gridContext?: GridContextChannel | null;
  /**
   * The host's own narrower answer (records-ui `rights` port): a PREVIEW is read-only whatever the
   * person holds. Left out, the store's own doors decide (`letTheStoreDecideRights`).
   */
  rights?: RecordsUiHost["rights"];
}

/**
 * THE HOST, WRITTEN ONCE. Pure: the same inputs give the same port list on every surface.
 */
function recordSectionsPort(organizationId: string | null): {
  recordSections?: (target: { tableId: string; recordId: string }) => ReactNode;
} {
  return {
    recordSections: ({ recordId }) => (
      <>
        {organizationId ? (
          <RecordRunsSection key={recordId} organizationId={organizationId} recordId={recordId} />
        ) : null}
        {/* Everything linked to this record, both ways — its own references and every
            "Link a record…" made from the other end (W1.4). */}
        <LinkedRecordsSection key={`linked:${recordId}`} token="record" id={recordId} title="" />
      </>
    ),
  };
}

/**
 * THE RELATION-ICON BINDING, written once (records-ui ≥0.101.33 `renderIcon`): a stored icon NAME
 * ("Briefcase") drawn by the platform's one icon resolver. Exported so a mount with no ports (an
 * in-memory preview) wears the same icons without a copy.
 */
export const RECORDS_ICONS: Pick<RecordsUiHost, "renderIcon"> = {
  renderIcon: (name: string) => <DynamicIcon name={name} size={14} fallbackIcon="FileText" />,
};

export function recordsUiHostFor({ ports, merged, gridContext, rights }: RecordsUiHostArgs): RecordsUiHost {
  return {
    Link,
    density: "condensed",
    // records-ui 0.87+: the merged grid's control layer; left out = classic.
    ...(merged ? { grid: "merged" as const } : {}),
    // The merged grid's side-chat context (6l), Clean HTML (6m), row-action icons (6j) and
    // markdown cells through the one rich-text renderer (renderText "cell").
    ...(merged && gridContext ? { onGridContext: gridContext.onGridContext } : {}),
    ...(merged ? RECORDS_TEXT : {}),
    // The page's toasts (the where-it-lives chip's "now lives in …" outlives a re-mount).
    notify: RECORDS_NOTIFY,
    // A value kept as a file opens at /files/f/<id>; the export reads its whole text; an
    // attachment cell attaches through the app's one file window (pickFiles).
    ...RECORDS_FILES,
    // Every reference is a chip that opens what it names (EntityRef; a record at /o/<id>), and a
    // value that names its own shape draws through the kind system (lane REFERENCE-CARRY).
    ...RECORDS_REFERENCES,
    // …in the TABLE's organization: the file window lists only its files and uploads there.
    pickFiles: (ask) => RECORDS_FILES.pickFiles({ ...ask, organizationId: ports.organizationId }),
    members: ports.members,
    onAskForOne: ports.onAskForOne,
    openRecords: ports.openRecords,
    runAgentAction: ports.runAgentAction,
    share: recordStoreShare,
    // Applets on a page built from tables (records-ui `applets`, v7 APPS-ON-DATA item 3): the person's
    // agent apps, drawn by the one app renderer. Spread: a records-ui build before the port ignores it.
    ...APPLETS_PORT,
    // EVERY RECORD OPENS ITS OWN PAGE (no-dead-ends): the grid's ⤢, a card's Open / new tab / Copy
    // link and the peek's Open all reach /data/<table>/r/<record> (records-ui `hrefForRecord`).
    hrefForRecord: ({ table, recordId }) => recordPageHref(table.id, recordId),
    // The platform's ONE chat column bound to the record (AGT-N-9) — never a second chat.
    chat: (ctx) => <RecordScopedChat ctx={ctx} organizationId={ports.organizationId} />,
    // A record page's body, in the platform's one rich editor (records-ui ≥0.96 `editRichText`).
    editRichText: (props) => <RecordBodyEditor {...props} />,
    // A row with a body Space (record → document, label row_body, from the Notion importer) shows it in the
    // Spaces editor (records-ui ≥0.101.22 `renderRecordBody`); every other row keeps its own body (fallback).
    // Spread as its own object: a records-ui build before the port ignores the key.
    ...{
      renderRecordBody: (args) => (
        <RecordBodySpace tableId={args.tableId} recordId={args.recordId} record={args.record} readOnly={args.readOnly} fallback={args.fallback} />
      ),
    },
    // A relation cell wears its record's (else its table's) icon; the store keeps a picked icon as a NAME
    // ("Briefcase"), drawn here by the platform's one icon resolver (records-ui ≥0.101.33 `renderIcon`).
    // Spread as its own object: a records-ui build before the port ignores the key.
    ...RECORDS_ICONS,
    // "What ran on this record" in the record rail (records-ui `recordSections`, lane 11 wave 2).
    // Spread as its own object: a records-ui build before the port ignores the key.
    ...recordSectionsPort(ports.organizationId),
    // "Link a record…" on a card's menu and a grid row's (records-ui `linkRecord`): the ONE picker
    // (LinkRecordOverlay), the same anchored_to edge every other record menu writes. Spread as its
    // own object: a records-ui build before the port ignores the key.
    ...(ports.linkRecord ? { linkRecord: ports.linkRecord } : {}),
    // The older Sheet's AI pieces (Sheet retirement): "Help with this…" in the formula box runs
    // data.formula_writing, and the settings panel is the matrx-user/table-settings surface.
    ...RECORDS_AGENT_PORTS,
    ...(rights ? { rights } : {}),
  };
}

/**
 * A PREVIEW'S RIGHTS (merged-grid review 2, fix lane F item 3): read and copy, nothing else — the
 * tables picker previews a table, it does not edit it. Every "may not" names the way in.
 */
const PREVIEW_SAYS = "This is a preview. Open the table to change it.";
export const PREVIEW_RIGHTS: NonNullable<RecordsUiHost["rights"]> = () => ({
  ...tableRightsAt("viewer"),
  reason: PREVIEW_SAYS,
  why: () => PREVIEW_SAYS,
});

/**
 * The React-built ports, for a table living in `organizationId`.
 *
 * `readsAsMember`: false when the table was given to this person by an outside share (the page
 * knows from the share door); a roster is then not hers to read. Left out, membership is read
 * from her own organization list, which answers the same question.
 */
/**
 * WHAT A BUILD-ASK OPENS THE ASSISTANT WITH (BREAKER-2 B2-22). The sentence the screen offered is
 * what the person would say, so it waits in the box for her to send or change — never sent for her
 * (autoRun is off); it is her message, not machine data. Each context value carries the words its
 * chip shows — the chips read `records_ta…`; the server unwraps `{content, label}`.
 */
export function buildAskRuntime(ask: AgentBuildAsk): {
  userInput: string;
  context: Record<string, { content: string; label: string }>;
} {
  return {
    userInput: ask.suggestion,
    context: {
      records_table_id: { content: ask.tableId, label: "This table" },
      records_wanted: { content: ask.kind, label: WANTED_WORDS[ask.kind] ?? "What to build" },
      records_suggested_wording: { content: ask.suggestion, label: "The ask" },
    },
  };
}

/** What each build-ask is about, in a chip's words (`AgentBuildAsk.kind`). */
const WANTED_WORDS: Record<AgentBuildAsk["kind"], string> = {
  form: "A form",
  booking: "A booking page",
  portal: "A portal",
  digest: "A summary email",
  column: "A column",
};

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
  const openLinkRecordSheet = useOpenLinkRecordSheet();
  const linkRecord = useCallback(
    (target: { tableId: string; recordId: string; name: string }) => {
      openLinkRecordSheet({
        target: {
          token: "record",
          id: target.recordId,
          title: target.name,
          tableId: target.tableId,
          ...(organizationId ? { organizationId } : {}),
        },
      });
    },
    [openLinkRecordSheet, organizationId],
  );

  /** WHO IS IN THIS ORGANIZATION — the package's `members` port (FLD-11). */
  const members = useCallback(async () => {
    // A person given this table from outside has no roster to read (403 on every open).
    if (!readsAsMember || !organizationId) return [];
    // While her list loads, answer empty; the port's identity changes when it lands.
    if (myOrganizationsLoading || !myOrganizations.some((o) => o.id === organizationId)) return [];
    // OPEN (RC-B12 r13): records-ui's `host.members()` consumers do not handle a
    // rejection yet, so a failed roster read answers [] here WITH a log; the honest
    // failure state belongs in @ai-matrx/records-ui's people picker.
    const roster = await getOrganizationMembers(organizationId).catch((err: unknown) => {
      console.error("[records members port] roster read failed:", err);
      return [];
    });
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
      router.push(`/data/${ask.tableId}?${next.toString()}`);
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
        surfaceKey: `data:${ask.tableId}`,
        organizationId,
        sourceFeature: "udt",
        config: { displayMode: "floating-chat", autoRun: false, allowChat: true },
        runtime: {
          ...buildAskRuntime(ask),
          // Who is asking — a mapped-only offered value of Provision
          // `data.build_or_ask`: it rides `variables` (never context), so the
          // mandate door delivers it only where a binding's consumption map
          // names it. Omitted when no one is signed in.
          ...(userId
            ? { variables: { asker_user_id: userId } satisfies Partial<DataBuildOrAskOffer> }
            : {}),
        },
      });
    },
    [launchMandate, organizationId, userId],
  );

  /** A TABLE'S AGENT BUTTON (`runAgentAction`): the same `data.row_action` job the Sheet starts. */
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

  return { members, onAskForOne, openRecords, runAgentAction, organizationId, linkRecord };
}

/**
 * One data seam for the whole app, carrying the person's session (the browser client is itself a
 * singleton). Shared so the ports a mount builds and its `config` always hold the SAME seam.
 */
let sharedDataSource: DataSource | null = null;
export function useRecordsDataSource(): DataSource {
  return useMemo(() => (sharedDataSource ??= recordsDataSource(createClient())), []);
}


/**
 * ONE PORT PER ORGANIZATION, SO THE SAME ORGANIZATION IS THE SAME PORT (lane PANEL-REMOUNT,
 * 2026-09-24). `<RecordsProvider>` rebuilds its records client when `config.realtime` changes
 * identity, and the /data pages build `config` on every render of the page, so a fresh port
 * per call re-read the whole grid on any `?panels=` / `?view=` write. The package's port
 * (`@ai-matrx/records/realtime`) binds the AMBIENT manager `providers/RealtimeHost.tsx` mounts.
 */
const realtimePortsByOrganization = new Map<string, ReturnType<typeof createRecordsRealtimePort>>();

function realtimePortFor(organizationId: string): ReturnType<typeof createRecordsRealtimePort> {
  let port = realtimePortsByOrganization.get(organizationId);
  if (!port) {
    port = createRecordsRealtimePort();
    realtimePortsByOrganization.set(organizationId, port);
  }
  return port;
}

/** The `config` every records-ui mount takes (`RecordsMount` / `RecordsProvider`). */
export interface AppRecordsConfig {
  dataSource: DataSource;
  actor: ReturnType<typeof personActor>;
  organizationId: string | null;
  /** Live updates for the organization's tables; absent only while there is no organization. */
  realtime?: ReturnType<typeof createRecordsRealtimePort>;
}

/**
 * THE ONE RECORDS CONFIG. Every records-ui mount in the app takes its `config` from here:
 * the data seam, the signed-in person as actor, the organization, and the live-updates port
 * (one per organization, so the same organization is the same port). Never hand-build one.
 */
export function useAppRecordsConfig(organizationId: string | null): AppRecordsConfig {
  const dataSource = useRecordsDataSource();
  const userId = useAppSelector(selectUserId);
  return useMemo(
    () => ({
      dataSource,
      actor: personActor(userId),
      organizationId,
      ...(organizationId ? { realtime: realtimePortFor(organizationId) } : {}),
    }),
    [dataSource, userId, organizationId],
  );
}
