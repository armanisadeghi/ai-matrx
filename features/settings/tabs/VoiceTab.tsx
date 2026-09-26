"use client";

import { Mic } from "lucide-react";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { settingDoorHref } from "../doors/settingDoorTarget";
import { VOICE_SETTING_DOORS } from "./voices/voiceSettingDoors";
import { useSettingsTabNavigate } from "../components/SettingsPresentationContext";

export default function VoiceTab() {
  // Voice, speed, language and emotion live on the Voices screen (VoicesTab)
  // — the ONE place every voice is chosen and heard. This screen keeps the
  // listening side.
  const navigateToTab = useSettingsTabNavigate();

  return (
    <>
      <SettingsSubHeader
        title="Voice input"
        description="How the assistant listens to you."
        icon={Mic}
      />

      <SettingsSection title="Voice">
        <SettingsLink
          label="Voices you hear"
          description="Your read-aloud voice (with its speed, language and emotion), your live conversation voice, and every other voice AI Matrx speaks with — each with a sample."
          href={settingDoorHref(VOICE_SETTING_DOORS.readAloud)}
          actionLabel="Voices"
          last
        />
      </SettingsSection>

      {/* Microphone/speaker on/off toggles used to live here but wrote a key
          nothing read — the actual device choice (which mic, which speaker)
          is canonical on the Devices tab, wired to real enumerateDevices ids.
          A door there replaces the dead switches instead of leaving a
          "Devices" section whose controls did nothing. */}
      <SettingsSection title="Devices">
        <SettingsButton
          label="Microphone & speaker"
          description="Choose which microphone and speaker AI Matrx uses."
          icon={Mic}
          actionLabel="Open device settings"
          onClick={() => navigateToTab("devices")}
          last
        />
      </SettingsSection>

      {/* An "Advanced → Voice playground" section used to link to
          /demos/general/voice/voice-manager — a (dev)-group route that is
          dead in production, and one that (per its own admin-tester source)
          doesn't even preview voices the way its label promised (that's
          VoicesTab, already linked above). The real production playground,
          /chat/voice/playground, is a different thing entirely — live
          xAI Realtime conversation tuning, not Cartesia voice/cadence
          preview — so pointing there would just trade one wrong promise
          for another. Removed rather than relinked to a mismatch
          (settings-truth-audit, 2026-09-25). */}
    </>
  );
}
