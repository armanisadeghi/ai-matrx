"use client";

import { Camera, Video } from "lucide-react";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { settingDoorHref } from "../doors/settingDoorTarget";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";

/**
 * This screen used to also offer video background, video filter, default
 * meeting type, default layout, default meeting notes, and default AI
 * activity level — each saving to `userPreferences.videoConference.*`. The
 * settings-truth-audit (2026-09-25) traced every one of those keys and found
 * no reader anywhere in this repo: the meeting stage (`app/(meet)`, the
 * `@ai-matrx/meet` package) never reads them, so they were dead controls
 * saving values nothing ever applied. Removed rather than left as a screen
 * that looked configurable but did nothing; the stored preference rows are
 * untouched (no data was deleted). Open finding: `@ai-matrx/meet`'s own
 * bundle does reference background/blur concepts internally, so wiring these
 * back in as real props to that package is plausible future work — see the
 * settings-truth-sweep lane report:
 * common-docs/projects/settings-truth-sweep/lanes/voice-comm-learning.md.
 */
export default function VideoConferenceTab() {

  return (
    <>
      <SettingsSubHeader
        title="Video conference"
        description="Devices for video meetings."
        icon={Video}
      />
      {/* Camera + mic + speaker choice is canonical in the unified device
          preferences (userPreferences.mediaDevices) — managed on the
          "Camera, microphone & speakers" tab, wired to real
          enumerateDevices ids. */}
      <SettingsSection title="Devices">
        <SettingsLink
          label="Camera, microphone & speakers"
          description="Meetings use your saved devices from the unified device settings."
          icon={Camera}
          href={settingDoorHref({
            scope: "user",
            tabId: "devices",
            controlId: "settings-control-microphone-microphone",
          })}
          actionLabel="Open device settings"
          last
        />
      </SettingsSection>
    </>
  );
}
