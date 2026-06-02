"use client";

import { ShieldCheck, Eye, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import { useAutoRagPreference } from "@/features/kg-suggestions/hooks/useAutoRagPreference";

/**
 * Privacy-adjacent toggles. Not a dedicated slice — surfaces fields from
 * assistant + messaging that involve data collection or background capture.
 */
export default function PrivacyTab() {
  const [alwaysWatching, setAlwaysWatching] = useSetting<boolean>(
    "userPreferences.assistant.alwaysWatching",
  );
  const [showDesktopNotifications, setShowDesktopNotifications] =
    useSetting<boolean>("userPreferences.messaging.showDesktopNotifications");

  const autoRag = useAutoRagPreference();

  const handleAutoRagChange = (next: boolean) => {
    void autoRag
      .setEnabled(next)
      .then(() =>
        toast.success(
          next
            ? "Auto knowledge-graph enabled"
            : "Auto knowledge-graph disabled",
        ),
      )
      .catch(() => toast.error("Couldn't update knowledge-graph setting"));
  };

  return (
    <>
      <SettingsSubHeader
        title="Privacy"
        description="Permissions and background data capture."
        icon={ShieldCheck}
      />

      <SettingsCallout tone="info">
        Granular telemetry and export settings aren't implemented yet. This tab
        surfaces the two capture-related preferences that exist today.
      </SettingsCallout>

      <SettingsSection title="Assistant" icon={Eye}>
        <SettingsSwitch
          label="Always watching"
          description="Allow the assistant to observe screen context even when not invoked."
          warning="Consumes more resources and may share more context with your provider."
          checked={alwaysWatching}
          onCheckedChange={setAlwaysWatching}
          last
        />
      </SettingsSection>

      <SettingsSection title="Notifications">
        <SettingsSwitch
          label="Desktop notifications"
          description="Show OS-level banners for new messages."
          checked={showDesktopNotifications}
          onCheckedChange={setShowDesktopNotifications}
          last
        />
      </SettingsSection>

      <SettingsSection title="Knowledge Graph" icon={Lightbulb}>
        <SettingsSwitch
          label="Auto knowledge-graph"
          description="Let Matrx analyze your notes, tasks, and files in the background to suggest scope fills. Suggestions are never applied automatically — you accept each one."
          checked={autoRag.enabled}
          onCheckedChange={handleAutoRagChange}
          disabled={autoRag.loading || autoRag.saving}
          last
        />
      </SettingsSection>
    </>
  );
}
