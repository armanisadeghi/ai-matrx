// features/education/engage/realtime/useGameChannel.ts
//
// The realtime spine of a multiplayer game room: ONE Broadcast + Presence
// channel (`mx:edu-game:<roomId>`) carrying ephemeral game state. Per CLAUDE.md's
// realtime rule, live state (roster, scores, start/end) is Broadcast — NOT
// Postgres. Presence backs the ROSTER (identity + host flag, and auto-recovers
// it on reconnect); throttled `score` broadcasts carry the mutable scoreboard.
//
// REALTIME: `@ai-matrx/realtime` owns the channel. THE TOPIC IS THE ROOM here —
// broadcast and presence route on it — so the package puts the declared topic on
// the wire verbatim and ref-counts one underlying channel per room inside this
// client (README rule 7, the topic-semantics split). What this replaced was a
// raw `.channel(...).subscribe()` with a hand-rolled presence roster rebuild,
// manual `track`/`untrack`, manual teardown and a status callback — plus GHOST
// PLAYERS: a client that crashed or lost its tab left its presence entry in the
// roster with nothing to expire it. The package's presence runtime carries
// heartbeat + local-clock expiry, so a crashed player leaves.
//
// ECHO SUPPRESSION IS NOW ON (it was `broadcast: {self: true}` before). The old
// channel needed its own score broadcast echoed back because `sendScore` updated
// the local score map but never rebuilt the roster — so the sender's own row only
// refreshed after a network round trip. It now rebuilds locally on send, which is
// both instant and the doctrine's default (README rule 2: opting out of echo
// suppression is the discouraged path, never the fix for something else).
//
// Reconnect recovery is free: presence re-syncs the full roster on resubscribe,
// so a refreshed/dropped client rejoins and sees everyone again (DoD #5). The
// backfill door is declared explicitly with that reason rather than omitted.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useRef, useState } from "react";
import { defineChannelNamespace, type PresenceMember } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import type { GameBroadcastEvent, LivePlayer, RoomPhase } from "../types";

interface PresenceIdentity extends Record<string, unknown> {
  userId: string;
  displayName: string;
  isHost: boolean;
  online_at: number;
}

/** One place names this channel. A second, different declaration throws. */
const gameChannel = defineChannelNamespace({
  namespace: "edu-game",
  parts: ["roomId"],
  description: "Multiplayer education game room — roster presence + score broadcast",
});

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
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Last-known mutable score fields per user, survive presence re-syncs.
  const scoresRef = useRef<Record<string, Omit<LivePlayer, "userId" | "displayName" | "isHost" | "updatedAt">>>({});
  const membersRef = useRef<readonly PresenceMember<PresenceIdentity>[]>([]);

  const meKey = me ? `${me.userId}` : null;

  /** Fold the presence roster + the score map into the live player list. */
  const rebuildRoster = (
    members: readonly PresenceMember<PresenceIdentity>[],
  ): void => {
    membersRef.current = members;
    const seen = new Set<string>();
    const next: LivePlayer[] = [];
    for (const member of members) {
      const id = member.state;
      if (!id?.userId) continue;
      // A user may have multiple tabs; take the first identity.
      if (seen.has(id.userId)) continue;
      seen.add(id.userId);
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

  const { status, send: sendOnChannel } = useChannel<PresenceIdentity>(
    roomId && me && meKey
      ? {
          topic: gameChannel.topic({ roomId }),
          presence: {
            key: me.userId,
            state: {
              userId: me.userId,
              displayName: me.displayName,
              isHost: me.isHost,
              online_at: Date.now(),
            },
            onChange: rebuildRoster,
          },
          broadcast: [
            {
              event: "game",
              onMessage: ({ data }) => {
                const evt = data as GameBroadcastEvent | undefined;
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
                  rebuildRoster(membersRef.current);
                }
              },
            },
          ],
          // Nothing durable backs this room — the roster is presence and the
          // scoreboard is ephemeral broadcast, both of which the package
          // re-syncs on resubscribe. Declared with the reason rather than
          // omitted, since an omitted door warns about a channel that has none.
          onBackfill: () => {
            // Intentionally nothing — see above.
          },
        }
      : null,
  );

  const connected = status === "connected";

  const send = (event: GameBroadcastEvent): void => {
    sendOnChannel("game", event);
  };

  const sendScore: UseGameChannelResult["sendScore"] = (fields) => {
    if (!me) return;
    // Update my own row locally and REBUILD — instant, and the reason this
    // channel no longer needs its own broadcasts echoed back to it.
    scoresRef.current[me.userId] = { ...fields };
    rebuildRoster(membersRef.current);
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
