"use client";

// features/mandates/member-list/MandateMemberListPage.tsx
//
// THE NON-ADMIN MANDATE LIST — one component, two seats (the owner's rule:
// "build one proper set, replicate for all; the levels differ very little"):
//
//   level "person"        /mandates/list-preview — Mine · My Orgs · System;
//                         every row answers "what runs this FOR ME" in my
//                         active organization.
//   level "organization"  /organizations/<org>/mandates — My Orgs (this org's
//                         own) · System; every row answers "what runs this for
//                         every member". Members read; owners/admins also
//                         create the org's own soft mandates.
//
// Same canonical `EntityListPage` shell as the admin list
// (../admin-list/MandateAdminListPage.tsx), served by `public.mnd_member_list`.
// The whole query lives in the URL, so Back restores scope, search and filters.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import { memberMandateListConfig } from "./listConfig";
import { newSoftMandateHref } from "./routes";
import { createMandateMemberService } from "./service";
import type { MandateListLevel } from "./types";

export interface MandateMemberListPageProps {
  level: MandateListLevel;
  /** Organization level: the route's organization id (resolved, not a slug). */
  orgId?: string | null;
  orgName?: string | null;
  /** Organization level: the viewer is an owner/admin there. */
  canManageOrg?: boolean;
}

export function MandateMemberListPage({
  level,
  orgId = null,
  orgName = null,
  canManageOrg = false,
}: MandateMemberListPageProps) {
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const [version, setVersion] = useState(0);

  // Any mandate write anywhere re-asks the list.
  useEffect(() => onMandateCacheInvalidated(() => setVersion((v) => v + 1)), []);

  const resolveOrgId = level === "person" ? activeOrgId : null;
  // React Compiler memoizes these; `serviceKey` below is the list's identity.
  const service = createMandateMemberService({
    level,
    organizationId: orgId,
    resolveOrgId,
  });
  const config = memberMandateListConfig({
    level,
    orgId,
    canManageOrg,
    onChanged: () => setVersion((v) => v + 1),
  });

  const ready =
    authReady && Boolean(accessToken) && (level === "person" || Boolean(orgId));

  if (!ready) {
    return (
      <div className="flex h-full flex-col gap-2 p-3" aria-busy="true" aria-label="Loading mandates">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-md bg-muted/60" />
      </div>
    );
  }

  const canCreate = level === "person" || canManageOrg;

  return (
    <EntityListPage
      config={{
        ...config,
        service,
        serviceKey: `${userId ?? ""}:${level}:${orgId ?? ""}:${resolveOrgId ?? ""}:${version}`,
      }}
      defaultScope={
        level === "organization"
          ? { kind: "orgs", organizationId: null }
          : { kind: "system" }
      }
      notice={
        level === "organization" && orgName ? (
          <p className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs text-muted-foreground">
            {canManageOrg ? (
              <>
                A binding set here runs for every member of{" "}
                <span className="font-medium text-foreground">{orgName}</span>. A member&apos;s own
                binding still wins for them.
              </>
            ) : (
              <>
                What runs for every member of{" "}
                <span className="font-medium text-foreground">{orgName}</span>. Only its owners and
                admins can change it.
              </>
            )}
          </p>
        ) : null
      }
      headerActions={
        canCreate ? (
          <Button asChild size="sm" className="h-8 gap-1">
            <Link href={newSoftMandateHref(level, orgId)}>
              <Plus className="h-3.5 w-3.5" />
              New mandate
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
