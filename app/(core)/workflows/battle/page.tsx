import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { Swords } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { WorkflowBattlePage } from "@/features/workflow-comparison/components/WorkflowBattlePage";

/**
 * /workflows/battle — Workflow Battle: run 2–6 workflows head-to-head on one
 * locked input set, watch every arm live, judge blind, record the verdict.
 * The workflow twin of /agents/battle. Feature: features/workflow-comparison.
 */
export default async function WorkflowBattleRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/workflows");

  return (
    <>
      <PageHeader>
        <div className="flex w-full items-center gap-2 px-1">
          <Swords className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">
            Workflow Battle
          </h1>
        </div>
      </PageHeader>
      <WorkflowBattlePage />
    </>
  );
}
