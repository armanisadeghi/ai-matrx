import { cache } from "react";
import { Contact } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { PartyRecordPage } from "@/features/crm/components/record/PartyRecordPage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How long the tab-title read may take before the generic title is used. */
const METADATA_READ_MS = 1500;

const GENERIC = {
  title: "CRM record",
  description: "A person or company in your CRM.",
  letter: "CR",
} as const;

/**
 * The record's name and kind, read ONCE per request as the person (RLS) and
 * shared by the tab title and the header title — so the header's name is in
 * the first server HTML instead of popping in when the client read lands.
 * BOUNDED: a slow database must never hold the page's render (and so become a
 * platform 504) for a title. Past the limit, or on any failure, it is null and
 * the body resolves the record; it never claims the record is gone — the
 * body's AccessGate says why.
 */
const readPartyHeading = cache(
  async (
    partyId: string,
  ): Promise<{ name: string; kind: string | null } | null> => {
    if (!UUID_RE.test(partyId)) return null;
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .schema("crm")
        .from("party")
        .select("display_name, party_kind")
        .eq("id", partyId)
        .abortSignal(AbortSignal.timeout(METADATA_READ_MS))
        .maybeSingle();
      return data?.display_name
        ? { name: data.display_name, kind: data.party_kind ?? null }
        : null;
    } catch {
      return null;
    }
  },
);

/**
 * The tab leads with the record's own name ("Cloud Codes — AI Matrx"), never
 * the module name — ten open records must be told apart in the tab strip.
 * An empty or failed read falls back to a generic title.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  const heading = await readPartyHeading(partyId);
  if (!heading) return createDynamicRouteMetadata("/crm", GENERIC);
  return createDynamicRouteMetadata("/crm", {
    title: heading.name,
    description: `${heading.kind === "person" ? "Person" : "Company"} record in your CRM.`,
    letter: "CR",
  });
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

  const heading = await readPartyHeading(partyId);
  return <PartyRecordPage partyId={partyId} initialHeading={heading} />;
}
