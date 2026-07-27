// app/(core)/agents/all/page.tsx
//
// Authenticated Agents gallery. The marketing landing lives one URL up at
// `/agents` — guests are bounced there server-side instead of seeing a
// compact in-place card. One canonical guest entry point per surface; no
// icons or other non-serializable JSX cross the server→client boundary.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { getAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { AgentsGrid } from "@/features/agents/components/agent-listings/AgentsGrid";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";

export default async function AgentsGalleryPage() {
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
