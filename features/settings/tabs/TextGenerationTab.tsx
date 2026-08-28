"use client";

import { Type } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting } from "../hooks/useSetting";
import {
  CREATIVITY_LEVEL_OPTIONS,
  LANGUAGE_OPTIONS,
  TEXT_TONE_OPTIONS,
} from "../agent-writable-settings";

export default function TextGenerationTab() {
  // null = platform default (catalog-resolved via is_primary). The legacy
  // seeded value "GPT-4o" is folded to null at the load boundaries
  // (stripLegacyDefaultModelSentinels).
  const [model, setModel] = useSetting<string | null>(
    "userPreferences.textGeneration.defaultModel",
  );
  const [tone, setTone] = useSetting<string>(
    "userPreferences.textGeneration.tone",
  );
  const [creativity, setCreativity] = useSetting<string>(
    "userPreferences.textGeneration.creativityLevel",
  );
  const [language, setLanguage] = useSetting<string>(
    "userPreferences.textGeneration.language",
  );
  const [plagiarism, setPlagiarism] = useSetting<boolean>(
    "userPreferences.textGeneration.plagiarismCheckEnabled",
  );

  return (
    <>
      <SettingsSubHeader
        title="Text generation"
        description="Defaults for text-generation surfaces."
        icon={Type}
      />
      <SettingsSection title="Model & style">
        <SettingsModelPicker
          label="Model"
          value={model}
          onValueChange={setModel}
          scope="all"
          allowPlatformDefault
          defaultModality="text"
        />
        <SettingsSelect
          label="Tone"
          value={tone}
          onValueChange={setTone}
          options={TEXT_TONE_OPTIONS}
        />
        <SettingsSelect
          label="Creativity"
          value={creativity}
          onValueChange={setCreativity}
          options={CREATIVITY_LEVEL_OPTIONS}
        />
        <SettingsSelect
          label="Language"
          value={language}
          onValueChange={setLanguage}
          options={LANGUAGE_OPTIONS}
        />
        <SettingsSwitch
          label="Plagiarism check"
          description="Run output through a plagiarism check before showing it."
          checked={plagiarism}
          onCheckedChange={setPlagiarism}
          last
        />
      </SettingsSection>
    </>
  );
}
