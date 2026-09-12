"use client";

// features/settings/tabs/FirstScreenTab.tsx
//
// THE FIRST SCREEN (Arman, 2026-09-10, USD-12): what a person sees when they
// open Settings, unscrolled — "basics a normal person values — theme and the
// little things — plus a couple of simple AI settings since that's what we do":
//
//   1. Theme                          — theme slice, boot-critical, via useSetting
//   2. Default organization           — userPreferences.organization, via useSetting
//   3. Default AI model for basic work — agents.model_prefs.chat_default_model,
//      named "Anthropic Sonnet 5" style from the AI catalog, through the ladder
//   4. Default voice                  — media.listening.voice through the ladder,
//      with pick-and-instantly-hear preview
//
// The two ladder rows are the ONE editor (KnobOverrideRow) at the user rung,
// so this screen is the proof the whole system works end to end: value, origin
// ("Set here" / "Inherited from your organization"), clear-to-inherit, blast
// radius, and a locked key explained with its request door.

import { Building2, Palette, SlidersHorizontal } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { useSetting } from "../hooks/useSetting";
import { THEME_MODE_OPTIONS, type ThemeMode } from "../agent-writable-settings";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import {
  OrganizationRungSection,
  UniversalSettingsRows,
} from "../universal/UniversalSettingsPane";

/** The registry keys the first screen shows, in order (USD-12). */
export const FIRST_SCREEN_MODEL_KEY = "agents.model_prefs.chat_default_model";
export const FIRST_SCREEN_VOICE_KEY = "media.listening.voice";
/** Below the fold: the second example (building agents), still on the first screen. */
export const FIRST_SCREEN_MORE_KEYS = [
  "agents.model_prefs.agent_authoring_default_model",
] as const;

export default function FirstScreenTab() {
  const [mode, setMode] = useSetting<ThemeMode>("theme.mode");
  const [defaultOrganizationId, setDefaultOrganizationId] = useSetting<string | null>(
    "userPreferences.organization.defaultOrganizationId",
  );
  const settings = useUniversalSettings();

  const present = (keys: readonly string[]): ScopedKnob[] =>
    keys.map((key) => settings.knobByKey(key)).filter((knob): knob is ScopedKnob => Boolean(knob));
  const absent = (keys: readonly string[]): string[] =>
    keys.filter((key) => !settings.knobByKey(key));

  const modelKnobs = present([FIRST_SCREEN_MODEL_KEY]);
  const voiceKnobs = present([FIRST_SCREEN_VOICE_KEY]);
  const moreKnobs = present(FIRST_SCREEN_MORE_KEYS);
  const missingKeys = settings.isLoading
    ? []
    : absent([FIRST_SCREEN_MODEL_KEY, FIRST_SCREEN_VOICE_KEY, ...FIRST_SCREEN_MORE_KEYS]);

  return (
    <>
      <SettingsSubHeader
        title="Settings"
        description="The basics, then everything else on the left."
        icon={SlidersHorizontal}
      />

      <SettingsSection title="Appearance" icon={Palette}>
        <SettingsSegmented<ThemeMode>
          label="Theme"
          description="Light or dark. Applies before first paint and syncs across your tabs."
          value={mode}
          onValueChange={setMode}
          options={THEME_MODE_OPTIONS}
          last
        />
      </SettingsSection>

      <SettingsSection title="Organization" icon={Building2}>
        <SettingsSelect
          label="Default organization"
          description="Where you land when you sign in. You can switch organizations any time from the header."
          value={defaultOrganizationId ?? ""}
          options={settings.organizations.map((org) => ({ value: org.id, label: org.name }))}
          placeholder={settings.organizations.length === 0 ? "No organizations yet" : "Choose one"}
          onValueChange={(value) => setDefaultOrganizationId(value || null)}
          last
        />
      </SettingsSection>

      {settings.isLoading && (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Reading your AI and voice defaults…" />
        </div>
      )}
      {settings.error && (
        <SettingsCallout tone="error" title="Your AI and voice defaults could not be read">
          {settings.error}
        </SettingsCallout>
      )}
      {missingKeys.length > 0 && (
        <SettingsCallout tone="error" title="A default is missing from the register">
          These settings are not registered for this organization yet, so they cannot be shown:{" "}
          {missingKeys.join(", ")}. The platform register (platform.feature_knob) is missing
          the rows — nothing is hidden on purpose.
        </SettingsCallout>
      )}

      {modelKnobs.length > 0 && <UniversalSettingsRows knobs={modelKnobs} hideKey />}
      {voiceKnobs.length > 0 && <UniversalSettingsRows knobs={voiceKnobs} hideKey />}
      {moreKnobs.length > 0 && <UniversalSettingsRows knobs={moreKnobs} hideKey />}

      <OrganizationRungSection />
    </>
  );
}
