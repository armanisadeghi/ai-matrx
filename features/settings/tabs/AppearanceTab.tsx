"use client";

import { Palette, Sun } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useActiveSettingsTabId } from "../components/SettingsTabHost";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "../universal/UniversalSettingsPane";
import {
  ACCENT_THEME_OPTIONS,
  DASHBOARD_LAYOUT_OPTIONS,
  HEADER_LAYOUT_OPTIONS,
  SIDEBAR_LAYOUT_OPTIONS,
  THEME_MODE_OPTIONS,
  WINDOW_MODE_OPTIONS,
  type ThemeMode,
} from "../agent-writable-settings";

export const TABLE_DENSITY_KNOB_KEY = "tables.density.mode";

function TableDensitySettings() {
  const settings = useUniversalSettings();
  const density = settings.knobByKey(TABLE_DENSITY_KNOB_KEY);
  const registerConsulted =
    !settings.isLoading && !settings.error && Boolean(settings.organizationId);

  return (
    <>
      <SettingsSubHeader
        title="Density"
        description="Set how compact shared data tables appear."
        icon={Palette}
      />
      {settings.isLoading && (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Reading your table density…" />
        </div>
      )}
      {settings.error && (
        <SettingsCallout tone="error" title="Table density could not be read">
          {settings.error}
        </SettingsCallout>
      )}
      {!settings.isLoading && !settings.error && !settings.organizationId && (
        <SettingsCallout tone="info" title="Choose an organization first">
          Table density is set for the organization selected in the app header.
        </SettingsCallout>
      )}
      {registerConsulted && !density && (
        <SettingsCallout tone="error" title="Table density is missing from the register">
          The canonical tables.density.mode setting could not be resolved, so no
          preference control is shown.
        </SettingsCallout>
      )}
      {density && (
        <UniversalSettingsRows knobs={[density]} hideKey />
      )}
    </>
  );
}

export default function AppearanceTab() {
  const activeTabId = useActiveSettingsTabId();
  const [mode, setMode] = useSetting<ThemeMode>("theme.mode");
  const [theme, setTheme] = useSetting<string>("userPreferences.display.theme");
  const [dashboardLayout, setDashboardLayout] = useSetting<string>(
    "userPreferences.display.dashboardLayout",
  );
  const [sidebarLayout, setSidebarLayout] = useSetting<string>(
    "userPreferences.display.sidebarLayout",
  );
  const [headerLayout, setHeaderLayout] = useSetting<string>(
    "userPreferences.display.headerLayout",
  );
  const [windowMode, setWindowMode] = useSetting<string>(
    "userPreferences.display.windowMode",
  );

  if (activeTabId === "appearance.density") return <TableDensitySettings />;

  return (
    <>
      <SettingsSubHeader
        title="Appearance"
        description="Theme, layout, and window presentation."
        icon={Palette}
      />

      <SettingsSection title="Theme" icon={Sun}>
        <SettingsSelect<ThemeMode>
          label="Color mode"
          description="Use your device setting, light, or dark. Applies before first paint and syncs across tabs."
          value={mode}
          onValueChange={setMode}
          options={THEME_MODE_OPTIONS}
        />
        <SettingsSelect
          label="Accent theme"
          description="Custom color scheme overlays."
          value={theme}
          onValueChange={setTheme}
          options={ACCENT_THEME_OPTIONS}
          last
        />
      </SettingsSection>

      <SettingsSection title="Layout">
        <SettingsSelect
          label="Dashboard layout"
          value={dashboardLayout}
          onValueChange={setDashboardLayout}
          options={DASHBOARD_LAYOUT_OPTIONS}
        />
        <SettingsSelect
          label="Sidebar"
          value={sidebarLayout}
          onValueChange={setSidebarLayout}
          options={SIDEBAR_LAYOUT_OPTIONS}
        />
        <SettingsSelect
          label="Header"
          value={headerLayout}
          onValueChange={setHeaderLayout}
          options={HEADER_LAYOUT_OPTIONS}
        />
        <SettingsSelect
          label="Window mode"
          value={windowMode}
          onValueChange={setWindowMode}
          options={WINDOW_MODE_OPTIONS}
          last
        />
      </SettingsSection>

      <SettingsCallout tone="info">
        Your color mode is saved and applied before the page loads. Layout
        preferences are saved for your next visit.
      </SettingsCallout>
    </>
  );
}
