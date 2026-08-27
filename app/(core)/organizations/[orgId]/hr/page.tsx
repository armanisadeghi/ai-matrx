// D2 / SPEC-UI-IA §6 row 94 — `/organizations/[orgId]/hr`.
//
// The org-workspace door into HR. It matches the sibling org sub-routes exactly
// (`OrgResourceLayout` + a summary strip), and its primary action is
// `/hr?org=[orgId]` — because HR is a TOP-LEVEL module with a required employer
// context, not a resource nested under an org (SPEC-UI-IA §1).
//
// 🚨 THIS PAGE NEVER BECOMES A SECOND HR HOME. If it ever starts listing
// employees, it has forked route 10. It is a strip and a door.
//
// 🚨 MODULE OFF → an owner/admin gets ONE enable door; everyone else gets a
// plain "not enabled here" page with no door they cannot open. Absent, not
// disabled (SPEC-UI-IA §6).

"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { hrHref, hrPeopleHref, hrTasksHref } from "@/features/hr/routes";
import { useHrOrgSummary } from "@/features/hr/entry-points/useHrOrgSummary";

export default function OrgHrPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const { organization, organizationId, role } =
    useResolvedOrganization(orgIdParam);

  const { summary, isLoading, absent } = useHrOrgSummary(organizationId);
  const orgRef = organization?.slug ?? orgIdParam;
  const isSteward = role === "owner" || role === "admin";

  return (
    <OrgResourceLayout resourceName="HR">
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
      ) : absent || !summary ? (
        // No answer for this viewer. A plain page, no door they cannot open.
        <Card className="p-5">
          <p className="text-sm text-foreground">
            HR is not enabled for this organization.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            An owner or administrator can switch it on from this
            organization&apos;s settings.
          </p>
        </Card>
      ) : !summary.module_enabled ? (
        <Card className="p-5">
          <p className="text-sm text-foreground">
            HR is not enabled for this organization.
          </p>
          {isSteward ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                You can switch it on. It gives every person here an employee
                record, a directory, and time and leave.
              </p>
              <Button asChild size="sm" className="mt-3 min-h-11 sm:min-h-9">
                <Link href={`/organizations/${orgRef}/settings#modules`}>
                  Turn HR on
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              An owner or administrator can switch it on.
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <dl className="flex flex-1 flex-wrap gap-6">
                <Stat label="People" value={summary.headcount} />
                {summary.prehire_count > 0 ? (
                  <Stat label="Starting soon" value={summary.prehire_count} />
                ) : null}
                {summary.pending_approvals > 0 ? (
                  <Stat
                    label="Waiting on a decision"
                    value={summary.pending_approvals}
                  />
                ) : null}
              </dl>
              {/* THE PRIMARY ACTION. HR lives at /hr with `?org=`, never here. */}
              <Button asChild className="min-h-11 shrink-0 sm:min-h-9">
                <Link href={hrHref(orgRef)}>
                  <Users className="mr-1.5 h-4 w-4" />
                  Open HR
                </Link>
              </Button>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Link href={hrPeopleHref({ org: orgRef })}>Directory</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Link href={hrTasksHref(orgRef)}>HR tasks</Link>
            </Button>
          </div>
        </div>
      )}
    </OrgResourceLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
