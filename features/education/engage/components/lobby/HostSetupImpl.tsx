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

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { gameService } from "../../data/gameService";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { DEFAULT_ROOM_CONFIG } from "../../types";
import { ENGAGE_ROUTES } from "../../constants";

type Source =
  | { kind: "set"; set: FcSetRow }
  | { kind: "due" };

export function HostSetupImpl() {
  const router = useRouter();
  const { userId } = useCurrentPlayer();
  const roomSize = useEntitlement("education.game_room_size");
  const [sets, setSets] = useState<FcSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>({ kind: "due" });
  const [creating, startCreate] = useTransition();

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await fcService.listSets();
      if (!active) return;
      setSets(res.data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const maxPlayers = roomSize.limit ?? DEFAULT_ROOM_CONFIG.maxPlayers;

  const create = (): void => {
    if (!userId) {
      toast.error("You must be signed in to host");
      return;
    }
    startCreate(async () => {
      // Server-truth entitlement check (permissive at launch; never blocks the
      // generous free default).
      await roomSize.check();
      const config = { ...DEFAULT_ROOM_CONFIG, maxPlayers };
      const res = await gameService.createRoom({
        hostUserId: userId,
        sourceKind: source.kind === "set" ? "set" : "due",
        sourceSetId: source.kind === "set" ? source.set.id : null,
        sourceTitle: source.kind === "set" ? source.set.name : "Due review",
        config,
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "Could not create room");
        return;
      }
      router.push(ENGAGE_ROUTES.play(res.data.id, res.data.join_code));
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/education/game")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
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
              const isPrivate = s.visibility === "private";
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
                          ? "Private — only you can load these cards. Share it for a cross-account game."
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

      <Button size="lg" disabled={creating} onClick={create} className="gap-2">
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creating room…
          </>
        ) : (
          "Create room"
        )}
      </Button>
    </div>
  );
}
