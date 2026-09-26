"use client";

import { ShieldCheck, Lightbulb, DatabaseZap } from "lucide-react";
import { toast } from "@/lib/toast";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { settingDoorHref } from "../doors/settingDoorTarget";
import { useAutoRagPreference } from "@/features/kg-suggestions/hooks/useAutoRagPreference";
import { toastWriteFailure } from "@/lib/errors/toastWriteFailure";

/**
 * Privacy-adjacent controls. Not a dedicated slice — points at the fields
 * from assistant + messaging that involve data collection or background
 * capture, each through a door to its one real home so the switch and the
 * side effect it needs (e.g. the browser notification permission prompt)
 * never drift apart. Fixed 2026-09-25 (settings-truth-sweep, lane general):
 * this tab used to carry its own raw "Desktop notifications" switch that set
 * `messaging.showDesktopNotifications` to true WITHOUT ever requesting the
 * browser's Notification permission — `showDesktopNotification()` silently
 * no-ops unless `Notification.permission === "granted"`, so flipping it here
 * looked like it worked and never showed a notification. Only the Messaging
 * tab's switch calls `requestNotificationPermission()` first.
 */
export default function PrivacyTab() {
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
      .catch((err) =>
        toastWriteFailure(err, {
          action: next ? "turn on auto knowledge-graph" : "turn off auto knowledge-graph",
        }),
      );
  };

  return (
    <>
      <SettingsSubHeader
        title="Privacy"
        description="Permissions and background data capture."
        icon={ShieldCheck}
      />

      <SettingsCallout tone="info">
        Granular telemetry settings aren't implemented yet. This tab surfaces
        the capture-related preferences that exist today, plus the door onto
        your data's deletion schedule.
      </SettingsCallout>

      <SettingsSection title="Notifications">
        <SettingsLink
          label="Desktop notifications"
          description="Whether new-message banners show on your desktop. Set on the Messaging tab, where turning it on also asks your browser for permission."
          href={settingDoorHref({
            scope: "user",
            tabId: "communication.messaging",
            controlId: "settings-control-desktop-desktop-notifications",
          })}
          actionLabel="Messaging"
          last
        />
      </SettingsSection>

      <SettingsSection title="Your data" icon={DatabaseZap}>
        <SettingsLink
          label="Trash"
          description="Everything you've deleted, when anything with a deletion date goes for good, and a one-click way to keep it."
          href="/trash"
          actionLabel="Open"
          last
        />
      </SettingsSection>

      <SettingsSection title="Knowledge Graph" icon={Lightbulb}>
        <SettingsSwitch
          label="Auto knowledge-graph"
          description="Let Matrx analyze your notes, tasks, and files in the background to suggest useful connections. Suggestions are never applied automatically — you accept each one."
          checked={autoRag.enabled}
          onCheckedChange={handleAutoRagChange}
          disabled={autoRag.loading || autoRag.saving}
          last
        />
      </SettingsSection>
    </>
  );
}
