import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { teamOrgSettingsHref } from "@/features/organizations/addressing/teamAddress";

/**
 * /teams/id/[teamId] — THE ALWAYS-VALID TEAM ADDRESS.
 *
 * A team (`iam.team`) has no page of its own — it is managed on its
 * ORGANIZATION's settings page (Manage > Teams), addressed by the
 * organization, not by the team's id
 * (`DOORLESS_REASONS.LIVES_UNDER_ITS_ORGANIZATION`,
 * features/scopes/registry/listed-entity-doors.ts). A caller holding only a
 * team id cannot build that address; this route can, because it runs server
 * side with the RPC that resolves it (`public.team_organization_id` — `iam.team`
 * grants SELECT to nobody the client can be, so this is the one read).
 *
 * This is the entity registry's `hrefFor("team")` — the synchronous door
 * every non-EntityRef consumer gets for free, and the one `EntityRef` itself
 * falls back to while its own client-side resolution
 * (`features/organizations/addressing/useTeamHref`) is still in flight, the
 * same shape as `/agents/go/<id>` and `/mandates/id/<id>`.
 */
export default async function TeamIdResolverPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc(
    "team_organization_id",
    { p_team_id: teamId },
  );

  if (organizationId) redirect(teamOrgSettingsHref(organizationId, teamId));

  // NOTHING FAILS SILENTLY. The RPC's own refusal sentence ("That team is not
  // one you can see…") covers both "does not exist" and "not in that
  // organization" — the access gate reads it rather than a second guess here.
  if (error) {
    console.error(
      "[team-address] LOUD: /teams/id could not resolve a team id; the " +
        "user is being told the truth rather than sent to a guessed org.",
      { teamId, error },
    );
  }

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="team"
        id={teamId}
        error={
          error
            ? {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              }
            : undefined
        }
        fallbackHref="/organizations"
        fallbackLabel="Your organizations"
      />
    </div>
  );
}
