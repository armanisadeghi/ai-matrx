"use client";

/**
 * THE WAR ROOM THREAD'S ACTIONS — ONE definition of "what you can do to a
 * thread", shared by every surface that shows a thread row.
 *
 * The cross-room Threads table (`/war-room/all`, `/war-room/admin`) had no
 * right-click menu at all: a user could see every thread they own and could
 * not copy one, attach one to a scope, or move one to a room without first
 * navigating into a room and finding the tile. This module is the fix, and it
 * is deliberately a SHARED definition rather than a menu built inline in the
 * table — the next surface that lists threads spreads
 * `useWarRoomThreadMenuSection(...)` into `extraSections` and gets the same
 * items and the same write paths.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every action delegates to a thunk that
 * already owns it:
 *   • move / also-add to a room → `attachExistingThreadToRoom` (the same thunk
 *     `ThreadOptionsMenu`'s "Move to room" / "Also add to room" dispatch)
 *   • pin / unpin               → `toggleThreadPin`
 *   • open an orphan            → `openOrphanThreadInNewRoom` (mints the room)
 *
 * And no fake items: an action that cannot run for the right-clicked row (no
 * other room to move into, no room to link to yet) is `disabled` with the
 * reason in its description, never rendered as something that silently no-ops.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSelector } from "@reduxjs/toolkit";
import {
  ExternalLink,
  FolderInput,
  FolderPlus,
  Link2,
  Pin,
  PinOff,
} from "lucide-react";

import { toast } from "@/lib/toast";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  attachExistingThreadToRoom,
  openOrphanThreadInNewRoom,
  toggleThreadPin,
} from "@/features/war-room/redux/thunks";

/** The one thing every thread surface can say about a right-clicked row. */
export interface WarRoomThreadMenuRow {
  id: string;
  title: string;
  /** `null` for an orphan thread — it has no room yet. */
  roomId: string | null;
  roomTitle: string;
  anchorType?: string;
  isPinned?: boolean;
  updatedAt?: string;
}

/** The in-app path to a thread, or `null` while it is still an orphan. */
export function threadHref(row: WarRoomThreadMenuRow): string | null {
  if (!row.roomId) return null;
  return `/war-room/${row.roomId}?thread=${encodeURIComponent(row.id)}`;
}

/**
 * THE ROW'S OWN ENTITY — what a delegated table menu hands v3 so **Attach To**
 * targets the thread that was right-clicked, not the pane. Returned under
 * `CONTEXT_MENU_ENTITY_KEY` from `resolveContextOnOpen`.
 *
 * No `resourceType`: a War Room thread is not a registered shareable resource,
 * so Share correctly stays hidden (an absent item, never a fake one).
 */
export function threadEntityRef(
  row: WarRoomThreadMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "thread", id: row.id, title: row.title };
}

/**
 * The readable content the menu acts on — what Copy as / Export / Download as
 * Markdown / the AI actions receive for a right-clicked row. A menu whose
 * content is empty is the "inert menu" defect v3 screams about.
 */
export function threadCopyLines(row: WarRoomThreadMenuRow): string {
  const lines = [
    `Thread: ${row.title}`,
    `War Room: ${row.roomTitle}`,
    ...(row.anchorType ? [`Anchored to: ${row.anchorType}`] : []),
    ...(row.isPinned === undefined
      ? []
      : [`Pinned: ${row.isPinned ? "yes" : "no"}`]),
    ...(row.updatedAt ? [`Updated: ${row.updatedAt}`] : []),
    `Thread id: ${row.id}`,
  ];
  return lines.join("\n");
}

/** Every OTHER room the user owns — the move / also-add targets. */
const selectRoomTargets = createSelector(
  [
    (s: RootState) => s.warRoom.sessionIds,
    (s: RootState) => s.warRoom.sessionsById,
  ],
  (sessionIds, sessionsById) =>
    sessionIds.map((id) => ({
      id,
      title: sessionsById[id]?.title?.trim() || "Untitled War Room",
    })),
);

