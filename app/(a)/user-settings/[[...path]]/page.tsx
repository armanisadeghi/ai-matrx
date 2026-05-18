import { SettingsTabContent } from "@/features/settings/route-shell/SettingsTabContent";
import { SETTINGS_BASE, urlToTabId } from "@/features/settings/route-shell/routing";

/**
 * Catch-all settings tab route. Resolves `params.path` (e.g.
 * `["general", "notifications"]`) into the matching registry tab id and
 * renders it through the existing `SettingsTabHost` (Suspense + breadcrumb +
 * error boundary all reused).
 */
export default async function SettingsTabPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const tabId = urlToTabId(path);

  return (
    <SettingsTabContent
      tabId={tabId || null}
      basePath={SETTINGS_BASE}
    />
  );
}
