"use client";

/**
 * One trigger's runs: cost, turns, models and the door to each run, by seat.
 * Own table (not the Costs tab's) because the run link is seat-aware: an org
 * admin gets the org-scoped run page, never the owner-only workflow-run page.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  AUTOMATION_COST_WINDOW_DAYS,
  conversationHref,
  fetchAutomationRuns,
  type AutomationRunCost,
} from "@/features/scheduling/service/automationCosts";
import { triggerRunHref } from "@/features/scheduling/service/workflowTriggers";

export function TriggerRunsTable({
  triggerId,
  seat,
  orgSlug,
}: {
  triggerId: string;
  seat: "admin" | "org";
  orgSlug?: string;
}) {
  const { format } = useCostDisplay();
  const [runs, setRuns] = useState<AutomationRunCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchAutomationRuns("workflow_trigger", triggerId)
      .then((r) => live && setRuns(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [triggerId]);

  const columns: MatrxColumnDef<AutomationRunCost>[] = [
    {
      id: "run_at",
      accessorKey: "run_at",
      header: "When",
      filter: "date",
      width: 120,
      cell: (r) => <span className="text-xs" title={r.run_at}>{humanizeRelative(r.run_at)}</span>,
    },
    { id: "status", accessorKey: "status", header: "Status", filter: "select", width: 100 },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost",
      filter: "number",
      width: 100,
      cell: (r) => (
        <span className={`tabular-nums text-xs ${r.cost > 1 ? "font-semibold text-red-600" : ""}`}>{format(r.cost)}</span>
      ),
    },
    {
      id: "turns",
      accessorKey: "turns",
      header: "Turns",
      filter: "number",
      width: 80,
      cell: (r) => (
        <span className={`tabular-nums text-xs ${r.turns > 20 ? "font-semibold text-red-600" : ""}`}>{r.turns}</span>
      ),
    },
    {
      id: "models",
      header: "Models",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 200,
      cell: (r) =>
        r.turns === 0 && r.models.length === 0 ? (
          <span className="text-xs text-muted-foreground">No AI calls</span>
        ) : (
          <span className="block truncate text-xs" title={r.models.join(", ")}>{r.models.join(", ") || "—"}</span>
        ),
    },
    {
      id: "open",
      header: "Open",
      accessorFn: (r) => r.workflow_run_id ?? r.run_id,
      filter: false,
      sortable: false,
      width: 150,
      cell: (r) => {
        const href = triggerRunHref(seat, orgSlug, triggerId, r);
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            {href && (
              <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> {seat === "admin" ? "Workflow run" : "Run"}
              </Link>
            )}
            {r.conversation_id &&
              (seat === "org" ? (
                <EntityRef token="conversation" id={r.conversation_id} name="Conversation" />
              ) : (
                <Link href={conversationHref(r.conversation_id, seat)} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Conversation
                </Link>
              ))}
          </div>
        );
      },
    },
  ];

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error}
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }
  return (
    <MatrxDataTable
      data={runs}
      columns={columns}
      getRowId={(r) => r.run_id}
      isLoading={loading}
      defaultSort={{ id: "run_at", direction: "desc" }}
      emptyState={{ title: `No runs in ${AUTOMATION_COST_WINDOW_DAYS} days` }}
      frameHeight="content"
    />
  );
}
