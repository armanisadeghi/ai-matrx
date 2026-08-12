"use client";

import { Mic, ExternalLink } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { useSetting } from "../hooks/useSetting";
import { availableVoices } from "@/lib/cartesia/voices";
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";

const voiceOptions = availableVoices.map((v) => ({
  value: v.id,
  label: v.name,
  description: v.description,
}));

export default function VoiceTab() {
  const [voice, setVoice] = useSetting<string>("userPreferences.voice.voice");
  const [language, setLanguage] = useSetting<string>(
    "userPreferences.voice.language",
  );
  const [speed, setSpeed] = useSetting<number>("userPreferences.voice.speed");
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
        description="Voice recognition and spoken-response defaults."
        icon={Mic}
      />

      <SettingsSection title="Voice">
        <SettingsSelect
          label="Voice"
          description="Cartesia voice used for replies."
          value={voice || voiceOptions[0]?.value || ""}
          onValueChange={setVoice}
          options={voiceOptions}
          width="lg"
        />
        <SettingsSelect
          label="Language"
          value={language}
          onValueChange={setLanguage}
          options={LANGUAGE_OPTIONS}
        />
        <SettingsSlider
          label="Speech speed"
          description="Playback speed (1.0 = original). Our default is 1.2."
          value={speed}
          onValueChange={setSpeed}
          min={0.6}
          max={1.5}
          step={0.05}
          precision={2}
          minLabel="Slower"
          midLabel="Default"
          maxLabel="Faster"
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
