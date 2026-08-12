"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { TRANSCRIPT_STUDIO_SURFACE } from "../constants";
import { buildTranscriptStudioScope } from "../lib/transcript-studio-scope";
import { useStudioSurfaceWriteHandlers } from "../hooks/useStudioSurfaceWriteHandlers";
import {
  selectActiveSessionId,
  selectFetchStatus,
  selectSessionsById,
} from "../redux/selectors";
import { fetchSessionsThunk } from "../redux/thunks";
import { activeSessionIdSet } from "../redux/slice";
import { useStudioSessionRoute } from "../hooks/useStudioSessionRoute";
import type { StudioViewConfig } from "../types";
import { StudioLayout } from "./StudioLayout";

interface StudioViewProps {
  config: StudioViewConfig;
}

/**
 * Core entry for the Transcript Studio.
 *
 * The route (app/(a)/transcription/studio/page.tsx) and the window
 * panel (features/window-panels/windows/transcript-studio/...) both mount
 * this component with different config so the same UI can render full-page
 * or inside a floating window.
 */
export function StudioView({ config }: StudioViewProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const fetchStatus = useAppSelector(selectFetchStatus);
  const sessionsById = useAppSelector(selectSessionsById);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const appliedInitialSessionRef = useRef<string | null>(null);
  const syncSessionRoute = config.containerVariant === "page";
  const { navigateToSession } = useStudioSessionRoute(syncSessionRoute);

  // First-render hydration of the session list. The route hydrator may have
  // already populated Redux from SSR; we only fetch when no fetch has run.
  useEffect(() => {
    if (fetchStatus === "idle") {
      void dispatch(fetchSessionsThunk());
    }
  }, [fetchStatus, dispatch]);

  useEffect(() => {
    const initialSessionId = config.initialSessionId ?? null;
    if (
      !initialSessionId ||
      !sessionsById[initialSessionId] ||
      appliedInitialSessionRef.current === initialSessionId
    ) {
      return;
    }
    appliedInitialSessionRef.current = initialSessionId;
    if (activeSessionId !== initialSessionId) {
      dispatch(activeSessionIdSet(initialSessionId));
    }
  }, [activeSessionId, config.initialSessionId, dispatch, sessionsById]);

  const buildWriteHandlers = useStudioSurfaceWriteHandlers(
    activeSessionId ?? null,
  );

  // Surface runtime for `matrx-user/transcript-studio`. Mounted HERE rather
  // than on the route because this component backs BOTH the route
  // (`/transcripts/studio`) and the floating window (`transcriptStudioWindow`)
  // — the manifest declares both, so both need the emitter, and the window's
  // nested provider correctly out-depths the page's when it is open.
  //
  // The scope is built from the store at TRIGGER time (not from a render
  // snapshot): the studio streams new raw chunks continuously while
  // recording, so anything captured at render is stale within seconds.
  return (
    <SurfaceRuntimeProvider
      surfaceName={TRANSCRIPT_STUDIO_SURFACE}
      getScope={() =>
        buildTranscriptStudioScope(store.getState(), activeSessionId ?? null)
      }
      getWriteHandlers={buildWriteHandlers}
    >
      <StudioLayout
        showSidebar={config.showSidebar ?? true}
        defaultColumnLayout={config.defaultColumnLayout}
        defaultSidebarLayout={config.defaultSidebarLayout}
        navigateToSession={syncSessionRoute ? navigateToSession : undefined}
      />
    </SurfaceRuntimeProvider>
  );
}
