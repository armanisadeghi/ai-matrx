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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  Loader2,
  Copy,
  Users,
  Play,
  TrendingUp,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  SurfaceRuntimeProvider,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationGameScope } from "@/features/surfaces/manifests/education-game.manifest";
import { useGamePlay } from "../../data/useGamePlay";
import { useGameChannel } from "../../realtime/useGameChannel";
import {
  gameService,
  type JoinableRoom,
  type RoomPlayerResult,
} from "../../data/gameService";
import { finalizeGame } from "../../data/finalizeGame";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { seedFromString } from "../../engine/queue";
import {
  DEFAULT_ROOM_CONFIG,
  type GameOutcome,
  type LivePlayer,
} from "../../types";
import { PlaySurface } from "../play/PlaySurface";
import { ResultsSummary } from "../results/ResultsSummary";
import type { BadgeKey } from "../../engine/badges";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { parseLobbyRoomCancellation } from "../../gameRoomAgentWrites";

const SURFACE_NAME = "matrx-user/education-game";

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
  // The raw failure, never a sentence — the gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [finalOutcome, setFinalOutcome] = useState<GameOutcome | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeKey[]>([]);
  const [scoreboard, setScoreboard] = useState<RoomPlayerResult[]>([]);
  const [verified, setVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);

  const startedRef = useRef(false);

  async function verifyOutcome(outcome: GameOutcome): Promise<void> {
    setVerificationError(null);
    setVerified(false);
    const result = await finalizeGame({ outcome, displayName });
    setNewBadges(result.newBadges);
    setVerificationError(result.error);
    if (result.officialOutcome) {
      setFinalOutcome(result.officialOutcome);
      setVerified(true);
      await loadScoreboardSoon();
    }
  }

  // Load the room by code (works for host AND joiner — cross-owner RPC).
  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await gameService.findRoomByCode(code);
      if (!active) return;
      if (res.error || !res.data) {
        setLoadError(res.error ?? null);
        setRoom(null);
        setLoading(false);
        return;
      }
      setLoadError(null);
      setRoom(res.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [code, reloadKey]);

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
    // Gate the queue load until the room (source deck/config) is resolved —
    // otherwise the null-room first render opens an orphaned 'due' session.
    enabled: Boolean(room),
    // Joining by code IS the permission: the session opens under the ROOM's
    // organization (start_game_session), so a player never chooses one.
    joinCode: room?.join_code ?? null,
    onScore: channel.sendScore,
    onFinish: (outcome) => {
      setFinalOutcome(outcome);
      void verifyOutcome(outcome);
      // Host closes the room once its own round ends.
      if (isHost) {
        void gameService.setRoomStatus(roomId, "ended", {
          ended_at: new Date().toISOString(),
        });
      }
    },
  });

  // Start the round when the game state signals it — from a fresh host start
  // (channel.startedAt) OR a rejoin into an already-active room (room.started_at).
  useEffect(() => {
    if (startedRef.current || game.status !== "ready" || !room) return;
    const broadcastAt = channel.startedAt;
    const roomAt =
      room.status === "active" && room.started_at
        ? Date.parse(room.started_at)
        : null;
    const startAt = broadcastAt ?? roomAt;
    if (startAt != null) {
      startedRef.current = true;
      game.start(startAt);
    }
  }, [game.status, channel.startedAt, room]);

  async function loadScoreboardSoon(): Promise<void> {
    // Peers persist their result asynchronously; try a couple of times.
    for (let i = 0; i < 3; i++) {
      const res = await gameService.getRoomScoreboard(roomId);
      if (res.data && res.data.length > 0) setScoreboard(res.data);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

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

  const cancelLobby = async (): Promise<{ id: string; status: string }> => {
    if (!room || !isHost || room.status !== "lobby") {
      throw new Error(
        "Only the host can cancel a room while it is waiting to start.",
      );
    }
    setCancelling(true);
    const res = await gameService.cancelLobbyRoom(roomId);
    setCancelling(false);
    if (res.error) {
      throw new Error(res.error);
    }
    channel.broadcastEnd();
    toast.success("Room cancelled");
    router.replace("/education/game");
    return { id: roomId, status: "ended" };
  };

  const cancelLobbyFromUi = async (): Promise<void> => {
    try {
      await cancelLobby();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel room",
      );
    }
  };

  const buildScope = () =>
    createEducationGameScope({
      view: "play",
      room_id: room?.id,
      room_phase: room?.status,
      room_player_count: room ? channel.players.length : undefined,
      owned_game_rooms:
        room && isHost ? [{ id: room.id, status: room.status }] : [],
    });

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <GameRoomSurface
        buildScope={buildScope}
        room={room}
        isHost={isHost}
        cancelLobby={cancelLobby}
      >
        <Centered>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Joining room…</p>
        </Centered>
      </GameRoomSurface>
    );
  }
  if (!room) {
    // "Room not found or already ended" was two guesses at once. The room may
    // equally be live and closed to this player, or the session may have
    // expired — the gate asks the platform which it is.
    return (
      <GameRoomSurface
        buildScope={buildScope}
        room={room}
        isHost={isHost}
        cancelLobby={cancelLobby}
      >
        <AccessGate
          token="game_room"
          id={roomId}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref="/education/game"
          fallbackLabel="Back to games"
        />
      </GameRoomSurface>
    );
  }

  // Finished → results with the room scoreboard.
  if (game.status === "finished" && finalOutcome) {
    return (
      <GameRoomSurface
        buildScope={buildScope}
        room={room}
        isHost={isHost}
        cancelLobby={cancelLobby}
      >
        <div className="scroll-page-end-space h-full overflow-y-auto px-4">
          <ResultsSummary
            outcome={finalOutcome}
            newBadges={newBadges}
            scoreboard={scoreboard}
            currentUserId={userId}
            verified={verified}
            verificationError={verificationError}
            onRetryVerification={() => void verifyOutcome(finalOutcome)}
            onExit={exit}
          />
        </div>
      </GameRoomSurface>
    );
  }

  // Playing → the game + live scoreboard.
  if (game.status === "playing") {
    return (
      <GameRoomSurface
        buildScope={buildScope}
        room={room}
        isHost={isHost}
        cancelLobby={cancelLobby}
      >
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
      </GameRoomSurface>
    );
  }

  // Lobby (or loading the queue) → roster + host controls.
  return (
    <GameRoomSurface
      buildScope={buildScope}
      room={room}
      isHost={isHost}
      cancelLobby={cancelLobby}
    >
      <Lobby
        code={code}
        players={channel.players}
        isHost={isHost}
        connected={channel.connected}
        queueReady={game.status === "ready"}
        queueError={game.status === "error" ? game.error : null}
        onCopy={copyCode}
        onStart={onHostStart}
        onCancel={cancelLobbyFromUi}
        cancelling={cancelling}
        onExit={exit}
      />
    </GameRoomSurface>
  );
}

