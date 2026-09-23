// lib/organizations/linkOrganizationAdmission.ts — LANE HUB-FIX (VERIFIER-15 H4)
//
// "IS THIS PERSON LET INTO THAT ORGANIZATION BY A SHARE?" — asked only after a link's
// `?org=` has already failed the membership check.
//
// 🚨 THE FALSE SENTENCE THIS CLOSES. test@test.com accepted a share of Rincon Plumbing
// Co — Ojai Branch's Jobs table and pressed "Open Jobs". The owner's table rendered
// correctly — and over it, an error toast said: "This link is for an organization you
// are not a member of … nothing was opened and you were not moved." Both halves were
// false: the table WAS open, because the grant she had just accepted is what admits her
// (`custom.portal_admits`, arm 2). The link judge knew only memberships, so a person the
// store had deliberately let in was told she had been refused.
//
// THE RULE. A share admits; it never makes a member. So an admitted organization is
// neither "honoured" (nobody is MOVED into an organization they are not in) nor
// "refused" (the page opens it, as that organization's guest). It is its own silent
// outcome, `admitted`, and the page says whose table it is (`useSharedTable`'s banner).
//
// THE AUTHORITY is the store's own door, `custom.tables_shared_with_me()`, which answers
// only about the person signed in: live grants on a Table of an organization they are
// not a member of, and whether that organization's outside door is still open (`opens`).
// A failed read answers `false` — the ordinary refusal stands, exactly as before.

import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export async function admittedToOrganizationByAShare(organizationId: string): Promise<boolean> {
  try {
    // The store's own switch, for the organization being asked about. Off or
    // unreadable means the share cannot open anything there, so it admits nothing.
    const gate = await UNIFIED_DATA_CAMPAIGN.check(organizationId);
    if (gate.state !== "on") return false;
    // `custom` is not in the generated `Database` type (the record store's doors
    // are reached through `@ai-matrx/records`' own seam everywhere else), so the
    // one call is typed here, narrowly, rather than by widening the client.
    const store = createClient() as unknown as {
      schema: (name: "custom") => {
        rpc: (fn: "tables_shared_with_me") => Promise<{ data: unknown; error: unknown }>;
      };
    };
    const { data, error } = await store.schema("custom").rpc("tables_shared_with_me");
    if (error || !Array.isArray(data)) return false;
    return (data as Array<{ organization_id?: string; opens?: boolean }>).some(
      (row) => row.organization_id === organizationId && row.opens === true,
    );
  } catch {
    return false;
  }
}
