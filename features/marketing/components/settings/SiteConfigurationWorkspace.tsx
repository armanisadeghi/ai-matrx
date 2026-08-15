"use client";

import { Suspense } from "react";

import { SiteAccessWorkspace } from "@/features/marketing/components/access/SiteAccessWorkspace";
import { SiteIntegrationsWorkspace } from "@/features/marketing/components/integrations/SiteIntegrationsWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteSettingsWorkspace } from "@/features/marketing/components/settings/SiteSettingsWorkspace";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import { SiteIntakeWizard } from "@/features/marketing/search-console/intake/SiteIntakeWizard";

/** One Settings section, six linkable views, no duplicated configuration lane. */
export function SiteConfigurationWorkspace() {
  const view = useMarketingSubView("settings");

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
