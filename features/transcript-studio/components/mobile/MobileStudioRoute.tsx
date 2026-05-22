"use client";

/**
 * MobileStudioRoute
 *
 * Client entry for /transcription/mobile. Drives the three mobile views:
 *   - "list"     → MobileSessionsList (the grouping layer; sessions + Unsorted)
 *   - session    → MobileStudioScreen (capture + assistant for one session)
 *   - "unsorted" → MobileUnsortedScreen (the global detached pool)
 *
 * Sessions are seeded server-side via StudioHydrator; a deep link
 * (?session=<id>) opens that session directly, otherwise we land on the list.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFetchStatus } from "../../redux/selectors";
import { fetchSessionsThunk } from "../../redux/thunks";
import { MobileSessionsList } from "./MobileSessionsList";
import { MobileStudioScreen } from "./MobileStudioScreen";
import { MobileUnsortedScreen } from "./MobileUnsortedScreen";

type View =
  | { kind: "list" }
  | { kind: "session"; sessionId: string }
  | { kind: "unsorted" };

interface MobileStudioRouteProps {
  initialSessionId?: string | null;
}

export function MobileStudioRoute({ initialSessionId }: MobileStudioRouteProps) {
  const dispatch = useAppDispatch();
  const fetchStatus = useAppSelector(selectFetchStatus);
  const [view, setView] = useState<View>(
    initialSessionId
      ? { kind: "session", sessionId: initialSessionId }
      : { kind: "list" },
  );

  useEffect(() => {
    if (fetchStatus === "idle") void dispatch(fetchSessionsThunk());
  }, [fetchStatus, dispatch]);

  let view_: ReactNode;
  if (view.kind === "session") {
    view_ = (
      <MobileStudioScreen
        sessionId={view.sessionId}
        onBack={() => setView({ kind: "list" })}
      />
    );
  } else if (view.kind === "unsorted") {
    view_ = <MobileUnsortedScreen onBack={() => setView({ kind: "list" })} />;
  } else {
    view_ = (
      <MobileSessionsList
        onOpenSession={(sessionId) => setView({ kind: "session", sessionId })}
        onOpenUnsorted={() => setView({ kind: "unsorted" })}
      />
    );
  }

  // Phone-width column, centered on desktop so swipe distances and tap targets
  // stay sensible on large screens (the whole surface is touch + mouse capable).
  return (
    <div className="flex h-dvh w-full justify-center bg-muted/20">
      <div className="h-dvh w-full max-w-2xl overflow-hidden md:border-x md:border-border">
        {view_}
      </div>
    </div>
  );
}
