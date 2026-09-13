"use client";

import { resolveScrollPaginationPolicy, suspendScrollPaginationPolicy } from "@ai-matrx/data/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";

/** Resolve only where a paginated table mounts; no global startup fetch. */
export function useTablePaginationPolicy() {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const { knobs, isLoading, error, refresh } = useScopedKnobs({
    organizationId, featurePrefix: "tables.pagination", userId: userId || undefined,
  });
  const value = (key: string) => knobs.find((knob) => knob.feature === "tables.pagination" && knob.key === key)?.effective_value;
  const scroll = !organizationId
    ? suspendScrollPaginationPolicy("Automatic loading is paused until an organization is selected.")
    : isLoading
      ? suspendScrollPaginationPolicy("Automatic loading is paused while scrolling preferences load.")
      : error
        ? suspendScrollPaginationPolicy(`Automatic loading is paused because scrolling preferences could not load: ${error}.`)
        : resolveScrollPaginationPolicy({
          mode: value("mode"),
          thresholdPx: value("threshold_px"),
          intentTimeoutMs: value("intent_timeout_ms"),
          reason: value("reason"),
          approvedBy: value("approved_by"),
        });
  const notice = scroll.mode === "suspended" ? scroll.reason : null;
  return { scroll, notice, isLoading, refresh, organizationId, userId };
}
