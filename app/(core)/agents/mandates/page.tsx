import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MandatesHeader } from "@/features/agents/mandates/components/MandatesHeader";
import { MandateOverridesPage } from "@/features/agents/mandates/components/MandateOverridesPage";

/**
 * /agents/mandates — which agent (and which settings) runs each system step.
 *
 * The user/org-facing half of the Mandates system: browse mandates, see the
 * resolved agent with provenance, and override per-user or per-org (agent
 * swap or settings-only). Admin pin management lives at
 * /administration/agents/mandates. System-of-record:
 * common-docs/systems/mandates/FEATURE.md.
 */
export default async function MandatesRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <MandateOverridesPage />
    </>
  );
}
