"use client";

import { Database, Monitor, RefreshCw, ShieldCheck } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import type { ServerEnvironment } from "@/lib/redux/preferences/adminPreferencesSlice";
import { useDesktopInstances } from "@/hooks/use-desktop-instances";

export default function AdminServerTab() {
  const [override, setOverride] = useSetting<ServerEnvironment | null>(
    "adminPreferences.serverOverride",
  );
  const [customUrl, setCustomUrl] = useSetting<string | null>(
    "adminPreferences.customServerUrl",
  );
  const [desktopTargetInstanceId, setDesktopTargetInstanceId] = useSetting<
    string | null
  >("adminPreferences.desktopTargetInstanceId");
  const {
    data: desktopInstances,
    loading: desktopInstancesLoading,
    error: desktopInstancesError,
    refetch: refetchDesktopInstances,
  } = useDesktopInstances();

  const selectedDesktopStillListed = desktopInstances.some(
    (target) => target.id === desktopTargetInstanceId,
  );
  const desktopOptions = [
    {
      value: "auto",
      label: "Auto / installed app",
      description: "Send no target_instance_id.",
    },
    ...desktopInstances.map((target) => {
      const channel = target.dev ? "dev" : "live";
      const status = target.live ? "live" : "offline";
      const lastSeen = formatLastSeen(target.last_seen);
      return {
        value: target.id,
        label: `${target.name} (${channel} · ${status})`,
        description: `${target.id}${lastSeen ? ` · last seen ${lastSeen}` : ""}`,
      };
    }),
    ...(desktopTargetInstanceId && !selectedDesktopStillListed
      ? [
          {
            value: desktopTargetInstanceId,
            label: "Previously selected desktop",
            description: `${desktopTargetInstanceId} · not in current registered instances list`,
            disabled: true,
          },
        ]
      : []),
  ];

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

      <SettingsSection title="Desktop app (dev override)" icon={Monitor}>
        <SettingsSelect<string>
          label="Desktop instance"
          description="Admin-only target for delegated desktop tools. Auto preserves the default aidream routing behavior."
          warning={desktopInstancesError}
          badge={{ label: "Admin", variant: "admin" }}
          value={desktopTargetInstanceId ?? "auto"}
          onValueChange={(v) =>
            setDesktopTargetInstanceId(v === "auto" ? null : v)
          }
          options={desktopOptions}
          disabled={desktopInstancesLoading}
          width="lg"
        />
        <SettingsButton
          label="Registered instances"
          description="Refresh aidream's registered desktop instances."
          actionLabel="Refresh"
          actionIcon={RefreshCw}
          onClick={() => {
            void refetchDesktopInstances();
          }}
          loading={desktopInstancesLoading}
          size="sm"
          last
        />
      </SettingsSection>
    </>
  );
}

function formatLastSeen(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleString();
}
