"use client";

import { Image as ImageIcon } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useModelCatalog } from "@/features/ai-models/hooks/useModelCatalog";
import { useSetting } from "../hooks/useSetting";

export default function ImageGenerationTab() {
  const [model, setModel] = useSetting<string>(
    "userPreferences.imageGeneration.defaultModel",
  );
  const [resolution, setResolution] = useSetting<string>(
    "userPreferences.imageGeneration.resolution",
  );
  const [style, setStyle] = useSetting<string>(
    "userPreferences.imageGeneration.style",
  );
  const [palette, setPalette] = useSetting<string>(
    "userPreferences.imageGeneration.colorPalette",
  );
  const [aiEnhance, setAiEnhance] = useSetting<boolean>(
    "userPreferences.imageGeneration.useAiEnhancements",
  );

  // Catalog-driven: the image-model options are the live catalog rows whose
  // capabilities declare image output — never a hardcoded model-name list.
  const { models, isLoading } = useModelCatalog("user");
  const imageModels = models.filter((m) => m.output.includes("image"));
  const modelOptions = imageModels.map((m) => ({ value: m.id, label: m.name }));
  // A previously-stored value that is no longer a routable image model (or a
  // legacy preset string like "standard") still renders — visibly marked — so
  // the user's stored preference is never silently blanked or rewritten.
  if (model && !isLoading && !imageModels.some((m) => m.id === model)) {
    modelOptions.push({ value: model, label: `${model} (unavailable)` });
  }

  return (
    <>
      <SettingsSubHeader
        title="Image generation"
        description="Default model and style presets for AI image generation."
        icon={ImageIcon}
      />
      <SettingsSection title="Output">
        <SettingsSelect
          label="Model"
          value={model}
          onValueChange={setModel}
          options={modelOptions}
          placeholder={isLoading ? "Loading models..." : "Select a model"}
        />
        <SettingsSelect
          label="Resolution"
          value={resolution}
          onValueChange={setResolution}
          options={[
            { value: "4k", label: "4K" },
            { value: "1080p", label: "1080p" },
            { value: "720p", label: "720p" },
            { value: "512", label: "512 × 512" },
            { value: "1024", label: "1024 × 1024" },
          ]}
        />
        <SettingsSelect
          label="Style"
          value={style}
          onValueChange={setStyle}
          options={[
            { value: "realistic", label: "Realistic" },
            { value: "artistic", label: "Artistic" },
            { value: "anime", label: "Anime" },
            { value: "cartoon", label: "Cartoon" },
            { value: "3d-render", label: "3D render" },
            { value: "digital-art", label: "Digital art" },
            { value: "oil-painting", label: "Oil painting" },
            { value: "watercolor", label: "Watercolor" },
            { value: "sketch", label: "Sketch" },
          ]}
        />
        <SettingsSelect
          label="Color palette"
          value={palette}
          onValueChange={setPalette}
          options={[
            { value: "vibrant", label: "Vibrant" },
            { value: "muted", label: "Muted" },
            { value: "pastel", label: "Pastel" },
            { value: "monochrome", label: "Monochrome" },
            { value: "warm", label: "Warm" },
            { value: "cool", label: "Cool" },
            { value: "natural", label: "Natural" },
          ]}
        />
        <SettingsSwitch
          label="AI enhancements"
          description="Apply post-generation upscaling and detail passes."
          checked={aiEnhance}
          onCheckedChange={setAiEnhance}
          last
        />
      </SettingsSection>
    </>
  );
}
