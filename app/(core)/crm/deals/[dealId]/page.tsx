import { Handshake } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { DealRecordPage } from "@/features/crm/components/deals/DealRecordPage";

/** /crm/deals/[dealId] — one deal's record page. */
export default async function CrmDealRoute({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const { isAuthenticated } = await getServerAuth();
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
