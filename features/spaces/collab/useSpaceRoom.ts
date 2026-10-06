"use client";

// features/spaces/collab/useSpaceRoom.ts — ONE realtime channel per open Space (A6, H1, H3):
//   presence  — who has this page open now (the top bar's avatars);
//   postgres_changes on platform.comments for this page — another person's comment, reply, edit,
//             resolve or delete reaches the thread list without a reload (row security gates delivery).
// The page's own saves arrive through the store's subscription (store-db, owner's).
// On @ai-matrx/realtime (supabase-realtime skill): namespace-built topic, backfill = re-read the threads.

import { defineChannelNamespace } from "@ai-matrx/realtime";
import { usePresence } from "@ai-matrx/realtime/react";
import { useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserAvatarUrl, selectUserEmail, selectUserFullName, selectUserId } from "@/lib/redux/selectors/userSelectors";

const spacesPage = defineChannelNamespace({
  namespace: "spaces-page",
  parts: ["spaceId"],
  description: "One open Space: who is viewing it (presence) and its comments (platform.comments changes).",
});

export type SpaceViewerState = {
  userId: string;
  name: string;
  avatarUrl: string | null;
} & Record<string, unknown>;

export interface SpaceViewer {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export function useSpaceRoom(spaceId: string, onCommentsChanged: () => void): { viewers: SpaceViewer[]; me: string | null } {
  const userId = useAppSelector(selectUserId);
  const fullName = useAppSelector(selectUserFullName);
  const email = useAppSelector(selectUserEmail);
  const avatarUrl = useAppSelector(selectUserAvatarUrl);
  // The handler reads the latest callback at event time — never a dependency of the channel.
  const changed = useRef(onCommentsChanged);
  changed.current = onCommentsChanged;

  const { members } = usePresence<SpaceViewerState>(
    {
      topic: spacesPage.topic({ spaceId }),
      presence: {
        state: { userId: userId ?? "", name: fullName || email || "Someone", avatarUrl: avatarUrl ?? null },
      },
      spec: {
        postgresChanges: [
          {
            event: "*",
            schema: "platform",
            table: "comments",
            filter: `entity_id=eq.${spaceId}`,
            rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
            onChange: () => changed.current(),
          },
        ],
        onBackfill: () => changed.current(),
      },
    },
    { enabled: !!userId },
  );

  // One avatar per person (a person with two tabs open is one viewer); me first, as Notion does.
  const byUser = new Map<string, SpaceViewer>();
  for (const m of members) {
    const s = m.state;
    if (!s?.userId || byUser.has(s.userId)) continue;
    byUser.set(s.userId, { userId: s.userId, name: s.name || "Someone", avatarUrl: s.avatarUrl ?? null });
  }
  const viewers = [...byUser.values()].sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : a.name.localeCompare(b.name)));
  return { viewers, me: userId };
}
