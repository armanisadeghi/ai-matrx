"use client";

import { Image as ImageIcon } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting } from "../hooks/useSetting";

export default function ImageGenerationTab() {
  // null = platform default (catalog-resolved via is_primary). The legacy
  // seeded value "standard" is folded to null at the load boundaries
  // (stripLegacyDefaultModelSentinels).
  const [model, setModel] = useSetting<string | null>(
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

  return (
    <>
      <SettingsSubHeader
        title="Image generation"
        description="Default model and style presets for AI image generation."
        icon={ImageIcon}
      />
      <SettingsSection title="Output">
        <SettingsModelPicker
          label="Model"
          value={model}
          onValueChange={setModel}
          scope="all"
          allowPlatformDefault
          defaultModality="image"
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
