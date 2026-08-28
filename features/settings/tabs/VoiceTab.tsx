"use client";

import { useState } from "react";
import { Mic, ExternalLink } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { useSetting } from "../hooks/useSetting";
import { useListeningSettings } from "@/features/audio/service/useListeningSettings";
import { availableVoices } from "@/lib/cartesia/voices";
import { TTS_DEFAULT_SPEED } from "@/lib/cartesia/config";
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";

const voiceOptions = availableVoices.map((v) => ({
  value: v.id,
  label: v.name,
  description: v.description,
}));

export default function VoiceTab() {
  // Voice / speed / language live in the TIERED listening config (system →
  // org → user, user wins) — the same rows the Listen panel edits, resolved
  // by every speech consumer. See features/audio/service/listeningConfig.ts.
  const { effectiveVoiceId, speed, language, update } = useListeningSettings();
  const [dragSpeed, setDragSpeed] = useState<number | null>(null);

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
        description="Voice recognition and spoken-response defaults."
        icon={Mic}
      />

      <SettingsSection title="Voice">
        <SettingsSelect
          label="Voice"
          description="Your default for all speech, app-wide. Wins over your organization and system defaults."
          value={effectiveVoiceId}
          onValueChange={(v) => void update({ voice: v })}
          options={voiceOptions}
          width="lg"
        />
        <SettingsSelect
          label="Language"
          value={language}
          onValueChange={(v) => void update({ language: v })}
          options={LANGUAGE_OPTIONS}
        />
        <SettingsSlider
          label="Speech speed"
          description="Playback speed (1.0 = original). Our default is 1.2."
          value={dragSpeed ?? (speed || TTS_DEFAULT_SPEED)}
          onValueChange={setDragSpeed}
          onValueCommit={(v) => {
            setDragSpeed(null);
            void update({ speed: v });
          }}
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
