"use client";

// DashboardClient — the redesigned core dashboard.
//
// Lean by design: a greeting, the engagement metrics that signal momentum, a
// few "start something" actions, the user's own pinned favorites, and a
// rotating Discover strip that surfaces a different corner of the platform over
// time. The old wall of every-nav-link tiles is gone — navigation lives in the
// shell sidebar; this page is a hub, not a launcher.

import { DashboardGreeting } from "./DashboardGreeting";
import { MetricsStrip } from "./MetricsStrip";
import { QuickActions } from "./QuickActions";
import { PinnedSection } from "./PinnedSection";
import { DiscoverSection } from "./DiscoverSection";

export function DashboardClient() {
  return (
    <div className="overflow-y-auto bg-background pb-8 ">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-12 md:px-6 md:py-14">
        <DashboardGreeting />
        <MetricsStrip />
        <QuickActions />
        <PinnedSection />
        <DiscoverSection />
      </div>
    </div>
  );
}

export default DashboardClient;
