"use client";

/**
 * useRecordActors — resolve a row's `created_by` / `updated_by` ids to PEOPLE.
 *
 * THE DOOR LAW's fourth corollary (common-docs/policies/no-dead-ends.md) says
 * never show an id you can't open: resolve it to a name, or don't show it. Row
 * stamps are the most common place that rule was broken — every entity in this
 * platform carries `created_by`/`updated_by`, and every surface that showed
 * them showed a raw uuid.
 *
 * There is no user-directory primitive in this repo (searched: `useUsers*`,
 * `useOrgMembers`, `user-lookup`, `UserIdentity` consumers) — the only resolver
 * is the org-members RPC that `MembersPanel` already uses. This hook is that
 * resolver made reusable, plus the signed-in user from Redux (who is not
 * necessarily a member row of the org that owns the record).
 *
 * Cost control: it fetches NOTHING when the ids are all null — the normal case
 * for server-written rows (an analyzer result, a crawl snapshot), where "no
 * actor" is itself the honest answer ("System").
 */

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectUserEmail,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { getOrganizationMembers } from "@/features/organizations/service";
import type { UserLike } from "@/components/user/UserIdentity";

export interface ResolvedActor {
  id: string;
  /** Non-null once we know who this is; UserIdentity-compatible. */
  user: UserLike | null;
  /** True while the directory read for this org is still in flight. */
  loading: boolean;
}

/**
 * @param organizationId the org that owns the record (its members are the
 *   directory we can legitimately read)
 * @param actorIds the ids to resolve; nulls are ignored
 */
export function useRecordActors(
  organizationId: string | null | undefined,
  actorIds: readonly (string | null | undefined)[],
): (id: string | null | undefined) => ResolvedActor | null {
  const currentUserId = useAppSelector(selectUserId);
  const currentUserEmail = useAppSelector(selectUserEmail);
  const currentUserMetadata = useAppSelector(
    (state) => state.userProfile.userMetadata,
  );
  const wanted = actorIds.filter((id): id is string => Boolean(id));
  const needsDirectory = wanted.length > 0 && Boolean(organizationId);
  const [directory, setDirectory] = useState<Record<string, UserLike>>({});
  const [loading, setLoading] = useState(false);
  // Stable dependency: the SET of ids we need, not the array identity.
  const wantedKey = [...new Set(wanted)].sort().join(",");

  useEffect(() => {
    if (!needsDirectory || !organizationId) return;
    let cancelled = false;
    setLoading(true);
    void getOrganizationMembers(organizationId)
      .then((members) => {
        if (cancelled) return;
        const next: Record<string, UserLike> = {};
        for (const member of members) {
          if (member.user) next[member.user.id] = member.user;
        }
        setDirectory(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsDirectory, organizationId, wantedKey]);

  return (id: string | null | undefined): ResolvedActor | null => {
    if (!id) return null;
    if (currentUserId === id) {
      return {
        id,
        user: {
          id,
          email: currentUserEmail,
          displayName: currentUserMetadata.name ?? currentUserEmail,
          avatarUrl:
            currentUserMetadata.avatarUrl ?? currentUserMetadata.picture,
        },
        loading: false,
      };
    }
    const known = directory[id];
    return { id, user: known ?? null, loading: loading && !known };
  };
}
