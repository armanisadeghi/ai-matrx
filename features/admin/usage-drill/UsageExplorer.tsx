"use client";

// features/admin/usage-drill/UsageExplorer.tsx — THE USAGE PAGE: A MOUNT OF THE ONE EXPLORER
// (lane DRILL-USAGE-PAGE built it; lane DRILL-EXPLORER moved the screen into
// components/official/drill-explorer, so usage, CX usage, KG cost and workflow runs share it).
//
// Today's usage screens — usage by person, the Spend Explorer's cuts, cx-dashboard's model /
// provider / day — are each ONE question of the declared definition `ai_usage`, asked through the
// one read door in the platform lane. What only usage adds: the names of people, organizations and
// agents (`platform.ai_usage_names`), the rollup's own freshness and Recount, the Spend Explorer as
// the place the calls behind a number open, and a link back to the old page.
//
// Built side by side with the old pages (COPY mode): nothing links here but the old page's
// "Try the new usage page", and nothing of theirs changed.

import AppLink from "@/components/navigation/AppLink";
import { parseDimensionRef, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

import { USAGE_SOURCE, usageNameResolvers, useUsageFreshness } from "./useUsageDrill";

/** The first screen: everyone's spend in the last 30 days, by person, costliest first (the definition's own default). */
export const USAGE_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["person"],
  show: ["cost", "requests", "tokens_in", "tokens_out"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

export function UsageExplorer() {
  // THE PLATFORM LANE ASKS IN THE PLATFORM'S OWN ORGANIZATION. The door needs an organization only
  // to know whose calendar cuts the periods; the admin seat never acts as itself (no active-org
  // dependency in admin), and the platform organization's calendar is UTC — the rollup's own hours.
  const organizationId = SYSTEM_ORGANIZATION_ID;
  const freshness = useUsageFreshness(organizationId);
  return (
    <DrillExplorer
      source={USAGE_SOURCE}
      lane="platform"
      organizationId={organizationId}
      title="AI usage"
      rootLabel="All usage"
      firstQuestion={USAGE_FIRST_QUESTION}
      names={usageNameResolvers(organizationId)}
      headline={{ measure: "cost", also: ["calls", "requests"] }}
      freshness={freshness}
      recordsLink={{ href: spendHref, lead: "The calls behind a number open in the", label: "Spend Explorer" }}
      rowNoun="hourly total"
      dataAttributes={{ "data-usage-explorer": "" }}
      headerExtras={
        <AppLink href="/administration/users/usage" className="underline-offset-2 hover:underline">
          Old usage page
        </AppLink>
      }
    />
  );
}

/**
 * "See these records" for AI usage: the rollup holds no single calls, so the calls behind the
 * current trail open in the Spend Explorer, which lists them — its `f.<dimension>` filters are the
 * same grammar (person is its `user`). Once `ai_usage` declares records (program DRILL-FINISH
 * decision 24), the explorer reads them through `platform.drill_rows` instead and this link goes.
 */
export function spendHref(question: MatrxDrillQuestion): string {
  const params = new URLSearchParams();
  const map: Record<string, string> = { person: "user", organization: "organization", agent: "agent", app: "app", feature: "feature", origin: "origin", trigger: "trigger", source: "source", model: "model" };
  for (const w of question.where) {
    const key = map[parseDimensionRef(w.dim).key];
    if (key) params.set(`f.${key}`, w.value ?? "(none)");
  }
  params.set("win", question.window === "7d" ? "last7d" : question.window === "24h" ? "last24h" : "last30d");
  return `/administration/billing/spend?${params.toString()}`;
}
