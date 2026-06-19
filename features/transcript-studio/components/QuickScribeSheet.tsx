"use client";

/**
 * QuickScribeSheet — the body of the global "Quick Scribe" slide-in panel
 * (rendered inside `SidePanelSurface` by the overlay controller). Lets the user
 * capture voice from ANY page: it mints a Scribe session stamped with the active
 * project/org from `appContext`, so whatever they record auto-associates with
 * what they're working on — no extra input.
 *
 * Session lifecycle:
 *   - On open, create a session (stamped with the current project + org) and
 *     render the capture pipeline (`ScribeCaptureScreen`: record → live
 *     transcript → per-recording cleaning).
 *   - On close, if WE created the session and nothing was recorded, delete it so
 *     opening the panel never litters empty sessions (file-provenance rule:
 *     system-created empties stay out of the workspace).
 *
 * Task-level association is project-scoped here (studio_sessions carries
 * project_id/organization_id columns; task links go through the scope-assignment
 * system — a fast follow).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { getUserId } from "@/utils/auth/getUserId";
import {
  selectProjectId,
  selectOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { createSessionThunk, deleteSessionThunk } from "../redux/thunks";
import { ScribeCaptureScreen } from "./scribe/ScribeCaptureScreen";

interface QuickScribeSheetProps {
  /** Resume an existing session instead of minting one (optional). */
  sessionId?: string;
}

export function QuickScribeSheet({
  sessionId: initialSessionId,
}: QuickScribeSheetProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );
  // Guards: create exactly once; only auto-clean a session WE minted.
  const creatingRef = useRef(false);
  const createdByPanelRef = useRef(false);

  useEffect(() => {
    if (sessionId || creatingRef.current) return;
    creatingRef.current = true;
    const userId = getUserId();
    if (!userId) {
      creatingRef.current = false;
      return;
    }
    const state = store.getState();
    void (async () => {
      try {
        const session = await dispatch(
          createSessionThunk({
            userId,
            projectId: selectProjectId(state),
            organizationId: selectOrganizationId(state),
            title: "Quick capture",
            activate: true,
          }),
        ).unwrap();
        createdByPanelRef.current = true;
        setSessionId(session.id);
      } catch {
        // createSessionThunk already surfaced a toast; allow a retry.
        creatingRef.current = false;
      }
    })();
  }, [sessionId, dispatch, store]);

  // On close/unmount: drop the session if we minted it and nothing was kept.
  useEffect(() => {
    return () => {
      if (!createdByPanelRef.current || !sessionId) return;
      const recordings =
        store.getState().transcriptStudio.recordingSegmentIdsBySession[
          sessionId
        ] ?? [];
      if (recordings.length === 0) {
        void dispatch(deleteSessionThunk(sessionId));
      }
    };
  }, [sessionId, dispatch, store]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScribeCaptureScreen sessionId={sessionId} />
    </div>
  );
}
