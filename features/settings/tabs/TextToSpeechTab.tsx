"use client";

import { Volume2 } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting } from "../hooks/useSetting";
import type { GroqTtsVoice } from "@/lib/redux/preferences/userPreferencesSlice";

const groqVoices: GroqTtsVoice[] = [
  "autumn", "diana", "hannah", "austin", "daniel", "troy",
];

const voiceOptions = groqVoices.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

export default function TextToSpeechTab() {
  const [voice, setVoice] = useSetting<GroqTtsVoice>(
    "userPreferences.textToSpeech.preferredVoice",
  );
  const [autoPlay, setAutoPlay] = useSetting<boolean>(
    "userPreferences.textToSpeech.autoPlay",
  );
  const [processMarkdown, setProcessMarkdown] = useSetting<boolean>(
    "userPreferences.textToSpeech.processMarkdown",
  );

  return (
    <>
      <SettingsSubHeader
        title="Text-to-speech"
        description="How assistant replies are read aloud."
        icon={Volume2}
      />

      <SettingsSection title="Playback">
        <SettingsSelect<GroqTtsVoice>
          label="Voice"
          description="Voice used by the catalog-selected speech model."
          value={voice}
          onValueChange={setVoice}
          options={voiceOptions}
          width="md"
        />
        <SettingsSwitch
          label="Auto-play"
          description="Play audio automatically when a response finishes."
          checked={autoPlay}
          onCheckedChange={setAutoPlay}
        />
        <SettingsSwitch
          label="Process Markdown"
          description="Strip markdown syntax before speaking so formatting isn't read aloud."
          checked={processMarkdown}
          onCheckedChange={setProcessMarkdown}
          last
        />
      </SettingsSection>
    </>
  );
}
