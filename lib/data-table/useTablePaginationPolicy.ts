"use client";

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
  const mode = value("mode");
  const thresholdPx = value("threshold_px");
  const intentTimeoutMs = value("intent_timeout_ms");
  const valid = (mode === "scroll" || mode === "manual") &&
    typeof thresholdPx === "number" && Number.isFinite(thresholdPx) && thresholdPx >= 0 &&
    typeof intentTimeoutMs === "number" && Number.isFinite(intentTimeoutMs) && intentTimeoutMs > 0;
  const notice = !organizationId
    ? "Choose an organization to use its scrolling preference. Load more is available."
    : isLoading ? null
    : error ? `Scrolling preferences could not load: ${error}. Use Load more or retry.`
    : !valid ? "Scrolling preferences are missing or invalid. Use Load more and review table pagination in configuration."
    : null;
  // Manual is the explicitly announced recovery state, never a frozen config default.
  const scroll: { mode: "scroll" | "manual"; thresholdPx?: number; intentTimeoutMs?: number } = valid ? { mode, thresholdPx, intentTimeoutMs } : { mode: "manual" as const };
  return { scroll, notice, isLoading, refresh, organizationId, userId };
}
