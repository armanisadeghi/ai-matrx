// app/(core)/marketing/outreach/page.tsx
//
// The Marketing pillar's front door to outreach. The product itself lives at
// /crm/* (campaigns, inbox, chasebox, sending identities) and on each site's
// backlinks workspace (prospecting); this route is how a user exploring
// Marketing reaches it — never a second console (outreach-system.md §7).

import { Suspense } from "react";
import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { OutreachFrontDoor } from "@/features/marketing/front-doors/OutreachFrontDoor";

export const metadata: Metadata = {
  title: "Outreach",
  description:
    "Link and PR prospecting, sequenced contact, and earned-placement tracking — the way into every outreach surface.",
};

export default function MarketingOutreachPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center pr-14">
          <h1 className="truncate text-sm font-medium text-foreground">
            Outreach
          </h1>
        </div>
      </PageHeader>
      {/* The site selector reads `?site=` on the client. */}
      <Suspense fallback={<LoadingSurface label="Loading outreach…" />}>
        <OutreachFrontDoor />
      </Suspense>
    </>
  );
}
