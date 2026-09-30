"use client";

// features/administration/kg-cost/components/KgCostExplorer.tsx — KNOWLEDGE INGESTION'S UNIT ECONOMICS
// AS A MOUNT OF THE ONE EXPLORER (lane DRILL-CONVERSIONS, program DRILL-FINISH decision 21).
//
// The KG cost dashboard's "Unit economics — per-run ledger" section, as questions of the declared
// definition `kg_cost` (aidream apps/shared/records/scripts/drill-definitions/kg_cost.drill.ts) over
// rag.ingest_run, asked in the platform lane (admin apps only). Built beside the old section (COPY
// mode): the dashboard links here and keeps its own section until every row of "what the old section
// did better" in PROGRESS-DRILL-CONVERSIONS is adopted. Budgets, pending batches, batch detail and NER
// coverage stay on the dashboard — an operations queue, not analytics.

import AppLink from "@/components/navigation/AppLink";
import type { DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";

export const KG_COST_SOURCE: DrillSource = { kind: "entity", token: "kg_cost" };

/** The first screen: the old section's table — the last 30 days by source kind, costliest first. */
export const KG_COST_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["source_kind"],
  // the old table's money columns and its unit economics: the projection, the cache-hit rate and the
  // enrichment multiplier; "What a successful run costs" (a built-in view) holds p50 / p90 / max / cost
  // per 1,000 characters, which the old section counted over successful runs only
  show: ["runs", "cost", "embedding_cost", "extraction_cost", "enrichment_cost", "cache_hit_rate", "enrichment_multiplier"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

// WORDS COME FROM THE DEFINITION AND THE DOOR (lane DRILL-GAPS): the source kinds, statuses, "started
// by" and urgency codes read as kg_cost's declared choices, an organization as the door's own label.
// A person's name is the one thing the door does not carry (the person registry has no title a member
// may read), so it comes from the platform's names door.

export function KgCostExplorer() {
  return (
    <DrillExplorer
      source={KG_COST_SOURCE}
      lane="platform"
      organizationId={SYSTEM_ORGANIZATION_ID}
      title="Knowledge ingestion cost"
      rootLabel="Every ingest run"
      firstQuestion={KG_COST_FIRST_QUESTION}
      names={{ person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") }}
      headline={{ measure: "cost", also: ["runs", "monthly_projection", "monthly_projection_10x", "embedding_saved"] }}
      rowNoun="run"
      countMeasure="runs"
      location="Administration › Knowledge ingestion cost"
      dataAttributes={{ "data-kg-cost-explorer": "" }}
      headerExtras={
        <AppLink href="/administration/knowledge/kg-cost" className="underline-offset-2 hover:underline">
          KG cost dashboard
        </AppLink>
      }
    />
  );
}
