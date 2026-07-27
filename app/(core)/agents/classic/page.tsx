// app/(core)/agents/classic/page.tsx
//
// The PREVIOUS agents gallery, kept reachable during the cutover to the new
// /agents/all list. Linked only from the dismissible notice on /agents/all.
//
// TEMPORARY — delete this route together with ClassicViewNotice and the
// `display.agentsClassicNoticeDismissed` preference once the grace period ends
// (~mid-August 2026). Nothing new should link here.
//
// Authenticated Agents gallery. The marketing landing lives one URL up at
// `/agents` — guests are bounced there server-side instead of seeing a
// compact in-place card.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { getAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { AgentsGrid } from "@/features/agents/components/agent-listings/AgentsGrid";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";

export default async function AgentsClassicGalleryPage() {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    redirect("/agents");
  }

  const seeds = await getAgentListSeed();

  return (
    <>
      <PageHeader>
        <AgentsListHeader />
      </PageHeader>
      <AgentListHydrator seeds={seeds} />
      <div className="w-full">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          <AgentsGrid />
        </div>
      </div>
    </>
  );
}
