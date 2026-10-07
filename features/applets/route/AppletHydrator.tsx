"use client";

/**
 * AppletHydrator — client island that seeds the applets Redux slice with
 * a single fetched-on-the-server `AppletRow` record. Sub-routes under
 * /applets/manage/[id] read from Redux via selectors; this hydrator is the bridge
 * between the layout's server fetch and that client-side state.
 *
 * Mirrors features/agents/route/AgentHydrator.tsx.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { appletActions } from "@/features/agents/redux/applets/slice";
import type { AppletRow } from "@/features/applets/types";

export function AppletHydrator({ app }: { app: AppletRow }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(appletActions.upsertApp(app));
    dispatch(appletActions.setActiveAppId(app.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  return null;
}