function GameRoomSurface({
  buildScope,
  room,
  isHost,
  cancelLobby,
  children,
}: {
  buildScope: () => ReturnType<typeof createEducationGameScope>;
  room: JoinableRoom | null;
  isHost: boolean;
  cancelLobby: () => Promise<{ id: string; status: string }>;
  children: ReactNode;
}) {
  useSurfaceWriteHandlers(SURFACE_NAME, {
    delete_game_rooms: {
      validate: (value) => {
        parseLobbyRoomCancellation(value, room?.id ?? null);
        if (!isHost || room?.status !== "lobby") {
          throw new Error(
            "Only the host can cancel a room while it is waiting to start. Nothing was changed.",
          );
        }
      },
      apply: async (value) => {
        const roomId = parseLobbyRoomCancellation(value, room?.id ?? null);
        if (!isHost || room?.status !== "lobby") {
          throw new Error(
            "Only the host can cancel a room while it is waiting to start. Nothing was changed.",
          );
        }
        const cancelled = await cancelLobby();
        return {
          summary: `Cancelled waiting room ${roomId}. Its join code no longer works.`,
          data: cancelled,
        };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
      {children}
    </SurfaceRuntimeProvider>
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
  onCancel,
  cancelling,
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
  onCancel: () => Promise<void>;
  cancelling: boolean;
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
            <li className="text-sm text-muted-foreground">
              Waiting for players…
            </li>
          )}
        </ul>
      </div>

      {queueError && (
        <p className="text-sm text-destructive">
          {queueError} <ErrorAlchemyMenu />
        </p>
      )}

      {isHost ? (
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="lg"
            disabled={!queueReady || cancelling}
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                disabled={cancelling}
                className="gap-2"
              >
                <X className="h-4 w-4" /> Cancel room
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this room?</AlertDialogTitle>
                <AlertDialogDescription>
                  This ends the waiting room and invalidates its join code. No
                  new players can join after you confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cancelling}>
                  Keep room
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void onCancel()}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling…" : "Cancel room"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
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
        Live totals are provisional. Official results come from each learner’s
        study attempts, and leagues reward mastery rather than speed.
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
        connected
          ? "text-green-600 dark:text-green-400"
          : "text-muted-foreground",
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}
