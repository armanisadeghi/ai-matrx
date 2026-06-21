/**
 * useDriftAlerts — dispatch-on-idle hook for the caller's open drift alerts,
 * powering the agents-page header drift indicator. Exposes dismiss + view-stamp actions.
 */

"use client";

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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

  useEffect(() => {
    dispatch(fetchDriftAlerts());
  }, [dispatch]);

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
