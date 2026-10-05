import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { WorkflowBattlePage } from "@/features/workflow-comparison/components/WorkflowBattlePage";

/**
 * /workflows/battle — Workflow Battle: run 2–6 workflows head-to-head on one
 * locked input set, watch every arm live, judge blind, record the verdict.
 * The workflow twin of /agents/battle. Feature: features/workflow-comparison.
 */
export default async function WorkflowBattleRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/workflows");

  return (
    <>
      <RecordPageHeader record={{ name: "Workflow Battle" }} />
      <WorkflowBattlePage />
    </>
  );
}
