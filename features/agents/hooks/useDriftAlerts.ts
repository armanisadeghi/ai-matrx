/**
 * useDriftAlerts — dispatch-on-idle hook for the caller's open drift alerts,
 * powering the agents-page header drift indicator. Exposes dismiss + view-stamp actions.
 */

"use client";

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  dismissDriftAlert,
  fetchDriftAlerts,
  markDriftAlertViewed,
} from "@/features/agents/redux/usages/usages.thunks";
import {
  selectActiveBannerAlerts,
  selectDriftAlertsStatus,
} from "@/features/agents/redux/usages/usages.selectors";
import type { DriftAlertRow } from "@/features/agents/redux/usages/usages.types";

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
