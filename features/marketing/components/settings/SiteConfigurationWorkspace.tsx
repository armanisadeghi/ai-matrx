"use client";

import { Suspense } from "react";

import { SiteAccessWorkspace } from "@/features/marketing/components/access/SiteAccessWorkspace";
import { SiteIntegrationsWorkspace } from "@/features/marketing/components/integrations/SiteIntegrationsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteSettingsWorkspace } from "@/features/marketing/components/settings/SiteSettingsWorkspace";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import type { MarketingSiteSettingsView } from "@/features/marketing/lib/routes";
import { SiteIntakeWizard } from "@/features/marketing/search-console/intake/SiteIntakeWizard";

/**
 * One Settings section, six linkable views, no duplicated configuration lane.
 *
 * The views are ROUTES in the agency tree (`settings`, `settings/integrations`,
 * `settings/intake`, `settings/access`), so each route mounts this ONE renderer
 * with its fixed `view`. `view` is omitted only by hosts that still switch on
 * `?view=`, which is what the sub-view hook reads.
 */
export function SiteConfigurationWorkspace({
  view: fixedView,
}: {
  view?: MarketingSiteSettingsView;
}) {
  const subView = useMarketingSubView("settings");
  const view = fixedView ?? subView;

  if (view === "integrations") return <SiteIntegrationsWorkspace />;
  if (view === "access-users") return <SiteAccessWorkspace view="users" />;
  if (view === "access-organizations") {
    return <SiteAccessWorkspace view="organizations" />;
  }
  if (view === "access-public") return <SiteAccessWorkspace view="public" />;
  if (view === "intake") {
    return (
      <Suspense fallback={<LoadingSurface label="Loading site intake…" />}>
        <SiteIntakeWizard />
      </Suspense>
    );
  }
  return <SiteSettingsWorkspace />;
}
