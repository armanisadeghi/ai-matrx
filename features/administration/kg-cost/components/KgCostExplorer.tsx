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
  show: ["runs", "cost", "median_cost", "embedding_saved"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

// KEYS NEVER REACH A PERSON: the codes in plain words (the definition's own choice labels; the
// explorer does not read describe's choices yet — PROGRESS-DRILL-CONVERSIONS).
const SOURCE_KIND_WORDS: Record<string, string> = {
  note: "Note",
  transcript: "Transcript",
  scrape_parsed_page: "Scraped page",
  web_page: "Web page",
  cld_file: "File",
  processed_document: "Processed document",
  inline: "Inline text",
};
const STATUS_WORDS: Record<string, string> = {
  success: "Succeeded",
  skipped: "Skipped",
  error: "Errored",
  partial: "Partly done",
  running: "Still running",
};
const TRIGGER_WORDS: Record<string, string> = {
  save_hook: "Saved by a person",
  landing: "Landed from a source",
  source_intelligence: "Source intelligence",
  backfill: "Backfill",
  manual: "Started by hand",
};
const URGENCY_WORDS: Record<string, string> = { batch: "Batch (cheaper, later)", auto: "Automatic", live: "Live" };

function wordsOf(map: Record<string, string>, empty: string): (value: string) => string {
  return (value) => (value ? map[value] ?? "Another value" : empty);
}

export function KgCostExplorer() {
  return (
    <DrillExplorer
      source={KG_COST_SOURCE}
      lane="platform"
      organizationId={SYSTEM_ORGANIZATION_ID}
      title="Knowledge ingestion cost"
      rootLabel="Every ingest run"
      firstQuestion={KG_COST_FIRST_QUESTION}
      names={{
        organization: usageNameResolver(SYSTEM_ORGANIZATION_ID, "organization"),
        person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person"),
      }}
      words={{
        source_kind: wordsOf(SOURCE_KIND_WORDS, "No source kind"),
        status: wordsOf(STATUS_WORDS, "No status"),
        triggered_by: wordsOf(TRIGGER_WORDS, "Not known"),
        urgency: wordsOf(URGENCY_WORDS, "Not known"),
        embedding_model: (value) => (value ? value : "No embedding (nothing new to embed)"),
      }}
      headline={{ measure: "cost", also: ["runs"] }}
      rowNoun="run"
      countMeasure="runs"
      dataAttributes={{ "data-kg-cost-explorer": "" }}
      headerExtras={
        <AppLink href="/administration/knowledge/kg-cost" className="underline-offset-2 hover:underline">
          KG cost dashboard
        </AppLink>
      }
    />
  );
}
