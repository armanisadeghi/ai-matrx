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
//   Below the fold: the agent-builder model and the default DECISION model
//   (agents.model_prefs.decision_default_model, decision-contract picker only).
//
// The two ladder rows are the ONE editor (KnobOverrideRow) at the user rung,
// so this screen is the proof the whole system works end to end: value, origin
// ("Set here" / "Inherited from your organization"), clear-to-inherit, blast
// radius, and a locked key explained with its request door.

import { Building2, Palette, SlidersHorizontal } from "lucide-react";
import type { SettingsTabDef } from "../types";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { useSetting } from "../hooks/useSetting";
import { THEME_MODE_OPTIONS, type ThemeMode } from "../agent-writable-settings";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import {
  RegistryCoverage,
  UniversalSettingsRows,
} from "../universal/UniversalSettingsPane";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

/** The registry keys the first screen shows, in order (USD-12). */
export const FIRST_SCREEN_MODEL_KEY = "agents.model_prefs.chat_default_model";
export const FIRST_SCREEN_VOICE_KEY = "media.listening.voice";
/** Below the fold: the second example (building agents), still on the first screen. */
export const FIRST_SCREEN_MORE_KEYS = [
  "agents.model_prefs.agent_authoring_default_model",
  "agents.model_prefs.decision_default_model",
] as const;

export default function FirstScreenTab() {
  const [mode, setMode] = useSetting<ThemeMode>("theme.mode");
  const [defaultOrganizationId, setDefaultOrganizationId] = useSetting<string | null>(
    "userPreferences.organization.defaultOrganizationId",
  );
  const settings = useUniversalSettings();
  // The AI and voice rows live on the organization's ladder, so with no
  // organization selected they are HELD: the person's memberships are shown
  // inline through the one org-state component, and the rows appear once one
  // is chosen (organization-gate rule). Never a hand-spelled callout.
  const { organizationState } = useOrganizationRequired();

  const present = (keys: readonly string[]): ScopedKnob[] =>
    keys.map((key) => settings.knobByKey(key)).filter((knob): knob is ScopedKnob => Boolean(knob));
  const absent = (keys: readonly string[]): string[] =>
    keys.filter((key) => !settings.knobByKey(key));

  // ONE list, rendered by ONE call. Rows are grouped by their `ui.group`
  // inside `UniversalSettingsRows`, so splitting the same keys across several
  // calls printed a group heading once per call — "AI" appeared twice on this
  // screen, with "Voice" between them. A group is a property of the keys, not
  // of how many times the screen asks for them.
  const ladderKnobs = present([
    FIRST_SCREEN_MODEL_KEY,
    FIRST_SCREEN_VOICE_KEY,
    ...FIRST_SCREEN_MORE_KEYS,
  ]);
  // "Missing from the register" is a strong claim, so it is made only when the
  // register was actually consulted: an organization was in context, the read
  // finished, and the rows still were not there. Before an organization is
  // chosen the ladder has nothing to resolve against — that is not a missing
  // row, and saying so was a false sentence (seen live 2026-09-12).
  const registerConsulted =
    !settings.isLoading && !settings.error && Boolean(settings.organizationId);
  const missingKeys = registerConsulted
    ? absent([FIRST_SCREEN_MODEL_KEY, FIRST_SCREEN_VOICE_KEY, ...FIRST_SCREEN_MORE_KEYS])
    : [];
  const defaultOrganization = defaultOrganizationId
    ? settings.organizations.find((org) => org.id === defaultOrganizationId) ?? null
    : null;

  // What this screen shows, as values an agent on the page can read
  // (`first_screen` group of matrx-user/settings). Read from state already
  // rendered here; nothing is fetched for the agent.
  useSurfaceScopeContribution("matrx-user/settings", "first-screen", () => ({
    default_organization: defaultOrganizationId
      ? { id: defaultOrganizationId, name: defaultOrganization?.name ?? null }
      : null,
    organization_state: organizationState,
    ...(settings.isLoading
      ? {}
      : {
          ai_voice_defaults: settings.error
            ? { load_error: settings.error }
            : ladderKnobs.map((knob) => ({
                key: knob.full_key,
                label: knob.label,
                value: knob.effective_value,
                origin: knob.origin,
                set_here: knob.is_overridden,
              })),
        }),
  }));

  return (
    <>
      {settings.editingContext === "system" && <RegistryCoverage />}

      {settings.editingContext === "user" && <SettingsSection title="Appearance" icon={Palette}>
        <SettingsSelect<ThemeMode>
          label="Theme"
          description="Use your device setting, light, or dark. Applies before first paint and syncs across your tabs."
          value={mode}
          onValueChange={setMode}
          options={THEME_MODE_OPTIONS}
          last
        />
      </SettingsSection>
      }

      {settings.editingContext === "user" && <PreferencesLoadGate what="your account defaults">
        <SettingsSection title="Account defaults" icon={Building2}>
          <SettingsSelect
            label="Default organization"
            description="Where you land when you sign in. You can switch organizations any time from the header."
            value={defaultOrganizationId ?? ""}
            options={settings.organizations.map((org) => ({ value: org.id, label: org.name }))}
            placeholder={
              settings.organizations.length > 0
                ? "Choose one"
                : settings.organizationsStatus === "error"
                  ? "Your organizations could not be read"
                  : settings.organizationsStatus === "loading"
                    ? "Loading your organizations…"
                    : "No organizations yet"
            }
            onValueChange={(value) => setDefaultOrganizationId(value || null)}
            last={settings.organizationsStatus !== "error"}
          />
          {settings.organizationsStatus === "error" && (
            <ReadFailure
              error={settings.organizationsError ?? true}
              what="your organizations"
              onRetry={settings.refreshOrganizations}
            />
          )}
        </SettingsSection>
      </PreferencesLoadGate>
      }

      {settings.isLoading && (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Reading your AI and voice defaults…" />
        </div>
      )}
      {settings.error && (
        <SettingsCallout tone="error" title="Your AI and voice defaults could not be read">
          {settings.error}
          <ErrorAlchemyMenu error={settings.error} />
        </SettingsCallout>
      )}
      {settings.editingContext === "user" && organizationState !== "ready" && (
        <OrganizationContextNotice
          state={organizationState}
          what="Your AI and voice defaults"
          description="Your AI model and voice defaults are kept per organization. Choose the one you are working in."
          compact
          className="rounded-lg border border-border bg-card"
        />
      )}
      {missingKeys.length > 0 && (
        <SettingsCallout
          tone="error"
          title={`${missingKeys.length === 1 ? "One default is" : `${missingKeys.length} defaults are`} not set up for this organization yet`}
        >
          They will appear here as soon as they are added — nothing is hidden on purpose.
          <ErrorAlchemyMenu
            error={`First-screen settings missing from the knob register: ${missingKeys.join(", ")}`}
          />
        </SettingsCallout>
      )}

      {ladderKnobs.length > 0 && <UniversalSettingsRows knobs={ladderKnobs} hideKey />}

    </>
  );
}

/**
 * The first screen as a registry tab, so the settings route's index renders it
 * through the SAME host (Suspense, error boundary, breadcrumb) as every other
 * tab instead of an empty "choose a category" panel.
 */
export const FIRST_SCREEN_TAB: SettingsTabDef = {
  id: "firstScreen",
  label: "Settings",
  icon: SlidersHorizontal,
  description: "Theme, default organization, and your default AI model and voice.",
  component: FirstScreenTab,
  persistence: "server",
};
