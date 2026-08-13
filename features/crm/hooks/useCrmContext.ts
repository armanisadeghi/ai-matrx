"use client";

// features/crm/hooks/useCrmContext.ts
//
// Resolve the caller's CrmQueryContext (identity + org memberships) ONCE per
// mount. Extracted from usePartyList so every CRM surface (list, duplicates
// review, assists producer) shares the same resolution instead of re-rolling
// the org fetch.

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getUserOrganizations } from "@/features/organizations/service";
import type { CrmQueryContext } from "../types";

export function useCrmContext(): CrmQueryContext | null {
  const userId = useAppSelector(selectUserId);
  const [ctx, setCtx] = useState<CrmQueryContext | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const orgs = await getUserOrganizations();
        if (cancelled) return;
        const orgNames: Record<string, string> = {};
        for (const org of orgs) orgNames[org.id] = org.name;
        setCtx({ userId, orgIds: orgs.map((o) => o.id), orgNames });
      } catch (e) {
        if (!cancelled) {
          console.error("[crm] failed to load org memberships:", e);
          // Identity alone still serves "mine" + "public".
          setCtx({ userId, orgIds: [], orgNames: {} });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return ctx;
}
