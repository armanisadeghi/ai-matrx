/**
 * useDriftAlerts — dispatch-on-idle hook for the caller's open drift alerts,
 * powering the agents-page header drift indicator. Exposes dismiss + view-stamp actions.
 */

"use client";

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { dismissDriftAlert, fetchDriftAlerts, markDriftAlertViewed } from "@/features/agents/redux/usages/usages.thunks";
import { selectActiveBannerAlerts, selectDriftAlertsStatus } from "@/features/agents/redux/usages/usages.selectors";
import type { DriftAlertRow } from "@ai-matrx/chat/ui/usages/usages.types";
import { selectAccessToken, selectAuthReady, selectUserId } from "@ai-matrx/chat/host/identity";

export function useDriftAlerts() {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectActiveBannerAlerts);
  const status = useAppSelector(selectDriftAlertsStatus);
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);

  useEffect(() => {
    // The server-authenticated shell can paint before the browser Supabase
    // client has adopted its cookie session. Do not let the header's eager
    // alert read escape as an anonymous `agent.drift_alert` query.
    if (authReady && userId && accessToken) {
      dispatch(fetchDriftAlerts());
    }
  }, [dispatch, authReady, userId, accessToken]);

  const dismiss = useCallback(
    (alert: DriftAlertRow) => {
      const prev = alert.status === "acknowledged" ? "acknowledged" : "pending";
      dispatch(dismissDriftAlert({ alertId: alert.id, previousStatus: prev }));
    },
    [dispatch],
  );

  const markViewed = useCallback(
    (alertId: string) => {
      dispatch(markDriftAlertViewed(alertId));
    },
    [dispatch],
  );

  return { alerts, status, dismiss, markViewed } as const;
}
