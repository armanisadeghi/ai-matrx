// features/education/engage/realtime/useGameChannel.ts
//
// The realtime spine of a multiplayer game room: ONE Supabase Broadcast channel
// (`edu-game:<roomId>`) carrying ephemeral game state. Per CLAUDE.md's realtime
// rule, live state (roster, scores, start/end) is Broadcast — NOT Postgres.
// Presence backs the ROSTER (identity + host flag, and auto-recovers it on
// reconnect); throttled `score` broadcasts carry the mutable scoreboard.
//
// Reconnect recovery is free: presence re-syncs the full roster on resubscribe,
// so a refreshed/dropped client rejoins and sees everyone again (DoD #5).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";
import type { GameBroadcastEvent, LivePlayer, RoomPhase } from "../types";

interface PresenceIdentity {
  userId: string;
  displayName: string;
  isHost: boolean;
  online_at: number;
}

export interface UseGameChannelArgs {
  roomId: string | null;
  me: { userId: string; displayName: string; isHost: boolean } | null;
}

export interface UseGameChannelResult {
  connected: boolean;
  phase: RoomPhase;
  /** Live roster (presence identity + last-known mutable score fields). */
  players: LivePlayer[];
  /** When the host broadcast game_started (ms) + the round length. */
  startedAt: number | null;
  durationMs: number | null;
  /** Broadcast my current scoreboard (caller throttles). */
  sendScore: (fields: Omit<GameBroadcastEvent & { type: "score" }, "type" | "userId">) => void;
  /** Host: begin the match for everyone. */
  broadcastStart: (durationMs: number) => void;
  /** Host: end the match for everyone. */
  broadcastEnd: () => void;
}

const EMPTY_SCORE = {
  score: 0,
  correctCount: 0,
  answeredCount: 0,
  streak: 0,
  currency: 0,
};

export function useGameChannel({
  roomId,
  me,
}: UseGameChannelArgs): UseGameChannelResult {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // Last-known mutable score fields per user, survive presence re-syncs.
  const scoresRef = useRef<Record<string, Omit<LivePlayer, "userId" | "displayName" | "isHost" | "updatedAt">>>({});

  const meKey = me ? `${me.userId}` : null;

  useEffect(() => {
    if (!roomId || !me || !meKey) return;
    const supabase = createClient();
    const channelName = `edu-game:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: me.userId } },
    });
    channelRef.current = channel;

    const rebuildRoster = () => {
      const state = channel.presenceState() as RealtimePresenceState<PresenceIdentity>;
      const next: LivePlayer[] = [];
      for (const presences of Object.values(state)) {
        // A user may have multiple tabs; take the first identity.
        const id = (presences as PresenceIdentity[])[0];
        if (!id) continue;
        const score = scoresRef.current[id.userId] ?? EMPTY_SCORE;
        next.push({
          userId: id.userId,
          displayName: id.displayName,
          isHost: id.isHost,
          score: score.score,
          correctCount: score.correctCount,
          answeredCount: score.answeredCount,
          streak: score.streak,
          currency: score.currency,
          updatedAt: id.online_at,
        });
      }
      setPlayers(next);
    };

    channel.on("presence", { event: "sync" }, rebuildRoster);
    channel.on("presence", { event: "join" }, rebuildRoster);
    channel.on("presence", { event: "leave" }, rebuildRoster);

    channel.on("broadcast", { event: "game" }, (payload) => {
      const evt = payload.payload as GameBroadcastEvent | undefined;
      if (!evt) return;
      if (evt.type === "game_started") {
        setPhase("active");
        setStartedAt(evt.startedAt);
        setDurationMs(evt.durationMs);
      } else if (evt.type === "game_ended") {
        setPhase("ended");
      } else if (evt.type === "score") {
        scoresRef.current[evt.userId] = {
          score: evt.score,
          correctCount: evt.correctCount,
          answeredCount: evt.answeredCount,
          streak: evt.streak,
          currency: evt.currency,
        };
        rebuildRoster();
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        void channel.track({
          userId: me.userId,
          displayName: me.displayName,
          isHost: me.isHost,
          online_at: Date.now(),
        } satisfies PresenceIdentity);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
        console.warn(`[useGameChannel] ${status} on ${channelName} — will retry`);
      }
    });

    return () => {
      void channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, meKey, me]);

  const send = (event: GameBroadcastEvent): void => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "game", payload: event });
  };

  const sendScore: UseGameChannelResult["sendScore"] = (fields) => {
    if (!me) return;
    // Update my own row locally immediately (don't wait for the echo).
    scoresRef.current[me.userId] = { ...fields };
    send({ type: "score", userId: me.userId, ...fields });
  };

  const broadcastStart = (dur: number): void => {
    const now = Date.now();
    setPhase("active");
    setStartedAt(now);
    setDurationMs(dur);
    send({ type: "game_started", startedAt: now, durationMs: dur });
  };

  const broadcastEnd = (): void => {
    setPhase("ended");
    send({ type: "game_ended", endedAt: Date.now() });
  };

  return {
    connected,
    phase,
    players,
    startedAt,
    durationMs,
    sendScore,
    broadcastStart,
    broadcastEnd,
  };
}
