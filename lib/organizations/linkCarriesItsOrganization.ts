/**
 * A link this platform emails names the organization it belongs to — ONE rule, ONE engine.
 *
 * 🚨 **THE DEFECT.** Lane TAILS-3, 2026-09-21: a person arriving COLD — from an
 * email, from a text, from a chip in a fresh session — lands on "Select an
 * organization first" instead of the thing the link names. The link is right.
 * Nothing in it says which organization it is about, and the app cannot guess.
 *
 * 🚨 **WHY THIS MODULE CONTAINS NO RULE.** TAILS-4 put the rule where every NOTICE
 * arrives (a BEFORE trigger on `communication.notification.deep_link`) and LINKS-2
 * put it where every assist chip and every actionable DM arrives (BEFORE triggers on
 * `platform.assists.action` and `communication.dm_messages.action_data`). The mailers
 * in this repo have no row at all: `lib/email/notificationService.ts` and the
 * share/feedback API routes build a `${baseUrl}/…` string and hand it straight to
 * resend, so there is no column for a trigger to sit on. They CALL the same one rule
 * instead — `platform.link_carries_its_organization`, with
 * `platform.organization_free_link_prefixes()` as its one list of routes that must not
 * be stamped — exactly as the Python spine does
 * (aidream `services/notifications/organization_links.py`).
 *
 * A second implementation here, in TypeScript, would be the fourth copy of a rule this
 * platform has gotten wrong every single time it was written twice. It would also be
 * the copy nobody tests: the email body and the notice row would disagree, and a person
 * would follow the wrong one.
 *
 * **A failed call returns the link unchanged and says so loudly.** It does NOT fall
 * back to a local copy. Nothing else about the email changes, and no notice is lost
 * because a link could not be decorated.
 *
 * Reached as `service_role` over PostgREST. `platform.link_carries_its_organization`
 * reads its own off switch through `platform.knob_resolve`, which needs SELECT on
 * `platform.feature_knob`; that grant is
 * `aidream/db/migrations/campaign/links2_the_server_key_may_read_the_knob_register.sql`.
 *
 * The guard is `aidream/scripts/check_links_carry_their_organization.py`
 * (`check:links-carry-their-organization`): it exercises the live rule and censuses
 * every emitter in both repos, and a hand-built link that does not pass through this
 * module is counted as a hole.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";

/**
 * The query key every AI Matrx surface reads an organization from. Not a new
 * convention: `/hr` has used it since 2026-08-28 and the app's org-selection primitive
 * honours it (`lib/organizations/linkOrganization.ts`).
 */
export const ORGANIZATION_QUERY_KEY = "org";

/**
 * `link`, naming `organizationId` — or unchanged, and never wrong.
 *
 * Unchanged when there is no link, no organization to name, the link already names one,
 * its route is declared organization-free, or the knob
 * `communication/notice_link_names_its_organization` is off. An absolute URL is handed
 * to the rule with its origin removed and put back afterwards, because every mailer in
 * this repo builds `${baseUrl}/path` and the rule — correctly — refuses to touch a
 * string it cannot prove is one of our own routes.
 */
export async function linkCarriesItsOrganization(
  link: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<string> {
  if (!link) return link ?? "";
  if (!organizationId) return link;

  // Split `https://app.example/notes/abc?x=1` into origin + `/notes/abc?x=1`. The rule
  // only ever stamps an in-app PATH; an absolute URL is not ours to touch and it would
  // return this string unchanged, so the origin is removed here and restored below.
  let origin = "";
  let path = link;
  const scheme = link.indexOf("://");
  if (scheme > 0) {
    const slash = link.indexOf("/", scheme + 3);
    if (slash < 0) return link; // an origin with no path — nothing to stamp
    origin = link.slice(0, slash);
    path = link.slice(slash);
  } else if (!link.startsWith("/")) {
    return link;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .schema("platform")
      .rpc("link_carries_its_organization", {
        p_link: path,
        p_organization_id: organizationId,
      });
    if (error) throw error;
    if (typeof data !== "string" || data.length === 0) return link;
    return origin + data;
  } catch (error) {
    console.error(
      "[linkCarriesItsOrganization] platform.link_carries_its_organization failed for " +
        `${link} (organization ${organizationId}) — the email goes out with the link its ` +
        "producer wrote, so a reader who follows it cold lands on the organization " +
        "picker instead of the thing it names. This is the whole defect TAILS-4 closed " +
        "for notices; fix the call, never add a local copy of the rule.",
      error,
    );
    return link;
  }
}
