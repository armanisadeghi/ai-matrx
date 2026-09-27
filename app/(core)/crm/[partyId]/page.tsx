import { Contact } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { PartyRecordPage } from "@/features/crm/components/record/PartyRecordPage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC = {
  title: "CRM record",
  description: "A person or company in your CRM.",
  letter: "CR",
} as const;

/**
 * The tab leads with the record's own name ("Cloud Codes — AI Matrx"), never
 * the module name — ten open records must be told apart in the tab strip.
 * The read runs as the person (RLS); an empty or failed read falls back to a
 * generic title and never claims the record is gone — the body's AccessGate
 * says why.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  if (!UUID_RE.test(partyId)) {
    return createDynamicRouteMetadata("/crm", GENERIC);
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("crm")
      .from("party")
      .select("display_name, party_kind")
      .eq("id", partyId)
      .maybeSingle();
    if (!data?.display_name) return createDynamicRouteMetadata("/crm", GENERIC);
    return createDynamicRouteMetadata("/crm", {
      title: data.display_name,
      description: `${data.party_kind === "person" ? "Person" : "Company"} record in your CRM.`,
      letter: "CR",
    });
  } catch {
    // Metadata is cosmetic; the page body surfaces any real read failure.
    return createDynamicRouteMetadata("/crm", GENERIC);
  }
}

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
