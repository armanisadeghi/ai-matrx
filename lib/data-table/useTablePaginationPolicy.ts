"use client";

import { resolveScrollPaginationPolicy } from "@ai-matrx/data/react";
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
  const scroll = resolveScrollPaginationPolicy({
    mode: value("mode"), thresholdPx: value("threshold_px"), intentTimeoutMs: value("intent_timeout_ms"),
  });
  const notice = !organizationId
    ? "Choose an organization to use its scrolling preference. Load more is available."
    : isLoading ? null
    : error ? `Scrolling preferences could not load: ${error}. Use Load more or retry.`
    : !scroll.valid ? "Scrolling preferences are missing or invalid. Use Load more and review table pagination in configuration."
    : null;
  // Manual is the explicitly announced recovery state, never a frozen config default.
  return { scroll, notice, isLoading, refresh, organizationId, userId };
}
