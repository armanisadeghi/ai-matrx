"use client";

// features/war-room/components/all/WarRoomThreadsTable.tsx
//
// The "Threads" view on /war-room/all — every thread the user owns (assigned
// to a room or orphaned) in the canonical MatrxDataTable, with sorting,
// per-column filters, and search. Row "Open" navigates into the parent room
// (or mints a new room for an orphan via the existing thunk).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSelector } from "@reduxjs/toolkit";
import { ExternalLink, Loader2, MessagesSquare, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { openOrphanThreadInNewRoom } from "@/features/war-room/redux/thunks";
import { containerKey } from "@/features/war-room/types";
import { threadDisplayTitle } from "@/features/war-room/utils/threadDisplayTitle";
import { formatRelativeTime, formatAbsoluteDate } from "@/utils/datetime";
import { keyFieldsAiVariant } from "@/features/marketing/lib/copy-payloads";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  threadCopyLines,
  threadEntityRef,
  useWarRoomThreadMenuSection,
  type WarRoomThreadMenuRow,
} from "@/features/war-room/lib/thread-actions";

const NO_ROOM_LABEL = "No room";

interface ThreadTableRow {
  id: string;
  title: string;
  roomId: string | null;
  roomTitle: string;
  anchorType: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function activeEntityIdOf(
  rows: { entity_type: string; entity_id: string; is_active: boolean | null }[],
  entityType: string,
): string | null {
  const active = rows.find(
    (r) => r.entity_type === entityType && r.is_active === true,
  );
  if (active) return active.entity_id;
  return rows.find((r) => r.entity_type === entityType)?.entity_id ?? null;
}

const ANCHOR_LABELS: Record<string, string> = {
  canvas: "Canvas",
  task: "Task",
  project: "Project",
};

const selectThreadTableRows = createSelector(
  [
    (s: RootState) => s.warRoom.sessionIds,
    (s: RootState) => s.warRoom.sessionsById,
    (s: RootState) => s.warRoom.threadIdsByRoom,
    (s: RootState) => s.warRoom.orphanThreadIds,
    (s: RootState) => s.warRoom.threadsById,
    (s: RootState) => s.warRoom.threadUserStateById,
    (s: RootState) => s.warRoom.assignmentsByContainer,
    (s: RootState) => s.tasks.entities,
  ],
  (
    sessionIds,
    sessionsById,
    threadIdsByRoom,
    orphanThreadIds,
    threadsById,
    userStateById,
    byContainer,
    taskEntities,
  ): ThreadTableRow[] => {
    const rows: ThreadTableRow[] = [];
    const push = (threadId: string, roomId: string | null) => {
      const thread = threadsById[threadId];
      if (!thread) return;
      const bucket = byContainer[containerKey("thread", threadId)] ?? [];
      const taskId = activeEntityIdOf(bucket, "task");
      const taskTitle = taskId ? taskEntities[taskId]?.title : undefined;
      rows.push({
        id: threadId,
        title: threadDisplayTitle(thread, taskTitle),
        roomId,
        roomTitle: roomId
          ? sessionsById[roomId]?.title?.trim() || "Untitled War Room"
          : NO_ROOM_LABEL,
        anchorType: ANCHOR_LABELS[thread.anchor_type] ?? thread.anchor_type,
        isPinned: userStateById[threadId]?.isPinned ?? false,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      });
    };
    for (const sessionId of sessionIds) {
      for (const threadId of threadIdsByRoom[sessionId] ?? []) {
        push(threadId, sessionId);
      }
    }
    for (const threadId of orphanThreadIds) {
      push(threadId, null);
    }
    // Newest activity first — the table's initial order before any user sort.
    rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return rows;
  },
);

function OpenThreadAction({ row }: { row: ThreadTableRow }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = opening || pending;

  async function handleOpen() {
    if (busy) return;
    if (row.roomId) {
      startTransition(() =>
        router.push(`/war-room/${row.roomId}?thread=${row.id}`),
      );
      return;
    }
    setOpening(true);
    const roomId = await dispatch(openOrphanThreadInNewRoom(row.id));
    setOpening(false);
    if (roomId) {
      startTransition(() =>
        router.push(`/war-room/${roomId}?thread=${row.id}`),
      );
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() => void handleOpen()}
      className="h-7 gap-1.5 px-2 text-xs"
      title={row.roomId ? "Open in its War Room" : "Open in a new War Room"}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <ExternalLink className="size-3.5" />
      )}
      Open
    </Button>
  );
}

