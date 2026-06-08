"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFetchStatus } from "../redux/selectors";
import { fetchSessionsThunk } from "../redux/thunks";
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
  const fetchStatus = useAppSelector(selectFetchStatus);
  const syncSessionRoute = config.containerVariant === "page";
  const { navigateToSession } = useStudioSessionRoute(syncSessionRoute);

  // First-render hydration of the session list. The route hydrator may have
  // already populated Redux from SSR; we only fetch when no fetch has run.
  useEffect(() => {
    if (fetchStatus === "idle") {
      void dispatch(fetchSessionsThunk());
    }
  }, [fetchStatus, dispatch]);

  return (
    <StudioLayout
      showSidebar={config.showSidebar ?? true}
      defaultColumnLayout={config.defaultColumnLayout}
      defaultSidebarLayout={config.defaultSidebarLayout}
      navigateToSession={syncSessionRoute ? navigateToSession : undefined}
    />
  );
}
