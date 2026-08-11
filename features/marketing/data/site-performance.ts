"use client";

import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { components } from "@/types/python-generated/api-types";

export type SitePerformanceResponse =
  components["schemas"]["SitePerformanceResponse"];

const SITE_PERFORMANCE_PATH = "/seo/sites/{site_id}/performance";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPageRow(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.page_id === "string" &&
    typeof value.url === "string"
  );
}

function isSuggestedPageRow(value: unknown): boolean {
  return (
    isPageRow(value) &&
    isRecord(value) &&
    isNumber(value.gsc_clicks) &&
    isNumber(value.gsc_impressions) &&
    typeof value.tier === "string"
  );
}

function isAutomationStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.schedule_matches_expected === "boolean" &&
    isNumber(value.cadence_minutes) &&
    isNumber(value.requests_per_cycle) &&
    isNumber(value.daily_request_target) &&
    (value.next_run_at === null || typeof value.next_run_at === "string") &&
    (value.last_status === null || typeof value.last_status === "string")
  );
}

function isSitePerformanceResponse(
  value: unknown,
): value is SitePerformanceResponse {
  if (!isRecord(value) || !isRecord(value.coverage)) return false;
  const coverage = value.coverage;
  return (
    typeof value.site_id === "string" &&
    typeof value.generated_at === "string" &&
    isNumber(value.window_days) &&
    isNumber(coverage.total_measurable_pages) &&
    isNumber(coverage.pages_ever_measured) &&
    isNumber(coverage.pages_measured_last_30_days) &&
    isNumber(coverage.percent_covered) &&
    isNumber(coverage.estimated_cycles_remaining) &&
    isRecord(value.mobile_distribution) &&
    isRecord(value.mobile_scores) &&
    isRecord(value.desktop_scores) &&
    Array.isArray(value.worst_pages_with_traffic) &&
    value.worst_pages_with_traffic.every(isPageRow) &&
    Array.isArray(value.most_improved) &&
    value.most_improved.every(isPageRow) &&
    Array.isArray(value.most_regressed) &&
    value.most_regressed.every(isPageRow) &&
    Array.isArray(value.suggested_pages) &&
    value.suggested_pages.every(isSuggestedPageRow) &&
    isAutomationStatus(value.automation) &&
    (value.suggested_action === null ||
      isSuggestedPageRow(value.suggested_action))
  );
}

export function useSitePerformance(siteId: string) {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: ["marketing", "site-performance", siteId],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const response = await dispatch(
        callApi({
          path: SITE_PERFORMANCE_PATH,
          method: "GET",
          pathParams: { site_id: siteId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      if (!isSitePerformanceResponse(response.data)) {
        throw new Error(
          "The site performance service returned an invalid response.",
        );
      }
      return response.data;
    },
  });
}
