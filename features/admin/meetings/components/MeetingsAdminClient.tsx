"use client";

// Users & Access › Communications › Meetings — the platform Meetings admin page.
//
// Four tabs, each over the platform's own stores (no parallel store anywhere):
//   Usage      communication.meet_admin_usage — totals + per organization
//   History    communication.meet_admin_meetings — every meeting, searchable
//   Settings   the `meet` feature knobs in the ONE knob register (defaults +
//              per-organization overrides via "All levels")
//   Retention  platform.retention_policy rows that govern Meet data
//
// The admin seat never acts as itself: there is no Mine / My org filter here;
// the organization filter is a platform scope over every organization.
// `?tab=` names the tab; `?org=` carries an organization into History.

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureKnobsPanel } from "@/features/admin/limits/components/FeatureKnobsPanel";
import { MeetingsUsagePanel } from "./MeetingsUsagePanel";
import { MeetingsHistoryPanel } from "./MeetingsHistoryPanel";
import { MeetingsRetentionPanel } from "./MeetingsRetentionPanel";

const TABS = ["usage", "history", "settings", "retention"] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null | undefined): value is Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

export function MeetingsAdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const requested = searchParams?.get("tab");
  const tab: Tab = isTab(requested) ? requested : "usage";
  const orgFilter = searchParams?.get("org") ?? null;

  const go = (next: { tab: Tab; org?: string | null }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next.tab);
    if (next.org !== undefined) {
      if (next.org) params.set("org", next.org);
      else params.delete("org");
    }
    startTransition(() => router.replace(`?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <Tabs value={tab} onValueChange={(value) => isTab(value) && go({ tab: value })} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Meetings</h2>
          <TabsList className="h-8">
            <TabsTrigger className="h-7 px-3 text-xs" value="usage">Usage</TabsTrigger>
            <TabsTrigger className="h-7 px-3 text-xs" value="history">History</TabsTrigger>
            <TabsTrigger className="h-7 px-3 text-xs" value="settings">Settings</TabsTrigger>
            <TabsTrigger className="h-7 px-3 text-xs" value="retention">Retention</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="usage" className="mt-2 flex min-h-0 flex-1 flex-col">
          <MeetingsUsagePanel onOpenOrganization={(orgId) => go({ tab: "history", org: orgId })} />
        </TabsContent>
        <TabsContent value="history" className="mt-2 flex min-h-0 flex-1 flex-col">
          <MeetingsHistoryPanel organizationId={orgFilter} onOrganizationChange={(orgId) => go({ tab: "history", org: orgId })} />
        </TabsContent>
        <TabsContent value="settings" className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <FeatureKnobsPanel feature="meet" />
        </TabsContent>
        <TabsContent value="retention" className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <MeetingsRetentionPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
