// features/education/engage/components/multiplayer/MultiplayerGameImpl.tsx
//
// The live multiplayer game surface: lobby → play → results, composing the
// Broadcast channel (roster + start/end signals) with the shared game engine
// (per-player SRS-biased queue). Anxiety-safe by design — the live scoreboard is
// team/private, ordered but framed around everyone's mastery gain, never a
// public speed-shame screen.
//
// Reconnect recovery (DoD #5): on mount we re-fetch the room by code and, if it
// is already 'active', SYNC the countdown to the host's original started_at —
// so a refreshed/dropped client rejoins mid-round instead of restarting.
//
// Heavy client component → dynamic({ssr:false}) from the route (the *Impl +
// wrapper split). React Compiler is on: no manual useMemo/useCallback/memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Copy,
  Users,
  Play,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGamePlay } from "../../data/useGamePlay";
import { useGameChannel } from "../../realtime/useGameChannel";
import { gameService, type JoinableRoom, type RoomPlayerResult } from "../../data/gameService";
import { finalizeGame } from "../../data/finalizeGame";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { seedFromString } from "../../engine/queue";
import { DEFAULT_ROOM_CONFIG, type GameOutcome, type LivePlayer } from "../../types";
import { PlaySurface } from "../play/PlaySurface";
import { ResultsSummary } from "../results/ResultsSummary";
import type { BadgeKey } from "../../engine/badges";

export function MultiplayerGameImpl({
  roomId,
  code,
}: {
  roomId: string;
  code: string;
}) {
  const router = useRouter();
  const { userId, displayName } = useCurrentPlayer();
  const [room, setRoom] = useState<JoinableRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [finalOutcome, setFinalOutcome] = useState<GameOutcome | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeKey[]>([]);
  const [scoreboard, setScoreboard] = useState<RoomPlayerResult[]>([]);

  // Track whether we were ever strictly last (for the honest comeback badge).
  const wasLastRef = useRef(false);
  const startedRef = useRef(false);

  // Load the room by code (works for host AND joiner — cross-owner RPC).
  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await gameService.findRoomByCode(code);
      if (!active) return;
      if (res.error || !res.data) {
        setLoadError(res.error ?? "Room not found or already ended.");
        setLoading(false);
        return;
      }
      setRoom(res.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [code]);

  const isHost = Boolean(userId && room && room.host_user_id === userId);
  const config = room?.config ?? DEFAULT_ROOM_CONFIG;

  const channel = useGameChannel({
    roomId,
    me: userId ? { userId, displayName, isHost } : null,
  });

  const game = useGamePlay({
    sourceKind: room?.source_kind === "set" ? "set" : "due",
    sourceSetId: room?.source_set_id ?? null,
    sourceTitle: room?.source_title ?? null,
    config,
    mode: "multiplayer",
    roomId,
    seed: userId ? seedFromString(`${userId}:${roomId}`) : undefined,
    autoStart: false,
    onScore: channel.sendScore,
    onFinish: (outcome) => {
      setFinalOutcome(outcome);
      // Rank at finish for the honest comeback signal.
      const wasComeback = wasLastRef.current && !isStrictlyLast(userId, channel.players);
      void finalizeGame({ outcome, displayName, wasComeback }).then((r) => {
        setNewBadges(r.newBadges);
      });
      // Host closes the room once its own round ends.
      if (isHost) {
        void gameService.setRoomStatus(roomId, "ended", {
          ended_at: new Date().toISOString(),
        });
      }
      // Load the finalized scoreboard (poll briefly so peers' rows land).
      void loadScoreboardSoon();
    },
  });

  // Start the round when the game state signals it — from a fresh host start
  // (channel.startedAt) OR a rejoin into an already-active room (room.started_at).
  useEffect(() => {
    if (startedRef.current || game.status !== "ready" || !room) return;
    const broadcastAt = channel.startedAt;
    const roomAt = room.status === "active" && room.started_at
      ? Date.parse(room.started_at)
      : null;
    const startAt = broadcastAt ?? roomAt;
    if (startAt != null) {
      startedRef.current = true;
      game.start(startAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status, channel.startedAt, room]);

  // Track "was ever last" while playing (2+ players only).
  useEffect(() => {
    if (game.status === "playing" && isStrictlyLast(userId, channel.players)) {
      wasLastRef.current = true;
    }
  }, [game.status, channel.players, userId]);

  const loadScoreboardSoon = async (): Promise<void> => {
    // Peers persist their result asynchronously; try a couple of times.
    for (let i = 0; i < 3; i++) {
      const res = await gameService.getRoomScoreboard(roomId);
      if (res.data && res.data.length > 0) setScoreboard(res.data);
      await new Promise((r) => setTimeout(r, 1200));
    }
  };

  const onHostStart = async (): Promise<void> => {
    const res = await gameService.setRoomStatus(roomId, "active", {
      started_at: new Date().toISOString(),
    });
    if (res.error) {
      toast.error("Could not start the game");
      return;
    }
    channel.broadcastStart(config.durationMs);
  };

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Join code copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const exit = () => router.push("/education/game");

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Joining room…</p>
      </Centered>
    );
  }
  if (loadError || !room) {
    return (
      <Centered>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {loadError ?? "Room unavailable."}
        </p>
        <Button variant="outline" onClick={exit}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </Centered>
    );
  }

  // Finished → results with the room scoreboard.
  if (game.status === "finished" && finalOutcome) {
    return (
      <div className="h-full overflow-y-auto px-4">
        <ResultsSummary
          outcome={finalOutcome}
          newBadges={newBadges}
          scoreboard={scoreboard}
          currentUserId={userId}
          onExit={exit}
        />
      </div>
    );
  }

  // Playing → the game + live scoreboard.
  if (game.status === "playing") {
    return (
      <div className="flex h-full gap-3 p-4">
        <div className="min-h-0 flex-1">
          <PlaySurface game={game} />
        </div>
        <LiveScoreboard
          players={channel.players}
          currentUserId={userId}
          connected={channel.connected}
        />
      </div>
    );
  }

  // Lobby (or loading the queue) → roster + host controls.
  return (
    <Lobby
      code={code}
      players={channel.players}
      isHost={isHost}
      connected={channel.connected}
      queueReady={game.status === "ready"}
      queueError={game.status === "error" ? game.error : null}
      onCopy={copyCode}
      onStart={onHostStart}
      onExit={exit}
    />
  );
}

