"use client";

/**
 * NewsMonitorKindBlock — the block-registry face of the news engine's six
 * reader-facing kinds (`news_digest`, `news_triage`, `news_angle_set`,
 * `news_opportunity_report`, `newsworthiness_verdict`, `news_client_context`).
 * A thin binding: it renders THE ONE view per kind (`NewsKindView`), the same
 * components the monitor's run view uses.
 */

import { NewsKindView } from "@/features/marketing/news-monitor/kinds/NewsKindView";

export interface NewsMonitorKindBlockProps {
  serverData: Record<string, unknown>;
}

export default function NewsMonitorKindBlock({ serverData }: NewsMonitorKindBlockProps) {
  const value =
    serverData && typeof serverData.value === "object" && serverData.value !== null
      ? (serverData.value as Record<string, unknown>)
      : null;
  if (!value) return null;
  return <NewsKindView value={value} />;
}
