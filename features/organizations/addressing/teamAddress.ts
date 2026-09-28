/**
 * features/organizations/addressing/teamAddress.ts
 *
 * WHERE A TEAM OPENS, given only its id.
 *
 * A team (`iam.team`) has no page of its own — it is managed on its
 * ORGANIZATION's settings page (Manage > Teams), addressed by the
 * organization, not by the team's id
 * (`DOORLESS_REASONS.LIVES_UNDER_ITS_ORGANIZATION`,
 * `features/scopes/registry/listed-entity-doors.ts`). A caller that holds
 * only a team id — the common case for `EntityRef`, an audit row, a refusal
 * sentence — cannot build that address without first learning the team's
 * organization.
 *
 * `getTeamOrganizationId` (teamsService.ts) is the one client-callable read
 * (`iam.team` grants SELECT to nobody the client can be); this module adds
 * the two properties a door resolver needs on top of it:
 *
 *   CACHED — an id resolves once per page load. A team's organization cannot
 *            change under the user, and a MISS (deleted / not visible to this
 *            caller) is cached too, so a broken id is not re-asked forever.
 *   HONEST — a miss never falls back to a guessed link. `useTeamHref` reports
 *            it as a refusal with a sentence, never a route that 404s.
 */

import { getTeamOrganizationId } from "@/features/organizations/service/teamsService";

/** `null` means "resolved, and there is no organization to reach through this id". */
export type TeamAddressResult = string | null;

const cache = new Map<string, TeamAddressResult>();
const inFlight = new Map<string, Promise<TeamAddressResult>>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Already-known answer, or `undefined` when this id has never been resolved. */
export function peekTeamOrganizationId(id: string): TeamAddressResult | undefined {
  return cache.get(id);
}

/** Seed the cache from a row the caller already holds — removes the read entirely. */
export function seedTeamOrganizationId(teamId: string, organizationId: string): void {
  cache.set(teamId, organizationId);
}

/** Test seam: forget everything. Never called by app code. */
export function __resetTeamAddressCache(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Resolve one team id to its organization id.
 *
 * Returns the cached/in-flight answer synchronously when available, a Promise
 * otherwise. A malformed id resolves to `null` with no round trip.
 */
export function resolveTeamOrganizationId(
  id: string,
): Promise<TeamAddressResult> | TeamAddressResult {
  if (!id || !UUID_RE.test(id)) return null;
  const cached = cache.get(id);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(id);
  if (existing) return existing;

  const promise = getTeamOrganizationId(id)
    .then((organizationId) => {
      cache.set(id, organizationId);
      return organizationId;
    })
    .catch((err) => {
      // LOUD: a failed resolve must not silently become a guessed href. Leave
      // the id uncached so a later render retries, and report a miss for now
      // — the UI refuses honestly instead of linking to the wrong org.
      console.error(
        "[team-address] LOUD: could not resolve a team's organization; the " +
          "team link will refuse rather than guess. Team id:",
        id,
        err,
      );
      return null;
    })
    .finally(() => {
      inFlight.delete(id);
    });

  inFlight.set(id, promise);
  return promise;
}

/** The org settings page's Teams section, deep-linked to open this team's row. */
export function teamOrgSettingsHref(organizationId: string, teamId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}/settings?team=${encodeURIComponent(teamId)}#teams`;
}

/**
 * The synchronous, always-valid team address — `/teams/id/<id>` — for any
 * caller that holds nothing but an id: the entity registry's `hrefFor`, and
 * what `useTeamHref` hands back itself while its own resolution is still in
 * flight, so a link never has to wait before it is clickable (same shape as
 * `/agents/go/<id>`, `app/(core)/teams/id/[teamId]/page.tsx`).
 */
export function teamIdResolverHref(teamId: string): string {
  return `/teams/id/${encodeURIComponent(teamId)}`;
}

export function unresolvedTeamReason(teamId: string): string {
  return (
    `Team ${teamId} is not one you can see: it does not exist, or it ` +
    `belongs to an organization you are not in.`
  );
}
