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

import { useEffect, useState } from "react";
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

  if (view.kind === "session") {
    return (
      <MobileStudioScreen
        sessionId={view.sessionId}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "unsorted") {
    return <MobileUnsortedScreen onBack={() => setView({ kind: "list" })} />;
  }

  return (
    <MobileSessionsList
      onOpenSession={(sessionId) => setView({ kind: "session", sessionId })}
      onOpenUnsorted={() => setView({ kind: "unsorted" })}
    />
  );
}
