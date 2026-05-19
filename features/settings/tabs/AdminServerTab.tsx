"use client";

import { Database, ShieldCheck } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import type { ServerEnvironment } from "@/lib/redux/preferences/adminPreferencesSlice";

export default function AdminServerTab() {
  const [override, setOverride] = useSetting<ServerEnvironment | null>(
    "adminPreferences.serverOverride",
  );
  const [customUrl, setCustomUrl] = useSetting<string | null>(
    "adminPreferences.customServerUrl",
  );

  return (
    <>
      <SettingsSubHeader
        title="Admin overrides"
        description="Admin-only controls that affect the current session only."
        icon={ShieldCheck}
      />

      <SettingsCallout tone="warning">
        These settings are stored <strong>in memory only</strong> and reset on
        reload. They affect only your session — other users are unaffected.
      </SettingsCallout>

      <SettingsSection title="Backend server" icon={Database}>
        <SettingsSelect<string>
          label="Server override"
          description="Which backend host API calls target."
          badge={{ label: "Admin", variant: "admin" }}
          value={override ?? "default"}
          onValueChange={(v) =>
            setOverride(v === "default" ? null : (v as ServerEnvironment))
          }
          options={[
            { value: "default", label: "Default (production)" },
            { value: "development", label: "Development" },
            { value: "staging", label: "Staging" },
            { value: "localhost", label: "Localhost" },
            { value: "gpu", label: "GPU" },
            { value: "custom", label: "Custom URL" },
          ]}
        />
        {override === "custom" && (
          <SettingsTextInput
            label="Custom server URL"
            description="Full origin, e.g. https://preview.matrxserver.com"
            value={customUrl ?? ""}
            onValueChange={(v) => setCustomUrl(v)}
            placeholder="https://…"
            commitOnBlur
            stacked
            last
          />
        )}
      </SettingsSection>
    </>
  );
}
