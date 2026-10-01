"use client";

// features/admin/usage-drill/UsageExplorer.tsx — THE USAGE PAGE: A MOUNT OF THE ONE EXPLORER
// (lane DRILL-USAGE-PAGE built it; lane DRILL-EXPLORER moved the screen into
// components/official/drill-explorer, so usage, CX usage, KG cost and workflow runs share it).
//
// Today's usage screens — usage by person, the Spend Explorer's cuts, cx-dashboard's model /
// provider / day — are each ONE question of the declared definition `ai_usage`, asked through the
// one read door in the platform lane. What only usage adds: the names of people, organizations and
// agents (`platform.ai_usage_names`) and the rollup's own freshness and Recount. The calls behind a
// number are the definition's records (DrillRecords); the old users usage page, the Spend Explorer
// and the CX usage tab were retired onto this screen's built-in Saved views (lane
// DRILL-PRESETS-RETIRE, THE FLIP).

import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import type { DrillReconcileSpec } from "@/components/official/drill-explorer/useDrillReconcile";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

import { useRouter, useSearchParams } from "next/navigation";

import type { DrillSibling } from "@/components/official/drill-explorer/drillSiblings";
import { pushAppHref } from "@/lib/deployment/navigate";

import { ADMIN_AI_USAGE_SURFACE_NAME } from "@/features/surfaces/manifests/admin-ai-usage.manifest";

import { AiCallsExplorer, AiUsageExecutionsExplorer } from "./UsageGrainExplorers";
import { USAGE_DEFINITIONS, usageDefinitionOf, usageSiblings } from "./usageLinks";
import { USAGE_SOURCE, usageNameResolvers, useUsageFreshness } from "./useUsageDrill";

/** The first screen: everyone's spend in the last 30 days, by person, costliest first (the definition's own default). */
export const USAGE_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["person"],
  show: ["cost", "requests", "tokens_in", "tokens_out"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

export const USAGE_RECONCILE = {
  source: { kind: "entity", token: "ai_calls" },
  measure: "cost",
  shared: ["organization", "person", "agent", "at"],
} as const satisfies DrillReconcileSpec;

export function UsageExplorer() {
  // ONE SCREEN, THREE GRAINS (lane DRILL-PRESETS-RETIRE): `def=` picks the definition; each mount is
  // keyed by it, so switching starts the explorer fresh on the other definition's address.
  const params = useSearchParams();
  const router = useRouter();
  const go = (href: string) => pushAppHref(router, href);
  const definition = usageDefinitionOf(new URLSearchParams(params.toString()));
  // THE PAGE'S SURFACE (lane DRILL-FLIP-FIXES L4): every grain hands its question and answer to `matrx-admin/ai-usage`
  if (definition === "ai_calls")
    return <AiCallsExplorer key="ai_calls" siblings={usageSiblings("ai_calls", go)} groupLabel={USAGE_DEFINITIONS.ai_calls} surfaceName={ADMIN_AI_USAGE_SURFACE_NAME} />;
  if (definition === "ai_usage_executions")
    return (
      <AiUsageExecutionsExplorer
        key="ai_usage_executions"
        siblings={usageSiblings("ai_usage_executions", go)}
        groupLabel={USAGE_DEFINITIONS.ai_usage_executions}
        surfaceName={ADMIN_AI_USAGE_SURFACE_NAME}
      />
    );
  return <AiUsageHourlyExplorer key="ai_usage" siblings={usageSiblings("ai_usage", go)} />;
}

function AiUsageHourlyExplorer({ siblings }: { siblings: readonly DrillSibling[] }) {
  // THE PLATFORM LANE ASKS IN THE PLATFORM'S OWN ORGANIZATION. The door needs an organization only
  // to know whose calendar cuts the periods; the admin seat never acts as itself (no active-org
  // dependency in admin), and the platform organization's calendar is UTC — the rollup's own hours.
  // org-fallback-deliberate: the platform lane of the admin usage drill is the platform's own organization by design, never a substitute for a selection
  const organizationId = SYSTEM_ORGANIZATION_ID;
  const freshness = useUsageFreshness(organizationId);
  return (
    <DrillExplorer
      source={USAGE_SOURCE}
      lane="platform"
      organizationId={organizationId}
      timeZone="UTC"
      title="AI usage"
      rootLabel="All usage"
      firstQuestion={USAGE_FIRST_QUESTION}
      names={usageNameResolvers(organizationId)}
      headline={{ measure: "cost", also: ["calls", "requests"] }}
      freshness={freshness}
      rowNoun="request"
      countMeasure="requests"
      location="Administration › AI usage"
      // THE RECONCILIATION (decisions 12, 29; W2-3): the ledger's spend against the model calls' cost,
      // same window and filters. Only ids and periods mean the same thing in both (their model and
      // provider words differ), so only those crumbs carry across; any other is said.
      reconcile={USAGE_RECONCILE}
      windowAlign="hour"
      dataAttributes={{ "data-usage-explorer": "" }}
      siblings={siblings}
      groupLabel={USAGE_DEFINITIONS.ai_usage}
      surfaceName={ADMIN_AI_USAGE_SURFACE_NAME}
    />
  );
}

