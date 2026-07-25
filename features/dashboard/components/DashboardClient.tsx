"use client";

// DashboardClient — the redesigned core dashboard.
//
// Lean by design: a greeting, the engagement metrics that signal momentum, a
// few "start something" actions, the user's own pinned favorites, and a
// rotating Discover strip that surfaces a different corner of the platform over
// time. The old wall of every-nav-link tiles is gone — navigation lives in the
// shell sidebar; this page is a hub, not a launcher.
//
// Surface runtime: this component is the emitter for `matrx-user/dashboard`
// (`features/surfaces/manifests/dashboard.manifest.ts`). The data hooks live
// HERE (not in the sections) so the Run-time scope reads the same live values
// the page renders — metrics via React Query (cached, no double fetch), pins
// via Redux, and the Discover rotation lifted and passed down as props.

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createDashboardScope } from "@/features/surfaces/manifests/dashboard.manifest";
import { usePinned } from "@/components/favorites/usePinned";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { useDiscoverRotation } from "../hooks/useDiscoverRotation";
import { DISCOVER_POOL } from "../constants/discover";
import { QUICK_ACTIONS } from "../dashboard.config";
import { DashboardGreeting } from "./DashboardGreeting";
import { MetricsStrip } from "./MetricsStrip";
import { QuickActions } from "./QuickActions";
import { PinnedSection } from "./PinnedSection";
import { DiscoverSection, DISCOVER_WINDOW_SIZE } from "./DiscoverSection";

export function DashboardClient() {
  const { metrics, isLoading, isError } = useDashboardMetrics();
  const { favorites } = usePinned();
  const rotation = useDiscoverRotation(DISCOVER_POOL, DISCOVER_WINDOW_SIZE);

  const getScope = () => {
    // Honest metrics: emit them only once the RPC has resolved — a loading or
    // errored dashboard must never report fabricated zeros as real counts.
    const metricsReady = !isLoading && !isError;
    return createDashboardScope({
      pinned_items: favorites.map((f) => ({
        id: f.id,
        kind: f.kind,
        label: f.label,
        href: f.href,
      })),
      pinned_count: favorites.length,
      quick_actions: QUICK_ACTIONS.map((a) => ({
        label: a.label,
        href: a.href,
      })),
      discover_items: rotation.items.map((d) => ({
        label: d.label,
        href: d.href,
        description: d.description,
      })),
      ...(metricsReady
        ? {
            metrics: { ...metrics },
            agents_count: metrics.agents,
            conversations_count: metrics.conversations,
            knowledge_files_count: metrics.knowledge_files,
            published_apps_count: metrics.published_apps,
            notes_count: metrics.notes,
            tasks_count: metrics.tasks,
            transcripts_count: metrics.transcripts,
            scopes_count: metrics.scopes,
            shortcuts_count: metrics.shortcuts,
            research_reports_count: metrics.research_reports,
            podcasts_count: metrics.podcasts,
            messages_count: metrics.messages,
          }
        : {}),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/dashboard"
      getScope={getScope}
      isEditable={false}
    >
      <div className="h-full overflow-y-auto bg-background pb-8">
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-8 pt-[calc(var(--shell-header-h)+1.5rem)] md:px-6">
          <DashboardGreeting />
          <MetricsStrip />
          <QuickActions />
          <PinnedSection />
          <DiscoverSection items={rotation.items} showMore={rotation.showMore} />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

export default DashboardClient;
