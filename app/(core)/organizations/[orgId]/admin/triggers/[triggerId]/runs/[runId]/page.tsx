"use client";

/**
 * Org admin › one run of one trigger: when, status, cost, turns, models and the
 * conversation. Reads scheduler.automation_cost_runs, which refuses anyone who
 * is not this organization's admin — so every org admin can open it, unlike the
 * owner-only workflow-run page.
 * Route: /organizations/[orgId]/admin/triggers/[triggerId]/runs/[runId]
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { fetchAutomationRuns, type AutomationRunCost } from "@/features/scheduling/service/automationCosts";
import { triggerManagerHref } from "@/features/scheduling/service/workflowTriggers";

function RunDetail({ orgSlug, triggerId, runId }: { orgSlug: string; triggerId: string; runId: string }) {
  const { format } = useCostDisplay();
  const [run, setRun] = useState<AutomationRunCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchAutomationRuns("workflow_trigger", triggerId, 90)
      .then((rs) => live && setRun(rs.find((r) => r.run_id === runId) ?? null))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [triggerId, runId]);

  const rows: [string, React.ReactNode][] = run
    ? [
        ["When", run.run_at],
        ["Status", run.status ?? "unknown"],
        ["Cost", format(run.cost)],
        ["Turns", String(run.turns)],
        ["Models", run.models.join(", ") || "No AI calls"],
        ["Mandates", run.mandates.join(", ") || "—"],
        [
          "Conversation",
          run.conversation_id ? (
            <EntityRef token="conversation" id={run.conversation_id} name="Conversation" />
          ) : (
            "None"
          ),
        ],
      ]
    : [];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4 md:p-6">
      <Link
        href={triggerManagerHref(orgSlug)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Triggers
      </Link>
      <h1 className="text-lg font-semibold">Trigger run</h1>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading run
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : !run ? (
        <div className="text-sm text-muted-foreground">No run with this id for this trigger in the last 90 days.</div>
      ) : (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function OrgTriggerRunPage() {
  const params = useParams();
  return (
    <OrgAdminBoundary orgIdParam={params.orgId as string}>
      {({ organization }) => (
        <RunDetail
          orgSlug={organization.slug}
          triggerId={params.triggerId as string}
          runId={params.runId as string}
        />
      )}
    </OrgAdminBoundary>
  );
}
