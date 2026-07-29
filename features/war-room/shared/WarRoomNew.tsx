// features/war-room/shared/WarRoomNew.tsx
//
// /war-room/new — create a session and open it. A thin client redirect over
// the canonical createWarRoomSession thunk.
//
// BUILD-GRAPH ROLE: this route is the shell's zero-import-edge entry into the
// war-room engine. The sidebar "create-war-room" nav action router.push()es
// here instead of `await import()`ing the war-room thunks from navActions.ts —
// that async edge split the 671-module war-room cluster into a chunk group
// multiplied across every route context (the D115 detonator shape; see the
// code-splitting skill, rule 6 caveat). Here the engine compiles into this
// route's own entry, where it belongs.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createWarRoomSession } from "@/features/war-room/redux/thunks";

export function WarRoomNew() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // The thunk raises its own error toast on failure and returns null.
      const session = await dispatch(createWarRoomSession());
      if (session) {
        router.replace(`/war-room/${session.id}`);
      } else {
        setFailed(true);
      }
    })();
  }, [dispatch, router]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-textured">
      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-10 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Couldn&apos;t create the war room
          </p>
          <Button onClick={() => router.push("/war-room")}>
            Back to war rooms
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm">Creating your war room…</p>
        </div>
      )}
    </div>
  );
}
