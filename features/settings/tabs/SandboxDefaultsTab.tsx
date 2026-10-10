"use client";

// Devices & storage › Sandbox defaults — what an explicit "New sandbox"
// starts with. Knob-backed (`infrastructure.sandbox.defaults.*`, organization
// and user rungs), rendered by the ONE editor row exactly like
// `appearance.density` (AppearanceTab): an organization may set a default and a
// person may choose their own value in that organization; "use inherited"
// clears the person's value. Readers: SandboxPanel (chat) and aidream
// ensure_default_sandbox. Replaces the retired /settings/sandbox page, whose
// values lived in the userPreferences `sandbox` blob.
//
// Environment variables are NOT here: since vault Phase 5 a sandbox's env comes
// only from the person's Vault, and a user-rung knob row is readable by every
// member of the organization — never a home for secrets.

import { KeyRound, Server } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "../universal/UniversalSettingsPane";
import {
  SANDBOX_DEFAULT_KEYS,
  isCloneableGitUrl,
  sandboxDefaultKnobKey,
} from "@/lib/sandbox/sandbox-defaults";

export default function SandboxDefaultsTab() {
  const settings = useUniversalSettings();
  const knobs = SANDBOX_DEFAULT_KEYS.map((key) =>
    settings.knobByKey(sandboxDefaultKnobKey(key)),
  ).filter((knob): knob is ScopedKnob => Boolean(knob));
  const registerConsulted =
    !settings.isLoading && !settings.error && Boolean(settings.organizationId);
  const missing = registerConsulted
    ? SANDBOX_DEFAULT_KEYS.filter((key) => !settings.knobByKey(sandboxDefaultKnobKey(key)))
    : [];
  const repo = settings.knobByKey(sandboxDefaultKnobKey("git_repo"))?.effective_value;
  const repoIsBad = typeof repo === "string" && repo !== "" && !isCloneableGitUrl(repo);

  return (
    <>
      <SettingsSubHeader
        title="Sandbox defaults"
        description="What a sandbox you create starts with."
        icon={Server}
      />
      {settings.isLoading && (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Reading your sandbox defaults…" />
        </div>
      )}
      {settings.error && (
        <SettingsCallout tone="error" title="Sandbox defaults could not be read">
          {settings.error}
          <ErrorAlchemyMenu error={settings.error} />
        </SettingsCallout>
      )}
      {!settings.isLoading && !settings.error && !settings.organizationId && (
        <SettingsCallout tone="info" title="Choose an organization first">
          Sandbox defaults are kept per organization.
        </SettingsCallout>
      )}
      {missing.length > 0 && (
        <SettingsCallout tone="error" title="Sandbox defaults are not set up yet">
          <span role="alert">
            {/* read-gate-exempt: this callout is itself the missing-settings error */}
            {missing.length} of {SANDBOX_DEFAULT_KEYS.length} settings are missing.
            <ErrorAlchemyMenu
              error={`Sandbox default knobs missing from the register: ${missing
                .map(sandboxDefaultKnobKey)
                .join(", ")}`}
            />
          </span>
        </SettingsCallout>
      )}
      {knobs.length > 0 && <UniversalSettingsRows knobs={knobs} hideKey />}
      {repoIsBad && (
        <SettingsCallout tone="warning" title="This repository will not be cloned">
          Use an https:// URL; SSH (git@) is not supported yet.
        </SettingsCallout>
      )}
      <SettingsSection title="Environment variables">
        <SettingsLink
          label="Sandbox secrets and variables"
          description="Every sandbox you start reads them from your Vault."
          icon={KeyRound}
          href="/vault"
          actionLabel="Vault"
          last
        />
      </SettingsSection>
    </>
  );
}
