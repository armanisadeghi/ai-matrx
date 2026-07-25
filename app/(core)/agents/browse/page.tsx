import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";
import { AgentBrowsePage } from "@/features/agents/browse/components/AgentBrowsePage";

/**
 * /agents/browse — the canonical feature-entry list, proven on agents.
 *
 * Deliberately a NEW route beside /agents/all rather than a rewrite of it:
 * /agents/all keeps working untouched while this one is iterated on. Once this
 * shape is settled it becomes the reusable list shell every feature adopts.
 *
 * No SSR seed on purpose. The list is scope-driven and server-paginated, so a
 * seed fetched before the user's scope/sort/page is known would be thrown away
 * — which is exactly what /agents/all does today (it seeds 30 rows, marks the
 * store "succeeded", then immediately re-fetches and shows a skeleton over
 * data it already had).
 */
export default async function AgentsBrowseRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return (
    <>
      <PageHeader>
        <AgentsListHeader />
      </PageHeader>
      <AgentBrowsePage />
    </>
  );
}
