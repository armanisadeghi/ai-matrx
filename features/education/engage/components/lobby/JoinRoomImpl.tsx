// features/education/engage/components/lobby/JoinRoomImpl.tsx
//
// Join a multiplayer room by code (Kahoot-style, minus the player tax). Looks
// the room up via the cross-owner RPC, then routes into the lobby.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationGameScope } from "@/features/surfaces/manifests/education-game.manifest";
import { gameService } from "../../data/gameService";
import { ENGAGE_ROUTES } from "../../constants";

const SURFACE_NAME = "matrx-user/education-game";

export function JoinRoomImpl() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, startJoin] = useTransition();

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationGameScope({
      view: "join",
      join_code: code,
      join_error: error ?? undefined,
      join_joining: joining,
    });

  const join = (): void => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError("Enter the 5-character code.");
      return;
    }
    setError(null);
    startJoin(async () => {
      const res = await gameService.findRoomByCode(trimmed);
      if (res.error || !res.data) {
        setError(res.error ?? "No open room with that code.");
        return;
      }
      router.push(ENGAGE_ROUTES.play(res.data.id, res.data.join_code));
    });
  };

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-5 p-4">
      <div className="flex items-center gap-2 self-start">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/education/game")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <div className="w-full rounded-xl border border-border bg-card p-6 text-center">
        <LogIn className="mx-auto mb-2 h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Join a game</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter the code the host is showing.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
          placeholder="ABC12"
          maxLength={5}
          autoFocus
          className="text-center text-2xl font-bold uppercase tracking-[0.4em]"
          // font-size ≥ 16px avoids iOS zoom; the class above is >16px.
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <Button
          className="mt-4 w-full gap-2"
          disabled={joining}
          onClick={join}
        >
          {joining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Joining…
            </>
          ) : (
            "Join"
          )}
        </Button>
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
