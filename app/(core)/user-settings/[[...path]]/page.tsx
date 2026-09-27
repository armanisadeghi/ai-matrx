import { SettingsTabContent } from "@/features/settings/route-shell/SettingsTabContent";
import {
  SETTINGS_BASE,
  urlToTabId,
} from "@/features/settings/route-shell/routing";
import { SettingsPresentationProvider } from "@/features/settings/components/SettingsPresentationContext";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { SettingsPhoneTitle } from "@/features/settings/route-shell/SettingsPhoneTitle";

/**
 * Catch-all settings tab route. Resolves `params.path` (e.g.
 * `["general", "notifications"]`) into the matching registry tab id and
 * renders it through the existing `SettingsTabHost` (Suspense + breadcrumb +
 * error boundary all reused).
 */
export default async function SettingsTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ control?: string | string[] }>;
}) {
  const { path } = await params;
  const { control } = await searchParams;
  const tabId = urlToTabId(path);
  const focusControlId = typeof control === "string" ? control : undefined;

  return (
    <SettingsPresentationProvider
      presentation="route"
      focusControlId={focusControlId}
    >
      {/* Below lg there is no settings sidebar, so the header names the page. */}
      <PageHeader mobile={<SettingsPhoneTitle />} />
      <SettingsTabContent tabId={tabId || null} basePath={SETTINGS_BASE} />
    </SettingsPresentationProvider>
  );
}
