"use client";

import { Mic, ExternalLink } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { useSetting } from "../hooks/useSetting";
import { settingDoorHref } from "../doors/settingDoorTarget";
import { VOICE_SETTING_DOORS } from "./voices/voiceSettingDoors";

export default function VoiceTab() {
  // Voice, speed and language live on the Voices screen (VoicesTab) — the ONE
  // place every voice is chosen and heard. This screen keeps the listening side.
  // Assistant-behavior fields stay on personal preferences — they are not
  // playback settings and have no org/system tier.
  const [emotion, setEmotion] = useSetting<string>(
    "userPreferences.voice.emotion",
  );
  const [wakeWord, setWakeWord] = useSetting<string>(
    "userPreferences.voice.wakeWord",
  );
  const [micEnabled, setMicEnabled] = useSetting<boolean>(
    "userPreferences.voice.microphone",
  );
  const [speakerEnabled, setSpeakerEnabled] = useSetting<boolean>(
    "userPreferences.voice.speaker",
  );

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
          description="Your read-aloud voice, your live conversation voice, and every other voice AI Matrx speaks with — each with a sample."
          href={settingDoorHref(VOICE_SETTING_DOORS.readAloud)}
          actionLabel="Voices"
        />
        <SettingsTextInput
          label="Emotion / tone"
          description="Descriptive hint like 'cheerful' or 'calm'."
          value={emotion}
          onValueChange={setEmotion}
          placeholder="e.g., cheerful, calm"
          commitOnBlur
          stacked
        />
        <SettingsTextInput
          label="Wake word"
          description="Phrase that activates the assistant."
          value={wakeWord}
          onValueChange={setWakeWord}
          placeholder="e.g., Hey Matrix"
          commitOnBlur
          stacked
          last
        />
      </SettingsSection>

      <SettingsSection title="Devices">
        <SettingsSwitch
          label="Enable microphone"
          checked={micEnabled}
          onCheckedChange={setMicEnabled}
        />
        <SettingsSwitch
          label="Enable speaker"
          checked={speakerEnabled}
          onCheckedChange={setSpeakerEnabled}
          last
        />
      </SettingsSection>

      <SettingsSection title="Advanced">
        <SettingsLink
          label="Voice playground"
          description="Preview voices and tune cadence."
          href="/demos/general/voice/voice-manager"
          actionLabel="Open"
          icon={ExternalLink}
          last
        />
      </SettingsSection>
    </>
  );
}
