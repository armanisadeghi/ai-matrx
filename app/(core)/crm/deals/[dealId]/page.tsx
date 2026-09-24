import { Handshake } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { DealRecordPage } from "@/features/crm/components/deals/DealRecordPage";

/** /crm/deals/[dealId] — one deal's record page. */
export default async function CrmDealRoute({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Deals"
        route={`/crm/deals/${dealId}`}
        description="Sign in to view this deal."
        icon={Handshake}
      />
    );
  }

  return <DealRecordPage dealId={dealId} />;
}
