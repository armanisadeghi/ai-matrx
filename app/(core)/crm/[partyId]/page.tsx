import { Contact } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { PartyRecordPage } from "@/features/crm/components/record/PartyRecordPage";

/** /crm/[partyId] — one party's 360° record page. */
export default async function CrmPartyRoute({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="CRM"
        route={`/crm/${partyId}`}
        description="Sign in to view this person or company record."
        icon={Contact}
      />
    );
  }

  return <PartyRecordPage partyId={partyId} />;
}
