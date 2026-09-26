"use client";

import { Type } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { settingDoorHref } from "@/features/settings/doors/settingDoorTarget";
import { CHAT_DEFAULT_MODEL_KNOB } from "@/features/ai-models/preferredChatModel";
import { useSetting } from "../hooks/useSetting";
import {
  CREATIVITY_LEVEL_OPTIONS,
  LANGUAGE_OPTIONS,
  TEXT_TONE_OPTIONS,
} from "../agent-writable-settings";

export default function TextGenerationTab() {
  const [tone, setTone] = useSetting<string>(
    "userPreferences.textGeneration.tone",
  );
  const [creativity, setCreativity] = useSetting<string>(
    "userPreferences.textGeneration.creativityLevel",
  );
  const [language, setLanguage] = useSetting<string>(
    "userPreferences.textGeneration.language",
  );

  return (
    <>
      <SettingsSubHeader
        title="Text generation"
        description="Your AI assistant can read and change these when it drafts text for you; no surface applies them automatically yet."
        icon={Type}
      />
      <SettingsSection title="Model & style">
        {/* `userPreferences.textGeneration.defaultModel` had no reader — the
            one real "default model" setting is `agents.model_prefs.chat_default_model`
            (organization → user → device), shown on the Settings first screen.
            This row is a door to it instead of a second, dead picker. */}
        <SettingsLink
          label="Default AI model"
          description="Chat, quick questions and everyday drafting answer with this model unless you pick another. Your organization can set one for everyone; yours wins for you."
          href={settingDoorHref({
            scope: "user",
            tabId: "firstScreen",
            controlId: CHAT_DEFAULT_MODEL_KNOB,
          })}
          actionLabel="Change"
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
          last
        />
      </SettingsSection>
    </>
  );
}
