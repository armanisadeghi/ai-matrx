"use client";

/**
 * MobileStudioRoute
 *
 * Client entry for /transcription/mobile. Resolves an active session (creating
 * one on first visit) and mounts the MobileStudioScreen. Sessions are seeded
 * server-side via StudioHydrator; this only fills the gap when none exist yet.
 */

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectActiveSessionId,
  selectAllSessions,
  selectFetchStatus,
} from "../../redux/selectors";
import { activeSessionIdSet } from "../../redux/slice";
import { createSessionThunk, fetchSessionsThunk } from "../../redux/thunks";
import { MobileStudioScreen } from "./MobileStudioScreen";

interface MobileStudioRouteProps {
  initialSessionId?: string | null;
}

export function MobileStudioRoute({ initialSessionId }: MobileStudioRouteProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const sessions = useAppSelector(selectAllSessions);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const fetchStatus = useAppSelector(selectFetchStatus);
  const creatingRef = useRef(false);

  // Client-side fetch if SSR didn't seed.
  useEffect(() => {
    if (fetchStatus === "idle") void dispatch(fetchSessionsThunk());
  }, [fetchStatus, dispatch]);

  // Resolve the active session: prefer the URL-provided id, then the most
  // recent session, otherwise create a fresh one.
  useEffect(() => {
    if (activeSessionId) return;
    if (fetchStatus === "loading" || fetchStatus === "idle") return;
    if (initialSessionId && sessions.some((s) => s.id === initialSessionId)) {
      dispatch(activeSessionIdSet(initialSessionId));
      return;
    }
    if (sessions.length > 0) {
      dispatch(activeSessionIdSet(sessions[0]!.id));
      return;
    }
    if (!userId || creatingRef.current) return;
    creatingRef.current = true;
    void dispatch(createSessionThunk({ userId, activate: true })).finally(() => {
      creatingRef.current = false;
    });
  }, [
    activeSessionId,
    fetchStatus,
    initialSessionId,
    sessions,
    userId,
    dispatch,
  ]);

  if (!activeSessionId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <MobileStudioScreen sessionId={activeSessionId} />;
}
