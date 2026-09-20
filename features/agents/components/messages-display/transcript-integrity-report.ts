/**
 * Transcript integrity report — the admin-only "what is actually on this
 * screen and why" snapshot for one conversation.
 *
 * Built from the live Redux store plus the slice's transcript journal, it
 * answers, without a debugger, every question the "my message doesn't show"
 * class has ever needed: which rows the spine holds (role / position /
 * status / client status / content shape), which display groups those rows
 * became, which of them the visibility window actually rendered, what the
 * last request did, and every structural write the slice performed on the
 * way there. `anomalies` names the known failure signatures outright so a
 * pasted report can be read in seconds.
 *
 * Bodies are never included: ids are shortened, text is length + an 80-char
 * preview. Safe to paste into a chat with an agent.
 */

import type { RootState } from "@/lib/redux/store";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectLatestRequestId,
  selectStreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  readTranscriptJournal,
  shortId,
  type TranscriptJournalEvent,
} from "@/features/agents/redux/execution-system/messages/transcript-journal";
import {
  applyDisplayGroupWindow,
  buildDisplayEntries,
  groupDisplayEntries,
  type DisplayGroup,
} from "./display-groups";
import { describeUserContentShape } from "./user/AgentUserMessage";

export interface TranscriptRowReport {
  id: string;
  role: string;
  position: number;
  status: string;
  clientStatus: string | null;
  source: string;
  createdAt: string;
  streamRequestId: string;
  textLength: number;
  preview: string;
  partTypes: string[];
  userContentShape: ReturnType<typeof describeUserContentShape>;
  authoredBy: string | null;
  visibleToUser: boolean;
  deleted: boolean;
  /** For user rows: would `AgentUserMessage` draw a bubble for this row? */
  displayable: boolean | null;
}

export interface TranscriptGroupReport {
  key: string;
  kind: DisplayGroup["kind"];
  messageIds: string[];
  rendered: boolean;
}

export interface TranscriptIntegrityReport {
  generatedAt: string;
  conversationId: string;
  surfaceKey: string;
  pathname: string;
  spine: {
    loadedRows: number;
    oldestPosition: number | null;
    hasMoreOlder: boolean;
    visibleGroupLimitRedux: number | null;
    visibleGroupLimitEffective: number | null;
    hydrationFailure: string | null;
    expectedNextPosition: number;
  };
  request: {
    latestRequestId: string;
    streamPhase: string;
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    timelineEntries: number | null;
    errorMessage: string | null;
  };
  rows: TranscriptRowReport[];
  groups: TranscriptGroupReport[];
  anomalies: string[];
  journal: TranscriptJournalEvent[];
}

const PREVIEW_CHARS = 80;
const PENDING_STALE_MS = 20_000;

function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
}

function rowReport(record: MessageRecord): TranscriptRowReport {
  const text = extractFlatText(record);
  const parts = Array.isArray(record.content)
    ? (record.content as Array<{ type?: string }>)
    : [];
  const partTypes = parts.map((p) => p?.type ?? "?");
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : null;
  const authoredBy =
    typeof metadata?.authored_by === "string" ? metadata.authored_by : null;
  const hasAttachment = partTypes.some((t) => t !== "text");
  const hasContextSnapshot =
    Array.isArray(metadata?.context_snapshot) &&
    (metadata.context_snapshot as unknown[]).length > 0;
  const displayable =
    record.role === "user"
      ? text.trim().length > 0 || hasAttachment || hasContextSnapshot
      : null;
  return {
    id: shortId(record.id),
    role: record.role,
    position: record.position,
    status: record.status,
    clientStatus: record._clientStatus ?? null,
    source: record.source,
    createdAt: record.createdAt,
    streamRequestId: shortId(record._streamRequestId),
    textLength: text.length,
    preview: previewOf(text),
    partTypes,
    userContentShape: describeUserContentShape(record.userContent),
    authoredBy,
    visibleToUser: record.isVisibleToUser,
    deleted: !!record.deletedAt,
    displayable,
  };
}

