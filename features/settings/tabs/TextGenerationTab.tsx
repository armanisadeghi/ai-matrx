"use client";

import { Type } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useModelCatalog } from "@/features/ai-models/hooks/useModelCatalog";
import { selectPlatformDefaultTextModelName } from "@/features/ai-models/redux/platformDefaultModel";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSetting } from "../hooks/useSetting";

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
          options={[
            { value: "neutral", label: "Neutral" },
            { value: "professional", label: "Professional" },
            { value: "casual", label: "Casual" },
            { value: "friendly", label: "Friendly" },
            { value: "formal", label: "Formal" },
            { value: "creative", label: "Creative" },
            { value: "technical", label: "Technical" },
            { value: "persuasive", label: "Persuasive" },
          ]}
        />
        <SettingsSelect
          label="Creativity"
          value={creativity}
          onValueChange={setCreativity}
          options={[
            { value: "low", label: "Low — factual" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High — creative" },
          ]}
        />
        <SettingsSelect
          label="Language"
          value={language}
          onValueChange={setLanguage}
          options={[
            { value: "en", label: "English" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
            { value: "de", label: "German" },
            { value: "it", label: "Italian" },
            { value: "pt", label: "Portuguese" },
            { value: "zh", label: "Chinese" },
            { value: "ja", label: "Japanese" },
            { value: "ko", label: "Korean" },
            { value: "ru", label: "Russian" },
          ]}
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
