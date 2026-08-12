"use client";

import { Globe } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";

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
  const [flashcardLang, setFlashcardLang] = useSetting<string>(
    "userPreferences.flashcard.language",
  );

  return (
    <>
      <SettingsSubHeader
        title="Language & Region"
        description="Per-feature language defaults."
        icon={Globe}
      />

      <SettingsCallout tone="info">
        Language is set per feature — there's no global language override yet.
        Change each domain's default here.
      </SettingsCallout>

      <SettingsSection title="Language defaults">
        <SettingsSelect
          label="Voice input"
          description="Speech-to-text recognition language."
          value={voiceLang}
          onValueChange={setVoiceLang}
          options={LANGUAGE_OPTIONS}
        />
        <SettingsSelect
          label="Text generation"
          description="Default language for generated text."
          value={textLang}
          onValueChange={setTextLang}
          options={LANGUAGE_OPTIONS}
        />
        <SettingsSelect
          label="Flashcards"
          description="Default language for study content."
          value={flashcardLang}
          onValueChange={setFlashcardLang}
          options={LANGUAGE_OPTIONS}
          last
        />
      </SettingsSection>
    </>
  );
}
