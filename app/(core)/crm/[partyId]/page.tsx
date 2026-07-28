import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { PartyRecordPage } from "@/features/crm/components/record/PartyRecordPage";

/** /crm/[partyId] — one party's 360° record page. */
export default async function CrmPartyRoute({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(`/login?next=/crm/${partyId}`);

  return <PartyRecordPage partyId={partyId} />;
}
