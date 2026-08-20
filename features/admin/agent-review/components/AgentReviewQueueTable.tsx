"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import { loadReviewQueue } from "@/features/admin/agent-review/service";
import {
  EMPTY_REVIEW_REGISTRY,
  loadReviewRegistry,
  type ReviewRegistry,
} from "@/features/admin/agent-review/registry";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";

const FLOW = [
  { statuses: ["submitted"], label: "1. Submitted" },
  { statuses: ["agent_review"], label: "2. Agent review" },
  {
    statuses: ["agent_changes_requested", "human_changes_requested"],
    label: "3. Changes",
  },
  { statuses: ["ready_for_human"], label: "4. Ready for you" },
  { statuses: ["approved"], label: "5. Approved" },
] satisfies Array<{ statuses: ReviewStatus[]; label: string }>;

function domainName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  return registry.domainsById.get(row.domain_id)?.name ?? "Not assigned";
}

function featureName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  if (!row.feature_id) return "Not assigned";
  return registry.featuresById.get(row.feature_id)?.name ?? "Not assigned";
}

export default function AgentReviewQueueTable() {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [registry, setRegistry] = useState<ReviewRegistry>(
    EMPTY_REVIEW_REGISTRY,
  );
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [queue, nextRegistry] = await Promise.all([
        loadReviewQueue(),
        loadReviewRegistry(),
      ]);
      setRows(queue);
      setRegistry(nextRegistry);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review queue failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadReviewQueue(), loadReviewRegistry()])
      .then(([queue, nextRegistry]) => {
        if (!active) return;
        setRows(queue);
        setRegistry(nextRegistry);
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Review queue failed to load");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo<MatrxColumnDef<ReviewQueueRow>[]>(
    () => [
      {
        id: "open",
        header: "Open",
        accessorFn: (row) => row.id,
        sortable: false,
        filter: false,
        width: 92,
        cell: (row) => (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
            <Link href={`/administration/users/agent-review/${row.id}`}>
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ),
      },
      {
        accessorKey: "title",
        header: "Review item",
        href: (row) => `/administration/users/agent-review/${row.id}`,
        cellKind: "text",
        width: 420,
      },
      {
        accessorKey: "status",
        header: "Current step",
        filter: "select",
        filterOptions: REVIEW_STATUSES.map((status) => ({
          value: status,
          label: REVIEW_STATUS_LABELS[status],
        })),
        cell: (row) =>
          REVIEW_STATUS_LABELS[row.status as ReviewStatus] ?? row.status,
        width: 180,
      },
      {
        id: "domain",
        header: "Domain",
        accessorFn: (row) => domainName(row, registry),
        filter: "select",
        cell: (row) => domainName(row, registry),
        width: 170,
      },
      {
        id: "feature",
        header: "Feature",
        accessorFn: (row) => featureName(row, registry),
        filter: "select",
        cell: (row) => featureName(row, registry),
        width: 200,
      },
      {
        accessorKey: "repo_slug",
        header: "Repository",
        filter: "select",
        width: 160,
      },
      {
        accessorKey: "url",
        header: "Target page",
        cellKind: "text",
        cell: (row) => (
          <Link
            href={row.url}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            target="_blank"
          >
            {row.url} <ExternalLink className="h-3 w-3" />
          </Link>
        ),
        width: 260,
        mobileHidden: true,
      },
      {
        accessorKey: "updated_at",
        header: "Last activity",
        filter: "text",
        cell: (row) => new Date(row.updated_at).toLocaleString(),
        width: 180,
        mobileHidden: true,
      },
    ],
    [registry],
  );

  const activeRows = rows.filter((row) => row.status !== "archived");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Agent Review</h1>
          <p className="text-sm text-muted-foreground">
            Agents prepare and verify every item before it reaches you.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>

      <nav aria-label="Agent review workflow" className="flex items-stretch gap-2">
        {FLOW.map((step, index) => {
          const count = activeRows.filter((row) =>
            step.statuses.some((status) => status === row.status),
          ).length;
          return (
            <div key={step.label} className="contents">
              {index > 0 ? (
                <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null}
              <div className="min-w-0 flex-1 rounded-md border bg-card px-3 py-2">
                <div className="text-sm font-medium">{step.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={loading}
          urlState={{
            id: "agent-review",
            defaultSort: { id: "updated_at", direction: "desc" },
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search review items",
          }}
          detail={{ enabled: false }}
          onRowOpen={(row) =>
            router.push(`/administration/users/agent-review/${row.id}`)
          }
          pageSize={25}
          pageSizeOptions={[25, 50, 100]}
          zebra
          mobile="scroll"
          emptyState={{
            title: "No review items match this view",
            description: "Clear a search or column filter to see more items.",
          }}
        />
      </div>
    </div>
  );
}
