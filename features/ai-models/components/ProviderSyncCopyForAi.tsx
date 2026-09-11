"use client";

/**
 * Provider-sync copy actions — the canonical `CopyButtons` pair at three
 * granularities (row / provider / page). Every AI menu carries the shipped
 * status variants and the copy-subset door ("Filter & sort before copying…"),
 * which opens the provider's comparison rows in an isolated table so the
 * user can shape exactly the subset they want (e.g. "OpenAI rows missing
 * from the DB, sorted by release date") without touching the dashboard.
 */

import { AlertTriangle, Ban, Check, Layers, ListTree } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import type {
  CopySubsetColumn,
  CopySubsetSource,
} from "@/components/agent-copy/copy-subset/types";
import { useCopySubsetVariant } from "@/components/agent-copy/copy-subset/useCopySubsetVariant";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import type {
  ProviderSyncComparison,
  ProviderSyncSummaryInput,
} from "@/features/ai-models/utils/providerSyncComparison";
import {
  buildProviderSyncPagePayload,
  buildProviderSyncProviderPayload,
  buildProviderSyncRowPayload,
  buildProviderSyncSubsetPayload,
  PROVIDER_SYNC_AI_LOCATION,
  providerSyncComparisonRecord,
  type ProviderSyncPageExport,
  type ProviderSyncStatusFilter,
} from "@/features/ai-models/utils/serializeProviderSyncForAi";

const PROVIDER_STATUS_VARIANTS: {
  filter: Exclude<ProviderSyncStatusFilter, "all">;
  label: string;
  hint: string;
  icon: typeof ListTree;
}[] = [
  {
    filter: "matched",
    label: "Matched",
    hint: "Provider models already in our DB",
    icon: Check,
  },
  {
    filter: "missing_local",
    label: "Not in DB",
    hint: "Provider models missing from our registry",
    icon: AlertTriangle,
  },
  {
    filter: "extra_local",
    label: "Extra / deprecated",
    hint: "DB models not returned by the provider API",
    icon: Layers,
  },
  {
    filter: "excluded",
    label: "Excluded",
    hint: "Intentionally ignored provider models",
    icon: Ban,
  },
];

/** One row per comparison, with the provider named — the subset table's shape. */
export type ProviderSyncSubsetRow = {
  provider: string;
  comparison: ProviderSyncComparison;
};

/** The columns the copy-subset table shows for provider-sync rows. */
export const PROVIDER_SYNC_SUBSET_COLUMNS: CopySubsetColumn<ProviderSyncSubsetRow>[] =
  [
    { id: "model", header: "Model", accessorFn: (r) => r.comparison.display_name },
    { id: "id", header: "Provider id", accessorFn: (r) => r.comparison.id },
    { id: "provider", header: "Provider", accessorKey: "provider" },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => r.comparison.status,
      filter: "select",
    },
    {
      id: "released",
      header: "Released",
      accessorFn: (r) => r.comparison.providerEntry?.created_at ?? null,
    },
    {
      id: "db_name",
      header: "DB name",
      accessorFn: (r) => r.comparison.localEntry?.common_name ?? null,
    },
    {
      id: "deprecated",
      header: "Deprecated",
      accessorFn: (r) =>
        r.comparison.localEntry ? Boolean(r.comparison.localEntry.is_deprecated) : null,
      filter: "boolean",
    },
    {
      id: "type",
      header: "Type",
      accessorFn: (r) => r.comparison.providerEntry?.type ?? null,
      hidden: true,
    },
  ];

function subsetSource(
  label: string,
  rows: ProviderSyncSubsetRow[],
): CopySubsetSource<ProviderSyncSubsetRow> {
  return {
    label,
    location: PROVIDER_SYNC_AI_LOCATION,
    kind: "provider-sync-models",
    rows,
    columns: PROVIDER_SYNC_SUBSET_COLUMNS,
    getRowId: (row) => `${row.provider}:${row.comparison.id}`,
    serializer: (shaped, _columns, meta) =>
      buildProviderSyncSubsetPayload(label, shaped, meta),
  };
}

export function ProviderSyncRowCopyForAiButton({
  comparison,
  providerName,
}: {
  comparison: ProviderSyncComparison;
  providerName: string | null;
}) {
  return (
    <CopyForAiButton
      label={comparison.display_name}
      size="icon"
      compact
      icon={CopyForAiIcon}
      agent={() => buildProviderSyncRowPayload(comparison, providerName)}
    />
  );
}

export function ProviderSyncProviderCopyForAiMenu({
  summary,
  comparisons,
  disabled = false,
}: {
  summary: ProviderSyncSummaryInput;
  comparisons: ProviderSyncComparison[];
  disabled?: boolean;
}) {
  const copySubset = useCopySubsetVariant();
  const providerName = summary.name ?? summary.id;
  const rows = () =>
    comparisons.map((comparison) => ({ provider: providerName, comparison }));

  const statusVariants: AiVariant[] = PROVIDER_STATUS_VARIANTS.map(
    ({ filter, label, hint, icon }) => ({
      id: filter,
      label,
      hint,
      icon,
      section: "ai",
      successMessage: `${providerName} — ${label} copied for AI`,
      build: () => buildProviderSyncProviderPayload(summary, comparisons, filter),
    }),
  );

  return (
    <CopyButtons
      size="icon"
      label={`${providerName} models`}
      disabled={disabled || comparisons.length === 0}
      json={() => comparisons.map((c) => providerSyncComparisonRecord(c))}
      agent={() => buildProviderSyncProviderPayload(summary, comparisons, "all")}
      agentVariant={{
        label: "All models",
        hint: "Every row for this provider",
      }}
      aiVariants={[
        ...statusVariants,
        copySubset(() => subsetSource(`${providerName} models`, rows())),
      ]}
      export={{
        items: [
          jsonExportItem(() =>
            comparisons.map((c) => providerSyncComparisonRecord(c)),
          ),
          csvExportItem(
            () => comparisons.map((c) => providerSyncComparisonRecord(c)),
            "CSV",
          ),
        ],
      }}
    />
  );
}

export function ProviderSyncPageCopyForAiButton({
  exports,
  disabled = false,
}: {
  exports: ProviderSyncPageExport[];
  disabled?: boolean;
}) {
  const copySubset = useCopySubsetVariant();
  const synced = exports.filter((e) => e.comparisons.length > 0);
  const rows = () =>
    synced.flatMap(({ summary, comparisons }) =>
      comparisons.map((comparison) => ({
        provider: summary.name ?? summary.id,
        comparison,
      })),
    );

  return (
    <CopyButtons
      size="sm"
      label="Provider sync dashboard"
      disabled={disabled || synced.length === 0}
      json={() => rows().map((row) => providerSyncComparisonRecord(row.comparison, row.provider))}
      agent={() => buildProviderSyncPagePayload(synced)}
      agentVariant={{ label: "Whole dashboard", hint: "Every provider, every row" }}
      aiVariants={[copySubset(() => subsetSource("Provider sync dashboard", rows()))]}
      export={{
        items: [
          jsonExportItem(() =>
            rows().map((row) =>
              providerSyncComparisonRecord(row.comparison, row.provider),
            ),
          ),
          csvExportItem(
            () =>
              rows().map((row) =>
                providerSyncComparisonRecord(row.comparison, row.provider),
              ),
            "CSV",
          ),
        ],
      }}
    />
  );
}
