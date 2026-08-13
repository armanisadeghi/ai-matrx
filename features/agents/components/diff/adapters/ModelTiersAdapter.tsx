"use client";

import { Layers3 } from "lucide-react";
import type {
  EnrichmentContext,
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";
import {
  ModelTierIdentityList,
  readModelTierIdentities,
} from "@/features/agents/components/model-tiers/ModelTierIdentityList";

function ModelTiersDiffRenderer({ node }: FieldDiffProps) {
  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
      <div className="border-r border-border" />
      <div className="border-r border-border px-3 py-2">
        <ModelTierIdentityList value={node.oldValue} showId />
      </div>
      <div className="px-3 py-2">
        <ModelTierIdentityList value={node.newValue} showId />
      </div>
    </div>
  );
}

function summarizeTiers(value: unknown, enrichment?: EnrichmentContext) {
  const identities = readModelTierIdentities(value);
  if (identities.length === 0) return "none";
  return identities
    .map(({ role, modelId }) => {
      const name = enrichment?.resolveModelId(modelId);
      return `${role}: ${name ?? `Unknown AI model (${modelId})`}`;
    })
    .join(", ");
}

export const ModelTiersAdapter: FieldAdapter = {
  label: "Model Tiers",
  icon: Layers3,
  renderDiff: ModelTiersDiffRenderer,
  toSummaryText: (node, enrichment) =>
    `${summarizeTiers(node.oldValue, enrichment)} → ${summarizeTiers(node.newValue, enrichment)}`,
};
