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

import { useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { SettingsTabDef } from "../types";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import { DefaultOrganizationChooser } from "@/features/organizations/components/DefaultOrganizationChooser";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { useSetting, useSettingReset } from "../hooks/useSetting";
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
import { useSurfaceScopeContribution, useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { setKnobOverride } from "@/lib/scoped-config/service";

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
  const themeReset = useSettingReset<ThemeMode>("theme.mode");
  const [defaultOrganizationId, setDefaultOrganizationId] = useSetting<string | null>(
    "userPreferences.organization.defaultOrganizationId",
  );
  const settings = useUniversalSettings();
  // The write handler outlives this render; it reads the freshest settings
  // through this ref when it waits for its own write to show on the page.
  const latestSettings = useRef(settings);
  useEffect(() => {
    latestSettings.current = settings;
  });
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

  // ── Agent twin of the AI and voice rows (write target `ai_voice_defaults`).
  // Saves the PERSON's own value through the same ladder door the rows use
  // (`platform.knob_override_set`, user rung, this organization); `null`
  // removes the person's value so the row follows the organization again.
  const firstScreenKeys = [FIRST_SCREEN_MODEL_KEY, FIRST_SCREEN_VOICE_KEY, ...FIRST_SCREEN_MORE_KEYS] as string[];
  const validateAiVoice = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0)
      throw new Error(`ai_voice_defaults expects an object keyed by any of: ${firstScreenKeys.join(", ")}.`);
    if (!settings.organizationId) throw new Error("No organization is selected, so these defaults cannot be changed yet.");
    if (!settings.userId) throw new Error("Not signed in.");
    for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
      const knob = settings.knobByKey(key);
      if (!firstScreenKeys.includes(key) || !knob) throw new Error(`Unknown default: ${key}. Allowed: ${firstScreenKeys.join(", ")}.`);
      if (knob.user_override_locked) throw new Error(`${knob.label} is locked by your organization.`);
      if (next !== null && typeof next !== "string") throw new Error(`${knob.label} expects an id string, or null to follow the organization.`);
      if (next !== null && knob.allowed_values && !knob.allowed_values.includes(next))
        throw new Error(`${knob.label} must be one of: ${knob.allowed_values.join(", ")}.`);
    }
  };
  // Agent twin of the Default organization row. A display preference only —
  // which organization opens at sign-in; it never changes the one the person
  // is working in. Accepts an organization id or exact name, or null to clear.
  const resolveDefaultOrganization = (value: unknown): string | null => {
    if (value === null) return null;
    if (typeof value !== "string" || !value.trim())
      throw new Error("default_organization expects an organization id or exact name, or null for none.");
    const byId = settings.organizations.find((org) => org.id === value);
    if (byId) return byId.id;
    const byName = settings.organizations.filter((org) => org.name.toLowerCase() === value.trim().toLowerCase());
    if (byName.length === 1) return byName[0].id;
    if (byName.length > 1)
      throw new Error(`"${value}" matches ${byName.length} of your organizations; send the id (${byName.map((o) => o.id).join(", ")}).`);
    throw new Error(`"${value}" is not one of your organizations.`);
  };
  useSurfaceWriteHandlers("matrx-user/settings", {
    default_organization: {
      validate: (value: unknown) => void resolveDefaultOrganization(value),
      apply: (value: unknown) => {
        const next = resolveDefaultOrganization(value);
        setDefaultOrganizationId(next);
        const name = next ? settings.organizations.find((org) => org.id === next)?.name ?? next : null;
        return {
          summary: next ? `Default organization set to ${name}.` : "Default organization cleared.",
          data: { default_organization: next ? { id: next, name } : null },
        };
      },
    },
    ai_voice_defaults: {
      validate: validateAiVoice,
      apply: async (value: unknown) => {
        validateAiVoice(value);
        const saved: string[] = [];
        const { userId, organizationId } = settings;
        if (!userId || !organizationId) throw new Error("No organization is selected.");
        for (const [key, next] of Object.entries(value as Record<string, string | null>)) {
          const knob = settings.knobByKey(key);
          if (!knob) throw new Error(`Unknown default: ${key}.`);
          const result = await setKnobOverride({
            feature: knob.feature,
            key: knob.key,
            scopeKind: "user",
            scopeId: userId,
            organizationId,
            value: next,
          });
          if (!result.ok) throw new Error(result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`);
          saved.push(knob.label);
        }
        settings.refresh();
        // Wait for the re-read so the agent's next look at the page shows what
        // landed — not the pre-write copy (seen live 2026-09-27: the agent read
        // the old value right after a successful write and doubted it).
        const expected = value as Record<string, string | null>;
        const landed = () =>
          Object.entries(expected).every(([key, next]) => {
            const knob = latestSettings.current.knobByKey(key);
            return next === null ? knob?.is_overridden === false : knob?.effective_value === next;
          });
        for (let i = 0; i < 40 && !landed(); i++) await new Promise((r) => setTimeout(r, 250));
        return {
          summary: landed()
            ? `Saved ${saved.join(", ")}; the page now shows the new value.`
            : `Saved ${saved.join(", ")}; the page has not re-read it yet — the saved values are in data.`,
          data: { saved: value },
        };
      },
    },
  });

  return (
    // One compact column: labels and their controls sit together instead of
    // at opposite edges of a wide page.
    <div className="mx-auto w-full max-w-3xl">
      {settings.editingContext === "system" && <RegistryCoverage />}

      {settings.editingContext === "user" && <SettingsSection title="Appearance">
        <SettingsSelect<ThemeMode>
          label="Theme"
          description="Use your device setting, light, or dark. Saved in this browser; every open tab follows it."
          value={mode}
          onValueChange={setMode}
          options={THEME_MODE_OPTIONS}
          modified={themeReset.modified}
          onReset={themeReset.reset}
          resetLabel="Reset theme to system default"
          width="xl"
          last
        />
      </SettingsSection>
      }

      {settings.editingContext === "user" && <PreferencesLoadGate what="your account defaults">
        <SettingsSection title="Account defaults">
          <SettingsRow
            label="Default organization"
            description="Where you land when you sign in. You can switch organizations any time from the header."
            id="settings-default-organization"
            // Stacks under its label on a narrow screen, like every select row.
            controlLayout="wide"
            modified={Boolean(defaultOrganizationId)}
            onReset={() => setDefaultOrganizationId(null)}
            resetLabel="Clear default organization"
            last={settings.organizationsStatus !== "error"}
          >
            {/* The same organization control the header uses (search, rarely
                used folded, test organizations hidden, address on duplicate
                names) — choosing here only sets the default. */}
            <DefaultOrganizationChooser id="settings-default-organization" className="w-80 max-w-full" />
          </SettingsRow>
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

      {/* Said once, where it is needed: the AI and voice rows are the only part
          of this screen that needs an organization. */}
      {settings.editingContext === "user" && organizationState !== "ready" && (
        <SettingsSection title="AI and voice">
          <OrganizationContextNotice
            state={organizationState}
            what="Your AI and voice defaults"
            description="These are kept per organization. Choose the one you are working in to see them."
            compact
          />
        </SettingsSection>
      )}

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
      {missingKeys.length > 0 && (
        <SettingsCallout
          tone="error"
          title={`${missingKeys.length === 1 ? "One default is" : `${missingKeys.length} defaults are`} not set up for this organization yet`}
        >
          <span role="alert">
            They will appear here as soon as they are added — nothing is hidden on purpose.
            <ErrorAlchemyMenu
              error={`First-screen settings missing from the knob register: ${missingKeys.join(", ")}`}
            />
          </span>
        </SettingsCallout>
      )}

      {ladderKnobs.length > 0 && <UniversalSettingsRows knobs={ladderKnobs} hideKey />}

    </div>
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
