// features/education/engage/components/lobby/HostSetupImpl.tsx
//
// Host a multiplayer room: pick a deck (or your due queue), then create a room
// and go to the lobby. Wires the P8 `education.game_room_size` entitlement — the
// max-players cap is shown BEFORE hosting (TRUST mandate: no mid-workflow
// ambush) and the free default is intentionally generous (no "Kahoot tax").
// P7 note: other players load questions from THIS deck, so it must be shared or
// public for a cross-account game — surfaced inline.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState, useTransition } from "react";
import { useRead } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  Loader2,
  Layers,
  TrendingUp,
  Users,
  Lock,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { useEntitlement } from "@/features/entitlements/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationGameScope,
  type GameDeckOption,
} from "@/features/surfaces/manifests/education-game.manifest";
import { gameService } from "../../data/gameService";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { DEFAULT_ROOM_CONFIG } from "../../types";
import { ENGAGE_ROUTES } from "../../constants";
import { parseCurrentHostRoomCreation } from "../../gameRoomAgentWrites";

const SURFACE_NAME = "matrx-user/education-game";

type Source =
  | { kind: "set"; set: FcSetRow }
  | { kind: "due" };

export function HostSetupImpl() {
  const router = useRouter();
  const { userId } = useCurrentPlayer();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const roomSize = useEntitlement("education.game_room_size");
  const setsRead = useRead(
    async () => {
      const res = await fcService.listSets();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    [],
    { initialData: [] as FcSetRow[] },
  );
  const sets = setsRead.data ?? [];
  const loading = setsRead.isLoading;
  const [source, setSource] = useState<Source>({ kind: "due" });
  const [creating, startCreate] = useTransition();

  const maxPlayers = roomSize.limit ?? DEFAULT_ROOM_CONFIG.maxPlayers;

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationGameScope({
      view: "host",
      host_source_kind: source.kind,
      host_source_set_id: source.kind === "set" ? source.set.id : undefined,
      host_source_set_name:
        source.kind === "set" ? source.set.name : undefined,
      host_available_sets: sets.map(
        (s): GameDeckOption => ({
          id: s.id,
          name: s.name,
          isPrivate: s.shown_to === "only_me",
        }),
      ),
      host_max_players: maxPlayers,
      host_creating: creating,
    });

  const createCurrentHostRoom = async () => {
    if (!userId) {
      throw new Error("You must be signed in to host.");
    }
    // Server-truth entitlement check (permissive at launch; never blocks the
    // generous free default). Creating a waiting room does not start a game
    // session or spend metered study work.
    await roomSize.check();
    const config = { ...DEFAULT_ROOM_CONFIG, maxPlayers };
    const res = await gameService.createRoom({
      organizationId: activeOrganizationId,
      hostUserId: userId,
      sourceKind: source.kind === "set" ? "set" : "due",
      sourceSetId: source.kind === "set" ? source.set.id : null,
      sourceTitle: source.kind === "set" ? source.set.name : "Due review",
      config,
    });
    if (res.error || !res.data) {
      throw new Error(res.error ?? "Could not create room");
    }
    return res.data;
  };

  const create = (): void => {
    startCreate(async () => {
      try {
        const room = await createCurrentHostRoom();
        router.push(ENGAGE_ROUTES.play(room.id, room.join_code));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create room",
        );
      }
    });
  };

  useSurfaceWriteHandlers(SURFACE_NAME, {
    create_game_room: {
      validate: (value) => {
        parseCurrentHostRoomCreation(value);
        if (creating) {
          throw new Error("A room is already being created. Nothing was changed.");
        }
        if (!userId) {
          throw new Error("You must be signed in to host. Nothing was changed.");
        }
      },
      apply: async (value) => {
        parseCurrentHostRoomCreation(value);
        if (creating) {
          throw new Error("A room is already being created. Nothing was changed.");
        }
        const room = await createCurrentHostRoom();
        router.push(ENGAGE_ROUTES.play(room.id, room.join_code));
        return {
          summary: `Created a waiting room from the current host setup. Join code: ${room.join_code}.`,
          data: { id: room.id, join_code: room.join_code, status: room.status },
        };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
    <div className="scroll-page-end-space mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Button
          icon={<ArrowLeft />}
          variant="quiet"
          onClick={() => router.push("/education/game")}
        > Back
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Host a game</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Pick what players will study. Everyone gets their own SRS-biased
        questions from this source — so every round is real review.
      </p>

      {/* Due-queue option */}
      <button
        type="button"
        onClick={() => setSource({ kind: "due" })}
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card p-4 text-left",
          source.kind === "due"
            ? "border-primary ring-1 ring-primary"
            : "border-border hover:border-primary/50",
        )}
      >
        <TrendingUp className="h-5 w-5 text-primary" />
        <div>
          <p className="font-medium text-foreground">Your due queue</p>
          <p className="text-xs text-muted-foreground">
            Cross-deck items due for review — the adaptive default.
          </p>
        </div>
      </button>

      {/* Decks */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Or a deck</p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading decks…
          </div>
        ) : setsRead.isError && sets.length === 0 ? (
          <ReadFailure
            error={setsRead.error}
            what="your decks"
            className="m-0"
            onRetry={setsRead.retry}
          />
        ) : sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No decks yet.{" "}
            <button
              className="text-primary underline"
              onClick={() => router.push("/education/flashcards")}
            >
              Create one
            </button>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sets.map((s) => {
              const selected = source.kind === "set" && source.set.id === s.id;
              const isPrivate = s.shown_to === "only_me";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSource({ kind: "set", set: s })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-left",
                      selected
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm text-foreground">
                      {s.name}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      title={
                        isPrivate
                          ? "Shown to: Only me. Share it for a cross-account game."
                          : "Others can load these cards"
                      }
                    >
                      {isPrivate ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Globe className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Entitlement (visible BEFORE hosting) */}
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        Up to <span className="font-medium text-foreground">{maxPlayers}</span>{" "}
        players
        {roomSize.tier ? ` · ${roomSize.tier} tier` : ""}
      </div>

      <Button variant="primary" disabled={creating} onClick={create}>
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creating room…
          </>
        ) : (
          "Create room"
        )}
      </Button>
    </div>
    </SurfaceRuntimeProvider>
  );
}
