"use client";

/**
 * features/organizations/addressing/useTeamHref.ts
 *
 * The React door onto the team address rule (`teamAddress.ts`).
 *
 * A caller passes whatever it holds. If it already has the team's
 * `organizationId` (a row the page fetched itself — e.g. `TeamManagement`,
 * `useOrganizationTeams`), the answer is synchronous and free. If it holds
 * only an id — the common case for `EntityRef` — the hook resolves the
 * organization through the cache and reports `resolving` until it knows.
 */

import { useEffect, useState } from "react";
import {
  peekTeamOrganizationId,
  resolveTeamOrganizationId,
  teamIdResolverHref,
  teamOrgSettingsHref,
  unresolvedTeamReason,
  type TeamAddressResult,
} from "./teamAddress";

export type TeamDoor =
  | { state: "ready"; href: string }
  // `href` here is the synchronous `/teams/id/<id>` resolver — a REAL,
  // working link (it redirects server-side), not a placeholder. Prefetching
  // it would fetch a redirect target that changes the instant resolution
  // lands, so `EntityRef` disables prefetch whenever `resolving` is true.
  | { state: "resolving"; href: string }
  | { state: "unknown"; reason: string };

export interface UseTeamHrefInput {
  /** A team id. */
  id: string | null | undefined;
  /** The team's organization id, when the caller already holds it. */
  organizationId?: string | null;
}

/** Where this team opens — its organization's settings page, Teams section. */
export function useTeamHref({ id, organizationId }: UseTeamHrefInput): TeamDoor {
  const known = organizationId !== undefined && organizationId !== null;

  const [resolved, setResolved] = useState<TeamAddressResult | undefined>(() =>
    id && !known ? peekTeamOrganizationId(id) : undefined,
  );

  useEffect(() => {
    if (!id || known) return;
    const cached = peekTeamOrganizationId(id);
    if (cached !== undefined) {
      setResolved(cached);
      return;
    }
    let live = true;
    const answer = resolveTeamOrganizationId(id);
    if (answer instanceof Promise) {
      void answer.then((value) => {
        if (live) setResolved(value);
      });
    } else {
      setResolved(answer);
    }
    return () => {
      live = false;
    };
  }, [id, known]);

  if (!id) return { state: "unknown", reason: "No team id was supplied." };

  if (known) {
    return organizationId
      ? { state: "ready", href: teamOrgSettingsHref(organizationId, id) }
      : { state: "unknown", reason: unresolvedTeamReason(id) };
  }

  if (resolved === undefined)
    return { state: "resolving", href: teamIdResolverHref(id) };
  if (resolved === null)
    return { state: "unknown", reason: unresolvedTeamReason(id) };
  return { state: "ready", href: teamOrgSettingsHref(resolved, id) };
}
