"use client";

import { Palette, Sun } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import {
  ACCENT_THEME_OPTIONS,
  DASHBOARD_LAYOUT_OPTIONS,
  HEADER_LAYOUT_OPTIONS,
  SIDEBAR_LAYOUT_OPTIONS,
  THEME_MODE_OPTIONS,
  WINDOW_MODE_OPTIONS,
  type ThemeMode,
} from "../agent-writable-settings";

/**
 * Appearance — theme mode (theme slice, boot-critical) + display module
 * (userPreferences, warm-cache). Two persistence tiers in one tab.
 */
export default function AppearanceTab() {
  const [mode, setMode] = useSetting<ThemeMode>("theme.mode");
  const [theme, setTheme] = useSetting<string>("userPreferences.display.theme");
  const [darkMode, setDarkMode] = useSetting<boolean>(
    "userPreferences.display.darkMode",
  );
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

  return (
    <>
      <SettingsSubHeader
        title="Appearance"
        description="Theme, layout, and window presentation."
        icon={Palette}
      />

      <SettingsSection title="Theme" icon={Sun}>
        <SettingsSegmented<ThemeMode>
          label="Color mode"
          description="Applies before first paint — synced across tabs."
          value={mode}
          onValueChange={setMode}
          options={THEME_MODE_OPTIONS}
        />
        <SettingsSwitch
          label="Dark mode (legacy flag)"
          description="Used by older components that don't yet read from the theme slice."
          badge={{ label: "Deprecated", variant: "deprecated" }}
          checked={darkMode}
          onCheckedChange={setDarkMode}
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
        Theme color mode is saved to your account and applied before the page
        paints on reload. Layout preferences sync via IndexedDB.
      </SettingsCallout>
    </>
  );
}