/**
 * The shared thread section for `extraSections`.
 *
 * `row` is the row the host resolved in `resolveContextOnOpen` — pass the
 * state it stored, not a ref, so the labels ("Unpin", the room list minus the
 * thread's own room) describe the row actually under the cursor.
 */
export function useWarRoomThreadMenuSection(
  row: WarRoomThreadMenuRow | null,
): ContextMenuExtraSection {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const rooms = useAppSelector(selectRoomTargets);

  const otherRooms = rooms.filter((r) => r.id !== row?.roomId);
  const href = row ? threadHref(row) : null;

  const openThread = async () => {
    if (!row) return;
    if (href) {
      startTransition(() => router.push(href));
      return;
    }
    // Orphan: the thread has no room, so opening it mints one — the exact
    // path the row's "Open" button already takes.
    const roomId = await dispatch(openOrphanThreadInNewRoom(row.id));
    if (!roomId) return;
    startTransition(() =>
      router.push(`/war-room/${roomId}?thread=${encodeURIComponent(row.id)}`),
    );
  };

  const copyLink = async () => {
    if (!row || !href) return;
    const url = `${window.location.origin}${href}`;
    await copyToClipboard(url, {
      formatJson: false,
      onSuccess: () => toast.success("Thread link copied"),
      // A blocked clipboard is not a failed copy — the ONE fallback puts the
      // link in front of the user to copy by hand.
      onError: () =>
        showManualCopy({ text: url, title: "Copy the thread link" }),
    });
  };

  const roomItems = (mode: "move" | "add"): ContextMenuExtraItem[] =>
    otherRooms.map((target) => ({
      kind: "item" as const,
      id: `war-room-thread-${mode}-${target.id}`,
      label: target.title,
      onSelect: () => {
        if (!row) return;
        void dispatch(attachExistingThreadToRoom(row.id, target.id, mode));
      },
    }));

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "war-room-thread-open",
      label: row?.roomId ? "Open thread" : "Open thread in a new War Room",
      icon: ExternalLink,
      description: row?.roomId
        ? "Open it inside its War Room"
        : "This thread has no room yet — opening it creates one",
      disabled: !row,
      onSelect: () => void openThread(),
    },
    ...(href
      ? [
          {
            kind: "link" as const,
            id: "war-room-thread-open-tab",
            label: "Open in a new tab",
            icon: ExternalLink,
            href,
            target: "_blank",
          },
        ]
      : []),
    {
      kind: "item",
      id: "war-room-thread-copy-link",
      label: "Copy link",
      icon: Link2,
      description: href
        ? undefined
        : "An orphan thread has no link until it is opened in a room",
      disabled: !href,
      onSelect: () => void copyLink(),
    },
    {
      kind: "checkbox",
      id: "war-room-thread-pin",
      label: row?.isPinned ? "Unpin thread" : "Pin thread",
      icon: row?.isPinned ? PinOff : Pin,
      checked: Boolean(row?.isPinned),
      disabled: !row,
      onCheckedChange: (next) => {
        if (!row) return;
        void dispatch(toggleThreadPin(row.id, next));
      },
    },
    // A submenu carries no reason line, so with nowhere to move to the menu
    // says WHY instead of offering an empty drawer.
    ...(otherRooms.length === 0
      ? [
          {
            kind: "item" as const,
            id: "war-room-thread-no-rooms",
            label: "Move to room",
            icon: FolderInput,
            description: "There is no other War Room to move this thread into",
            disabled: true,
            onSelect: () => {},
          },
        ]
      : [
          {
            kind: "submenu" as const,
            id: "war-room-thread-move",
            label: "Move to room",
            icon: FolderInput,
            children: roomItems("move"),
          },
          {
            // Multi-room membership — a second thread → war_room edge; the
            // thread stays where it is AND appears in the picked room.
            kind: "submenu" as const,
            id: "war-room-thread-add",
            label: "Also add to room",
            icon: FolderPlus,
            children: roomItems("add"),
          },
        ]),
  ];

  return {
    id: "war-room-thread",
    label: "Thread",
    icon: FolderInput,
    anchor: "after-compare",
    items,
  };
}