export function WarRoomThreadsTable({ isLoading }: { isLoading: boolean }) {
  const rows = useAppSelector(selectThreadTableRows);

  // ONE MENU PER PANE: the whole table gets a single v3 wrapper and the
  // right-clicked ROW is resolved on open, so every row's Attach To, Copy as
  // and Export target that row instead of the pane.
  //
  // State, not a ref: the shared section's labels depend on the row ("Unpin",
  // the room list minus the thread's own room), so it has to re-render before
  // the menu content mounts.
  const [menuRow, setMenuRow] = useState<WarRoomThreadMenuRow | null>(null);
  const threadSection = useWarRoomThreadMenuSection(menuRow);

  const columns = useMemo<MatrxColumnDef<ThreadTableRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Thread",
        // THE DOOR LAW: the thread's room is right here in the row and the
        // "Open" button 20 lines below already navigates to exactly this URL —
        // the title was the one place it wasn't reachable by cmd-click, middle
        // click or keyboard. An ORPHAN thread has no room yet (Open mints one),
        // so it gets no href rather than a link that 404s.
        href: (row) =>
          row.roomId
            ? `/war-room/${row.roomId}?thread=${encodeURIComponent(row.id)}`
            : undefined,
        cell: (row) => (
          <span className="flex items-center gap-1.5 min-w-0">
            {row.isPinned ? (
              <Pin className="size-3 shrink-0 text-primary" />
            ) : null}
            <span className="truncate font-medium text-foreground">
              {row.title}
            </span>
          </span>
        ),
        filter: "text",
      },
      {
        accessorKey: "roomTitle",
        header: "War Room",
        filter: "select",
        // The parent room is a relationship this row RESOLVED (it holds the
        // id and the title) — so it is a door, not a label.
        href: (row) => (row.roomId ? `/war-room/${row.roomId}` : undefined),
        cell: (row) =>
          row.roomId ? (
            <span className="truncate">{row.roomTitle}</span>
          ) : (
            <span className="text-muted-foreground">{NO_ROOM_LABEL}</span>
          ),
      },
      {
        accessorKey: "anchorType",
        header: "Type",
        filter: "select",
        width: 110,
      },
      {
        accessorKey: "isPinned",
        header: "Pinned",
        filter: "boolean",
        width: 90,
        cell: (row) => (row.isPinned ? "Yes" : "No"),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        filter: false,
        width: 120,
        cell: (row) => (
          <span title={formatAbsoluteDate(row.updatedAt)}>
            {formatRelativeTime(row.updatedAt)}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        filter: false,
        width: 120,
        cell: (row) => (
          <span title={formatAbsoluteDate(row.createdAt)}>
            {formatRelativeTime(row.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    // No `surfaceName`: the registered `matrx-user/war-room` surface declares
    // 17 alwaysAvailable ROOM values (room_id, threads, view_mode, …) that a
    // cross-room table has no room to emit. Naming it here would make the
    // value-mapping guard scream and hand bound agents empty values — the
    // menu is honestly surface-less until a cross-room surface exists.
    <NonEditableContextMenu
      // War Room stamps every launch it makes as "agent-runner" (see
      // `redux/thunks.ts`); this menu is attributed the same way rather than
      // inventing a token the generated SourceFeature list doesn't carry.
      sourceFeature="agent-runner"
      contentSource={{ type: "raw" }}
      contextData={{ content: "" }}
      resolveContextOnOpen={(target) => {
        const id = target
          ?.closest("[data-row-id]")
          ?.getAttribute("data-row-id");
        const row = (id && rows.find((r) => r.id === id)) || null;
        setMenuRow(row);
        if (!row) return { [CONTEXT_MENU_ENTITY_KEY]: null };
        return {
          [CONTEXT_MENU_ENTITY_KEY]: threadEntityRef(row),
          content: threadCopyLines(row),
        };
      }}
      extraSections={[threadSection]}
    >
      {/* `asChild` needs a real DOM element to hang the handler on. */}
      <div className="flex h-full min-h-0 flex-col">
        <MatrxDataTable<ThreadTableRow>
          urlState={{ id: "war-room-threads" }}
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          toolbar={{
            search: true,
            searchPlaceholder: "Search threads…",
          }}
          copy={{
            label: "Thread",
            listLabel: "All threads",
            location: "AI Matrx — War Rooms — Threads view (/war-room/all)",
            rowKind: "war-room-thread",
            listKind: "war-room-threads",
            rowDescription: "One thread row from the cross-room Threads view.",
            listDescription:
              "Every thread the user owns across all War Rooms, including orphans, as the Threads view renders them.",
            humanRow: (row) =>
              `${row.title} — ${row.roomTitle} · ${row.anchorType} · updated ${formatRelativeTime(row.updatedAt)}`,
            rowAttributes: (row) => ({
              id: row.id,
              room: row.roomTitle,
              anchor_type: row.anchorType,
              pinned: row.isPinned,
            }),
            // The list KPIs, so a copied view is never interpretable only by
            // re-counting rows the agent may not have received.
            listAttributes: (visible, all) => ({
              visible_rows: visible.length,
              total_rows: all.length,
              orphan_rows: all.filter((r) => !r.roomId).length,
              pinned_rows: all.filter((r) => r.isPinned).length,
            }),
            // Medium data: a "key fields" projection of the visible rows beside
            // the automatic never-lossy Everything dump. Shared builder — never
            // a local fork.
            aiVariants: (visible) => [
              keyFieldsAiVariant<ThreadTableRow>({
                kind: "war-room-threads",
                location: "AI Matrx — War Rooms — Threads view (/war-room/all)",
                description:
                  "The visible thread rows projected to title, room and anchor.",
                visible,
                project: (row) => ({
                  id: row.id,
                  title: row.title,
                  room: row.roomTitle,
                  anchor_type: row.anchorType,
                  pinned: row.isPinned,
                  updated_at: row.updatedAt,
                }),
              }),
            ],
          }}
          rowActions={(row) => <OpenThreadAction row={row} />}
          emptyState={{
            icon: <MessagesSquare className="size-7" />,
            title: "No threads yet",
            description:
              "Threads appear here as you create them inside your War Rooms.",
          }}
          pageSize={25}
        />
      </div>
    </NonEditableContextMenu>
  );
}
