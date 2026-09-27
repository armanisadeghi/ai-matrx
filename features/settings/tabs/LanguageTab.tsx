"use client";

import { Globe } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting, useSettingReset } from "../hooks/useSetting";
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";

/**
 * Language defaults. Right now there's no single "app language" slice — each
 * feature maintains its own `language` preference. This tab surfaces every
 * language field so users don't have to hunt across tabs.
 */
export default function LanguageTab() {
  const [voiceLang, setVoiceLang] = useSetting<string>(
    "userPreferences.voice.language",
  );
  const [textLang, setTextLang] = useSetting<string>(
    "userPreferences.textGeneration.language",
  );
  const voiceReset = useSettingReset<string>("userPreferences.voice.language");
  const textReset = useSettingReset<string>("userPreferences.textGeneration.language");

  return (
    <>
      <SettingsSubHeader
        title="Language & Region"
        description="Each feature keeps its own language; there is no single app language."
        icon={Globe}
      />

      <PreferencesLoadGate what="your language defaults">
        <SettingsSection title="Language defaults">
          <SettingsSelect
            label="Voice input"
            description="Speech-to-text recognition language."
            value={voiceLang}
            onValueChange={setVoiceLang}
            options={LANGUAGE_OPTIONS}
            modified={voiceReset.modified}
            onReset={voiceReset.reset}
            resetLabel="Reset voice input language to its default"
          />
          <SettingsSelect
            label="Text generation"
            description="Default language for generated text."
            value={textLang}
            onValueChange={setTextLang}
            options={LANGUAGE_OPTIONS}
            modified={textReset.modified}
            onReset={textReset.reset}
            resetLabel="Reset text generation language to its default"
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>
    </>
  );
}
