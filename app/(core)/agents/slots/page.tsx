import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { SlotsHeader } from "@/features/agents/slots/components/SlotsHeader";
import { SlotOverridesPage } from "@/features/agents/slots/components/SlotOverridesPage";

/**
 * /agents/slots — which agent (and which settings) runs each system step.
 *
 * The user/org-facing half of the Agent Slots system: browse slots, see the
 * resolved agent with provenance, and override per-user or per-org (agent
 * swap or settings-only). Admin pin management lives at
 * /administration/agents/slots. System-of-record:
 * common-docs/systems/agent-slots/FEATURE.md.
 */
export default async function AgentSlotsRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return (
    <>
      <PageHeader>
        <SlotsHeader />
      </PageHeader>
      <SlotOverridesPage />
    </>
  );
}
