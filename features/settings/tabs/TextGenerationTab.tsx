"use client";

import { Type } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useModelCatalog } from "@/features/ai-models/hooks/useModelCatalog";
import { useModels } from "@/features/ai-models/hooks/useModels";
import { selectPlatformDefaultTextModelName } from "@/features/ai-models/redux/platformDefaultModel";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSetting } from "../hooks/useSetting";
import {
  CREATIVITY_LEVEL_OPTIONS,
  LANGUAGE_OPTIONS,
  TEXT_TONE_OPTIONS,
} from "../agent-writable-settings";

// Radix Select items cannot carry an empty value — this internal sentinel
// maps to `null` ("platform default") at the preference boundary.
const PLATFORM_DEFAULT_VALUE = "__platform_default__";

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

  // Catalog-driven: text-model options are the live catalog rows whose
  // capabilities declare text output — never a hardcoded model-name list.
  const { models, isLoading } = useModelCatalog("user");
  // Hydrates the model registry (no-op when the shell already did) so the
  // platform-default resolver can name the is_primary model in the label.
  useModels();
  const platformDefaultName = useAppSelector(
    selectPlatformDefaultTextModelName,
  );
  const textModels = models.filter((m) => m.output.includes("text"));
  const modelOptions = [
    {
      value: PLATFORM_DEFAULT_VALUE,
      label: platformDefaultName
        ? `Platform default (${platformDefaultName})`
        : "Platform default",
    },
    ...textModels.map((m) => ({ value: m.id, label: m.name })),
  ];
  // A previously-stored value that is no longer a routable text model (e.g.
  // a legacy display-name string like "Claude-3") still renders — visibly
  // marked — so the user's stored preference is never silently blanked.
  if (model && !isLoading && !textModels.some((m) => m.id === model)) {
    modelOptions.push({ value: model, label: `${model} (unavailable)` });
  }

  return (
    <>
      <SettingsSubHeader
        title="Text generation"
        description="Defaults for text-generation surfaces."
        icon={Type}
      />
      <SettingsSection title="Model & style">
        <SettingsSelect
          label="Model"
          value={model ?? PLATFORM_DEFAULT_VALUE}
          onValueChange={(next) =>
            setModel(next === PLATFORM_DEFAULT_VALUE ? null : next)
          }
          options={modelOptions}
          placeholder={isLoading ? "Loading models..." : "Select a model"}
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
