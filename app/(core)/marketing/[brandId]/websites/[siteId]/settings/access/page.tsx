import { SiteConfigurationWorkspace } from "@/features/marketing/components/settings/SiteConfigurationWorkspace";
import type { MarketingSiteSettingsView } from "@/features/marketing/lib/routes";

/**
 * Site access. The audience — users or public — stays a `?view=`
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
  // `organizations` is no longer an audience (SHARE-PEOPLE-ONLY, 2026-09-25: a share names a
  // person); an old link lands on the people list.
  const view: MarketingSiteSettingsView =
    audience === "public" ? "access-public" : "access-users";
  return <SiteConfigurationWorkspace view={view} />;
}
