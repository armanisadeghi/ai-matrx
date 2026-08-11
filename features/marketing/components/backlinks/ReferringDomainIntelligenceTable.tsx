"use client";

import { useState } from "react";
import { ExternalLink, Globe2, Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  humanizeAssessmentValue,
  jsonRecord,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useReferringDomainProfiles } from "@/features/marketing/data/backlinks-hooks";
import type { ReferringDomainProfileRow } from "@/features/marketing/data/backlinks-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

const VERDICTS = [
  "valuable",
  "trusted",
  "mixed",
  "low_quality",
  "toxic",
  "unknown",
];

function providerNumber(
  row: ReferringDomainProfileRow,
  key: string,
): number | null {
  const metrics = jsonRecord(row.provider_metrics);
  const value = metrics[key];
  return typeof value === "number" ? value : null;
}

function DomainDetail({
  row,
  onSaved,
}: {
  row: ReferringDomainProfileRow;
  onSaved: () => void;
}) {
  const existing = jsonRecord(row.human_ruling);
  const [verdict, setVerdict] = useState(
    typeof existing.verdict === "string"
      ? existing.verdict
      : (row.opinion_verdict ?? "unknown"),
  );
  const [note, setNote] = useState(
    typeof existing.note === "string" ? existing.note : "",
  );
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const response = await supabase
        .schema("seo")
        .rpc("update_referring_domain_human_ruling", {
          p_profile_id: row.id,
          p_ruling: { verdict, note: note.trim() } as Json,
        });
      if (response.error) throw response.error;
      toast.success("Referring-domain opinion updated.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="h-full overflow-y-auto p-3">
      <a
        href={`https://${row.normalized_domain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Open site <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-border p-2">
          Our score
          <br />
          <b>{row.opinion_score ?? "Awaiting"}</b>
        </div>
        <div className="rounded border border-border p-2">
          Verdict
          <br />
          <b>{humanizeAssessmentValue(row.opinion_verdict)}</b>
        </div>
        <div className="rounded border border-border p-2">
          Site type
          <br />
          <b>{humanizeAssessmentValue(row.domain_type)}</b>
        </div>
        <div className="rounded border border-border p-2">
          Known links
          <br />
          <b>{row.current_backlinks}</b>
        </div>
      </div>
      <p className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-foreground">
        {row.opinion_summary ||
          "Source pages from this domain have not been analyzed yet."}
      </p>
      <section className="mt-3 rounded-md border border-border p-3">
        <p className="text-xs font-semibold text-foreground">
          Your domain opinion
        </p>
        <select
          value={verdict}
          onChange={(event) => setVerdict(event.target.value)}
          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          {VERDICTS.map((value) => (
            <option key={value} value={value}>
              {humanizeAssessmentValue(value)}
            </option>
          ))}
        </select>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Relationship, payment, ownership, or quality context only your team knows…"
          className="mt-2 min-h-24 text-xs"
        />
        <Button
          size="sm"
          className="mt-2"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save opinion
        </Button>
      </section>
    </div>
  );
}

export function ReferringDomainIntelligenceTable({
  siteId,
}: {
  siteId: string;
}) {
  const table = useMarketingTableState({
    defaultSort: { id: "opinion_score", direction: "desc" },
    defaultPageSize: 50,
  });
  const profiles = useReferringDomainProfiles(siteId, table.queryState);
  const rows = profiles.data?.rows ?? [];
  const columns: MatrxColumnDef<ReferringDomainProfileRow>[] = [
    {
      id: "display_domain",
      accessorKey: "display_domain",
      header: "Domain",
      filter: false,
      cell: (row) => (
        <a
          href={`https://${row.normalized_domain}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {row.display_domain} <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      id: "domain_type",
      accessorKey: "domain_type",
      header: "Site type",
      filter: false,
      cell: (row) => (
        <span className="text-xs">
          {humanizeAssessmentValue(row.domain_type)}
        </span>
      ),
    },
    {
      id: "current_backlinks",
      accessorKey: "current_backlinks",
      header: "Links",
      filter: false,
      align: "right",
    },
    {
      id: "opinion_score",
      accessorKey: "opinion_score",
      header: "Our score",
      filter: false,
      align: "right",
      cell: (row) => (
        <span className="font-medium tabular-nums">
          {row.opinion_score ?? "Awaiting"}
        </span>
      ),
    },
    {
      id: "opinion_verdict",
      accessorKey: "opinion_verdict",
      header: "Our verdict",
      filter: "select",
      filterOptions: VERDICTS.map((value) => ({
        value,
        label: humanizeAssessmentValue(value),
      })),
      cell: (row) => (
        <span className="text-xs">
          {humanizeAssessmentValue(row.opinion_verdict)}
        </span>
      ),
    },
    {
      id: "opinion_summary",
      accessorKey: "opinion_summary",
      header: "Why",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="block max-w-96 text-xs text-muted-foreground">
          {row.opinion_summary || "Awaiting source-page analysis"}
        </span>
      ),
    },
    {
      id: "provider_rank",
      header: "Provider rank",
      sortable: false,
      filter: false,
      align: "right",
      accessorFn: (row) => providerNumber(row, "domain_rank") ?? -1,
      cell: (row) => providerNumber(row, "domain_rank") ?? "—",
    },
  ];

  if (profiles.isError) {
    return (
      <InlineQueryError
        what="referring-domain intelligence"
        error={profiles.error}
        onRetry={() => void profiles.refetch()}
      />
    );
  }
  return (
    <MatrxDataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={profiles.isLoading}
      isFetching={profiles.isFetching}
      query={{
        mode: "controlled",
        totalItems: profiles.data?.total ?? 0,
        state: table.state,
        onStateChange: table.onStateChange,
      }}
      toolbar={{ searchPlaceholder: "Search domains, types, or opinions…" }}
      detail={{
        title: (row) => row.display_domain,
        description: (row) =>
          row.opinion_summary || "First-party domain intelligence",
        render: (row) => (
          <DomainDetail row={row} onSaved={() => void profiles.refetch()} />
        ),
      }}
      pageSize={50}
      pageSizeOptions={[25, 50, 100]}
      emptyState={{
        icon: <Globe2 className="h-8 w-8 text-muted-foreground" />,
        title: "No referring domains stored",
        description:
          "Run a backlink refresh to build this first-party source directory.",
      }}
      className="min-h-0 flex-1"
    />
  );
}
