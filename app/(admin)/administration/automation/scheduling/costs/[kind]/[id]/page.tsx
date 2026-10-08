// Scheduling admin › Costs › one automation: its numbers, flags, links and
// every run with cost, turns, models and the conversation / workflow run.
"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  AutomationCostDetail,
  useAutomationCosts,
} from "@/features/scheduling/components/costs/AutomationCostTable";

interface Props {
  params: Promise<{ kind: string; id: string }>;
}

export default function AdminAutomationCostDetailPage({ params }: Props) {
  const { kind, id } = use(params);
  const { rows, loading, error } = useAutomationCosts(null);
  const row = rows.find((r) => r.automation_id === id && r.automation_kind === kind)
    ?? rows.find((r) => r.automation_id === id);

  return (
    <div className="h-full overflow-y-auto px-4 pb-16 pt-4 sm:px-6">
      <Link
        href="/administration/automation/scheduling/costs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Costs
      </Link>
      {loading && !row ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading automation cost
        </div>
      ) : error ? (
        <div className="py-6 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : !row ? (
        <div className="py-6 text-sm text-muted-foreground">
          No automation with this id in the last 30 days.
        </div>
      ) : (
        <>
          <h1 className="mt-2 text-lg font-semibold">{row.name}</h1>
          {row.description && (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
          )}
          <AutomationCostDetail row={row} seat="admin" />
        </>
      )}
    </div>
  );
}