export function buildTranscriptIntegrityReport(
  state: RootState,
  args: {
    conversationId: string;
    surfaceKey: string;
    pathname: string;
    /** The limit the column actually applied (local override wins over Redux). */
    effectiveVisibleGroupLimit: number | null;
    now?: Date;
  },
): TranscriptIntegrityReport {
  const { conversationId, surfaceKey, pathname } = args;
  const now = args.now ?? new Date();
  const entry = state.messages.byConversationId[conversationId];
  const records: MessageRecord[] = entry
    ? entry.orderedIds
        .map((id) => entry.byId[id])
        .filter((r): r is MessageRecord => !!r)
    : [];

  const phase = selectStreamPhase(conversationId)(state);
  const latestRequestId = selectLatestRequestId(conversationId)(state);
  const activeRequest = latestRequestId
    ? state.activeRequests?.byRequestId[latestRequestId]
    : undefined;
  const isActive =
    phase === "connecting" ||
    phase === "pre_token" ||
    phase === "reasoning" ||
    phase === "text_streaming" ||
    phase === "interstitial" ||
    phase === "error";

  const allGroups = groupDisplayEntries(
    buildDisplayEntries({
      messages: records,
      isActive,
      latestRequestId,
      isErrorPhase: phase === "error",
    }),
  );
  const effectiveLimit =
    args.effectiveVisibleGroupLimit ?? entry?.visibleGroupLimit ?? null;
  const renderedKeys = new Set(
    applyDisplayGroupWindow(allGroups, effectiveLimit).map((g) => g.key),
  );
  const groups: TranscriptGroupReport[] = allGroups.map((g) => ({
    key: g.key.length > 40 ? `${g.key.slice(0, 40)}…` : g.key,
    kind: g.kind,
    messageIds:
      g.kind === "assistant"
        ? g.members.map((m) => shortId(m.messageId ?? m.requestId ?? ""))
        : [shortId(g.messageId ?? "")],
    rendered: renderedKeys.has(g.key),
  }));

  const rows = records.map(rowReport);
  const journal = readTranscriptJournal(conversationId);
  const anomalies: string[] = [];

  // 1. A user row sorted above the oldest loaded history row: the position
  //    guess was smaller than the window's floor, so the bubble sits at the
  //    very top of the transcript, out of view.
  if (entry && entry.oldestPosition !== null) {
    for (const r of records) {
      if (
        r.role === "user" &&
        r._clientStatus === "pending" &&
        r.position < entry.oldestPosition
      ) {
        anomalies.push(
          `user row ${shortId(r.id)} is at position ${r.position}, below the oldest loaded position ${entry.oldestPosition} — it renders above the history, not under the composer`,
        );
      }
    }
  }

  // 2. A pending optimistic row after the request settled: the server never
  //    promoted it (no record_reserved for the user row reached this client).
  const requestSettled =
    !!activeRequest &&
    (activeRequest.status === "complete" ||
      activeRequest.status === "error" ||
      activeRequest.status === "timeout" ||
      activeRequest.status === "cancelled");
  for (const r of records) {
    if (r.role !== "user" || r._clientStatus !== "pending") continue;
    const ageMs = now.getTime() - new Date(r.createdAt).getTime();
    if (requestSettled || ageMs > PENDING_STALE_MS) {
      anomalies.push(
        `user row ${shortId(r.id)} is still a client-pending optimistic row after ${Math.round(ageMs / 1000)}s (request ${requestSettled ? "settled" : "open"}) — the server never acknowledged it with record_reserved`,
      );
    }
  }

  // 3. The user group exists but the visibility window cut it off.
  for (const g of groups) {
    if (g.kind === "user" && !g.rendered) {
      anomalies.push(
        `user group ${g.messageIds[0]} is hidden by the visible-group window (limit ${effectiveLimit}, ${allGroups.length} groups total)`,
      );
    }
  }

  // 4. A user row the bubble cannot draw and that no host authored.
  for (const r of rows) {
    if (r.role === "user" && r.displayable === false && r.authoredBy !== "host") {
      anomalies.push(
        `user row ${r.id} (pos ${r.position}) has nothing displayable: user_content=${r.userContentShape}, content parts=[${r.partTypes.join(",")}], text ${r.textLength} chars`,
      );
    }
  }

  // 5. Spine out of order — the ordering invariant broke somewhere.
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1];
    const b = records[i];
    if (a.position > b.position) {
      anomalies.push(
        `spine out of order: ${shortId(a.id)} (pos ${a.position}) precedes ${shortId(b.id)} (pos ${b.position})`,
      );
      break;
    }
  }

  // 6. The latest turn has an answer but no user row directly above it.
  if (activeRequest) {
    const lastGroups = allGroups.slice(-2);
    const hasAssistant = lastGroups.some(
      (g) => g.kind === "assistant" || g.kind === "assistant-failed",
    );
    const hasUser = lastGroups.some((g) => g.kind === "user");
    if (hasAssistant && !hasUser && allGroups.length > 0) {
      anomalies.push(
        "the latest answer has no user group immediately above it — the sent message is missing from the last two groups",
      );
    }
  }

  // 7. Journal-derived signatures.
  for (const ev of journal) {
    if (ev.kind === "promote_missing_old_id") {
      anomalies.push(
        `promote arrived for ${String(ev.detail.oldId)} → ${String(ev.detail.newId)} but the optimistic row was already gone (${ev.at})`,
      );
    }
    if (ev.kind === "hydrate" && Number(ev.detail.droppedRows) > 0) {
      anomalies.push(
        `a DB hydrate at ${ev.at} dropped ${String(ev.detail.droppedRows)} row(s) that were on screen`,
      );
    }
    if (ev.kind === "user_bubble_rendered_empty") {
      anomalies.push(
        `user bubble ${String(ev.detail.id)} rendered its empty-state notice at ${ev.at}`,
      );
    }
  }

  if (entry?.hydrationFailure) {
    anomalies.push(`hydration failure: ${entry.hydrationFailure}`);
  }

  return {
    generatedAt: now.toISOString(),
    conversationId,
    surfaceKey,
    pathname,
    spine: {
      loadedRows: records.length,
      oldestPosition: entry?.oldestPosition ?? null,
      hasMoreOlder: entry?.hasMoreOlder ?? false,
      visibleGroupLimitRedux: entry?.visibleGroupLimit ?? null,
      visibleGroupLimitEffective: effectiveLimit,
      hydrationFailure: entry?.hydrationFailure ?? null,
      expectedNextPosition: records.reduce(
        (max, r) => Math.max(max, r.position + 1),
        0,
      ),
    },
    request: {
      latestRequestId: shortId(latestRequestId),
      streamPhase: phase,
      status: activeRequest?.status ?? null,
      startedAt: activeRequest?.startedAt ?? null,
      completedAt: activeRequest?.completedAt ?? null,
      timelineEntries: activeRequest?.timeline?.length ?? null,
      errorMessage: activeRequest?.error?.message ?? null,
    },
    rows,
    groups,
    anomalies,
    journal,
  };
}

/** The exact text the copy control puts on the clipboard. */
export function formatTranscriptIntegrityReport(
  report: TranscriptIntegrityReport,
): string {
  const header = [
    "AI Matrx transcript integrity report",
    `conversation ${report.conversationId} · ${report.surfaceKey} · ${report.pathname}`,
    `generated ${report.generatedAt}`,
    report.anomalies.length === 0
      ? "anomalies: none detected"
      : `anomalies (${report.anomalies.length}):\n${report.anomalies.map((a) => `  - ${a}`).join("\n")}`,
    "",
  ].join("\n");
  return `${header}${JSON.stringify(report, null, 2)}`;
}
