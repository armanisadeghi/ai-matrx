import { SiteConfigurationWorkspace } from "@/features/marketing/components/settings/SiteConfigurationWorkspace";
import type { MarketingSiteSettingsView } from "@/features/marketing/lib/routes";

/**
 * Site access. The audience — users, organizations, public — stays a `?view=`
 * because it selects WHICH LIST the one screen shows, not a different screen;
 * `?tab=` is honoured as the legacy alias every marketing surface accepts.
 */
export default async function MarketingSiteAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = query.view ?? query.tab;
  const audience = Array.isArray(raw) ? raw[0] : raw;
  const view: MarketingSiteSettingsView =
    audience === "organizations"
      ? "access-organizations"
      : audience === "public"
        ? "access-public"
        : "access-users";
  return <SiteConfigurationWorkspace view={view} />;
}
