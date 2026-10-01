"use client";

// features/admin/usage-drill/UsageGrainExplorers.tsx — THE OTHER TWO GRAINS OF AI USAGE, EACH A MOUNT
// OF THE ONE EXPLORER (lane DRILL-PRESETS-RETIRE; PROGRESS-DRILL-FINISH decisions 12, 13, 24).
//
//   /administration/usage?def=ai_calls             `ai_calls` — one row per MODEL CALL (chat.request): the CX usage
//                                     tab's cuts are its built-in Saved views (cx_by_model, cx_by_provider,
//                                     cx_by_day, cx_by_origin, cx_cost_share, cx_latency), latency kept
//   /administration/usage?def=ai_usage_executions  `ai_usage_executions` — the ledger one row per EXECUTION: the Spend
//                                     page's conversation / sign-in session cuts, its most expensive
//                                     requests and six of its seven "dig here" signals (the findings)
//
// Both are counted live (no rollup, so no Recount); ids read through the same names door as
// /administration/usage, in the platform organization (the admin seat never acts as itself).

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import type { DrillSibling } from "@/components/official/drill-explorer/drillSiblings";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

import { usageNameResolvers } from "./useUsageDrill";

type GrainProps = { siblings?: readonly DrillSibling[]; groupLabel?: string; surfaceName?: string };

export function AiCallsExplorer({ siblings, groupLabel, surfaceName }: GrainProps = {}) {
  const organizationId = SYSTEM_ORGANIZATION_ID;
  return (
    <DrillExplorer
      source={{ kind: "entity", token: "ai_calls" }}
      lane="platform"
      organizationId={organizationId}
      title="AI model calls"
      rootLabel="All model calls"
      names={usageNameResolvers(organizationId)}
      headline={{ measure: "cost", also: ["calls"] }}
      rowNoun="call"
      countMeasure="calls"
      location="Administration › AI model calls"
      dataAttributes={{ "data-usage-calls-explorer": "" }}
      siblings={siblings}
      groupLabel={groupLabel}
      surfaceName={surfaceName}
    />
  );
}

export function AiUsageExecutionsExplorer({ siblings, groupLabel, surfaceName }: GrainProps = {}) {
  const organizationId = SYSTEM_ORGANIZATION_ID;
  return (
    <DrillExplorer
      source={{ kind: "entity", token: "ai_usage_executions" }}
      lane="platform"
      organizationId={organizationId}
      title="AI spend by execution"
      rootLabel="All executions"
      names={usageNameResolvers(organizationId)}
      headline={{ measure: "cost", also: ["calls", "distinct_requests"] }}
      rowNoun="execution"
      countMeasure="calls"
      location="Administration › AI spend by execution"
      dataAttributes={{ "data-usage-executions-explorer": "" }}
      siblings={siblings}
      groupLabel={groupLabel}
      surfaceName={surfaceName}
    />
  );
}
