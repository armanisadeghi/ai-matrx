"use client";

// features/mandates/member-list/OrgMandateCreateRefusal.tsx
//
// A MEMBER on /organizations/<org>/mandates/new. Creating the organization's
// own mandates is for its owners and admins, so the form is absent — but the
// page is never a dead end (access is personal; UI register "no dead ends"):
// the route's header, one way to ask the people who can, and a real door to
// making one of your own.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { RequestAccess } from "@/features/access-gate/components/RequestAccess";
import { newSoftMandateHref, orgMandateListHref } from "./routes";

export function OrgMandateCreateRefusal({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center gap-1">
            <ChevronLeftTapButton href={orgMandateListHref(orgId)} ariaLabel="All mandates" />
            <span className="truncate text-sm font-medium">New mandate for {orgName}</span>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 pb-16 pt-[calc(var(--shell-header-h)+1.5rem)] sm:px-6">
        <RequestAccess
          target={{
            action: "Create mandates",
            resource: { kind: "Organization", name: orgName, type: "organization", id: orgId },
            owner: { organizationId: orgId, organizationName: orgName },
            manageHref: `/organizations/${encodeURIComponent(orgId)}/settings/mandates`,
          }}
          reason={`Only the owners and admins of ${orgName} can create its mandates.`}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            You can make one of your own right now. It is yours alone until you share it.
          </p>
          <Button asChild size="sm" variant="outline" className="h-8 gap-1">
            <Link href={newSoftMandateHref("person")}>
              Create a personal mandate
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
