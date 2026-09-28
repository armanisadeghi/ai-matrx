"use client";

// features/crm/hooks/useCrmContext.ts
//
// Resolve the caller's CrmQueryContext (identity + org memberships) ONCE per
// mount. Extracted from usePartyList so every CRM surface (list, duplicates
// review, assists producer) shares the same resolution instead of re-rolling
// the org fetch.

import { fetchMyTeamReach } from "@/lib/list-scope/teamReach";
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getUserOrganizations } from "@/features/organizations/service";
import type { CrmQueryContext } from "../types";

export function useCrmContext(): CrmQueryContext | null {
  const userId = useAppSelector(selectUserId);
  const [ctx, setCtx] = useState<CrmQueryContext | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [orgs, teamReach] = await Promise.all([
          getUserOrganizations(),
          // A failed team read leaves My team empty rather than breaking the list.
          fetchMyTeamReach(null).catch((e: unknown) => {
            console.error("[crm] failed to read the My team reach:", e);
            return [];
          }),
        ]);
        if (cancelled) return;
        const orgNames: Record<string, string> = {};
        for (const org of orgs) orgNames[org.id] = org.name;
        setCtx({ userId, orgIds: orgs.map((o) => o.id), orgNames, teamReach });
      } catch (e) {
        if (!cancelled) {
          console.error("[crm] failed to load org memberships:", e);
          // Identity alone still serves "mine" + "public" — but the context
          // SAYS the org read failed, so a list never passes "mine" off as
          // everything (RC-B12 r13 catch-then-log census).
          setCtx({
            userId,
            orgIds: [],
            orgNames: {},
            orgMembershipsUnread: true,
            retryOrgMemberships: () => setAttempt((n) => n + 1),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  return ctx;
}
