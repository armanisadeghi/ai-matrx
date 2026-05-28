import { Webhook } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { AgentsGrid } from "@/features/agents/components/agent-listings/AgentsGrid";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";
import { UnauthSurfaceLanding } from "@/features/auth/components/UnauthSurfaceLanding";

export default async function AgentsListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Skip the SSR data fetch entirely for guests — the landing card replaces
  // the grid, and `agx_get_list` would return zero meaningful rows anyway.
  if (!user) {
    return (
      <UnauthSurfaceLanding
        featureName="Agents"
        icon={Webhook}
        description="Build and run AI agents tailored to your workflows. Compose tools, models, and scopes."
        bullets={[
          "Spin up agents from a template or from scratch",
          "Chain tools, files, and live data sources",
          "Share agents across your team or publicly",
        ]}
      />
    );
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
