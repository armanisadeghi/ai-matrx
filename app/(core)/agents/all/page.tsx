import { Webhook } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { AgentsGrid } from "@/features/agents/components/agent-listings/AgentsGrid";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";
import { UnauthSurfaceLanding } from "@/features/auth/components/UnauthSurfaceLanding";

/**
 * `/agents/all` — the authenticated Agents gallery. `/agents` itself is
 * the public marketing landing; sidebar nav points here directly so
 * authed users skip the landing on every visit.
 *
 * Guests who deep-link straight to `/agents/all` (rare — the link is not
 * advertised) get a compact `UnauthSurfaceLanding` rather than a marketing
 * landing, because the marketing surface lives one URL up.
 */
export default async function AgentsGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