function Lobby({
  code,
  players,
  isHost,
  connected,
  queueReady,
  queueError,
  onCopy,
  onStart,
  onExit,
}: {
  code: string;
  players: LivePlayer[];
  isHost: boolean;
  connected: boolean;
  queueReady: boolean;
  queueError: string | null;
  onCopy: () => void;
  onStart: () => void;
  onExit: () => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      <div className="flex items-center gap-2 self-start">
        <Button variant="ghost" size="sm" onClick={onExit} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Exit
        </Button>
        <ConnBadge connected={connected} />
      </div>

      <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Join code</p>
        <button
          type="button"
          onClick={onCopy}
          className="mt-1 inline-flex items-center gap-2 text-4xl font-bold tracking-[0.3em] text-foreground hover:text-primary"
          title="Copy join code"
        >
          {code}
          <Copy className="h-5 w-5" />
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Players open /education/game → Join and enter this code.
        </p>
      </div>

      <div className="w-full rounded-xl border border-border bg-card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="h-4 w-4" /> Players ({players.length})
        </p>
        <ul className="flex flex-wrap gap-2">
          {players.map((p) => (
            <li
              key={p.userId}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm"
            >
              {p.displayName}
              {p.isHost && (
                <span className="text-xs text-muted-foreground">host</span>
              )}
            </li>
          ))}
          {players.length === 0 && (
            <li className="text-sm text-muted-foreground">Waiting for players…</li>
          )}
        </ul>
      </div>

      {queueError && (
        <p className="text-sm text-destructive">{queueError}</p>
      )}

      {isHost ? (
        <Button
          size="lg"
          disabled={!queueReady}
          onClick={onStart}
          className="gap-2"
        >
          {queueReady ? (
            <>
              <Play className="h-4 w-4" /> Start game
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
            </>
          )}
        </Button>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the host to
          start…
        </p>
      )}
    </div>
  );
}

function LiveScoreboard({
  players,
  currentUserId,
  connected,
}: {
  players: LivePlayer[];
  currentUserId: string | null;
  connected: boolean;
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <aside className="hidden w-56 shrink-0 flex-col rounded-xl border border-border bg-card p-3 md:flex">
      <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
        <span>Players</span>
        <ConnBadge connected={connected} compact />
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto">
        {ranked.map((p, i) => (
          <li
            key={p.userId}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              p.userId === currentUserId ? "bg-accent" : "bg-transparent",
            )}
          >
            <span className="w-4 text-center text-xs text-muted-foreground">
              {i + 1}
            </span>
            <span className="flex-1 truncate">{p.displayName}</span>
            <span className="tabular-nums font-medium text-foreground">
              {p.score.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-[11px] leading-tight text-muted-foreground">
        Everyone’s reviewing their own weak items — scores measure improvement,
        not speed.
      </p>
    </aside>
  );
}

function ConnBadge({
  connected,
  compact,
}: {
  connected: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        connected ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
      )}
      title={connected ? "Connected" : "Reconnecting…"}
    >
      {connected ? (
        <Wifi className="h-3.5 w-3.5" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" />
      )}
      {!compact && (connected ? "Live" : "Reconnecting")}
    </span>
  );
}

function isStrictlyLast(
  userId: string | null,
  players: LivePlayer[],
): boolean {
  if (!userId || players.length < 2) return false;
  const me = players.find((p) => p.userId === userId);
  if (!me) return false;
  return players.every((p) => p.userId === userId || p.score > me.score);
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}
