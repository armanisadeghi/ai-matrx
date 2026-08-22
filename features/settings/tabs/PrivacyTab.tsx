"use client";

import { ShieldCheck, Eye, Lightbulb, DatabaseZap } from "lucide-react";
import { toast } from "@/lib/toast";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
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
        Granular telemetry settings aren't implemented yet. This tab surfaces the
        capture-related preferences that exist today, plus the door onto your
        data's deletion schedule.
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

      <SettingsSection title="Your data" icon={DatabaseZap}>
        <SettingsLink
          label="What's scheduled to be deleted"
          description="Anything of yours on its way to permanent deletion, when it goes, and a one-click way to keep it."
          href="/settings/data"
          actionLabel="Open"
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
