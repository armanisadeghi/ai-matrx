"use client";

/**
 * The news engine's six reader-facing kinds (NEWS-ENGINE-SPEC §6, items 11–16),
 * routed by their `__kind` marker to their ONE renderer each. The kind
 * registry's block (`NewsMonitorKindBlock`) and the run view both render
 * through here, so a chat answer carrying a digest and the run page show the
 * same thing.
 */

import { NEWS_MONITOR_KINDS } from "@/features/content-ir/kinds/news-monitor";

import { str } from "../run-document";
import { NewsAngleSetView } from "./NewsAngleSetView";
import { NewsClientContextView } from "./NewsClientContextView";
import { NewsDigestView } from "./NewsDigestView";
import { NewsOpportunityReportView } from "./NewsOpportunityReportView";
import { NewsTriageView } from "./NewsTriageView";
import { NewsworthinessVerdictView } from "./NewsworthinessVerdictView";

export function NewsKindView({ value }: { value: Record<string, unknown> }) {
  switch (str(value.__kind)) {
    case NEWS_MONITOR_KINDS.digest:
      return <NewsDigestView value={value} />;
    case NEWS_MONITOR_KINDS.triage:
      return <NewsTriageView value={value} />;
    case NEWS_MONITOR_KINDS.angleSet:
      return <NewsAngleSetView value={value} />;
    case NEWS_MONITOR_KINDS.report:
      return <NewsOpportunityReportView value={value} />;
    case NEWS_MONITOR_KINDS.verdict:
      return <NewsworthinessVerdictView value={value} />;
    case NEWS_MONITOR_KINDS.clientContext:
      return <NewsClientContextView value={value} />;
    default:
      return null;
  }
}
