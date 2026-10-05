"use client";

// features/agent-apps/embed/AppletInPage.tsx — ONE APPLET DRAWN INSIDE A PAGE BUILT FROM TABLES
// (loaded on demand by `appletsPort.tsx`, so the app renderer never rides a table page's own chunk).

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAppById } from "@/features/agents/redux/agent-apps/thunks";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";
import type { AgentApp } from "@/features/agent-apps/types";

/** One applet, in place: read once by id (RLS decides), drawn by the app renderer. */
export default function AppletInPage({ appId }: { appId: string }) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId)) as AgentApp | undefined;
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (app) return;
    dispatch(fetchAppById(appId))
      .unwrap()
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : "This applet could not be opened."));
  }, [app, appId, dispatch]);
  if (failed) return <p className="text-xs text-muted-foreground">{failed}</p>;
  if (!app) return <p className="text-xs text-muted-foreground">Opening the applet…</p>;
  return (
    <div data-applet-in-page={appId} className="min-h-24">
      <AgentAppRenderer app={app} slug={app.slug} shellOverride="widget" />
    </div>
  );
}

