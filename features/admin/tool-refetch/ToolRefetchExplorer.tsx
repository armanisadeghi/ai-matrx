"use client";

// features/admin/tool-refetch/ToolRefetchExplorer.tsx — THE RE-FETCH REPORT AS NUMBERS: a mount of the
// ONE explorer (lane DRILL-SERVER-2) over the declared definition `tool_refetch` (aidream
// apps/shared/records/scripts/drill-definitions/tool_refetch.drill.ts), platform lane, beside the
// per-tool table above it. A tool breaks out to its conversations and days; a conversation says its
// agent and person. Its by-tool numbers equal chat.vw_tool_refetch_summary, medians included
// (scripts/campaign-tests/drillserver2_green.sql T3).

import type { DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";

export const TOOL_REFETCH_SOURCE: DrillSource = { kind: "entity", token: "tool_refetch" };

const FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["tool"],
  show: ["calls", "repeats", "repeat_rate", "same_data_repeats", "same_data_rate", "chars_refetched_same_data"],
  where: [],
  sort: { key: "repeats", direction: "desc" },
  window: "30d",
};

/** The explorer follows the table's window (lane DRILL-LIVE-FIX-2 #4): "all" is all time. */
export function ToolRefetchExplorer({ window }: { window?: "7d" | "30d" | "90d" | "all" } = {}) {
  return (
    <DrillExplorer
      source={TOOL_REFETCH_SOURCE}
      lane="platform"
      organizationId={SYSTEM_ORGANIZATION_ID}
      timeZone="UTC"
      title="Tool re-fetch"
      rootLabel="Every tool call"
      firstQuestion={FIRST_QUESTION}
      {...(window ? { pageWindow: window === "all" ? null : window } : {})}
      names={{ person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") }}
      headline={{ measure: "repeats", also: ["calls", "same_data_repeats"] }}
      rowNoun="call"
      countMeasure="calls"
      location="Administration › Tool re-fetch"
      dataAttributes={{ "data-tool-refetch-explorer": "platform" }}
    />
  );
}
