"use client";

import { Image as ImageIcon } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";

/**
 * Settings truth sweep (2026-09-25, lane ai-media-editor): resolution, color
 * palette, and "AI enhancements" were removed here — the /images/generate
 * pipeline (`features/image-studio/api/python.ts` → `generateImage`) has no
 * parameter for any of the three, and nothing else read them either. Model
 * and Style are real: both `app/(core)/images/generate/GenerateShellClient.tsx`
 * and `components/official/ImageAssetUploader.tsx`'s Generate tab now seed
 * from these two preferences and pass `model`/`style` to `generateImage()`.
 */
export default function ImageGenerationTab() {
  // null = no personal choice: nothing is sent and the server's image.generate
  // mandate model draws. The legacy seeded value "standard" is folded to null
  // at the load boundaries (stripLegacyDefaultModelSentinels).
  const [model, setModel] = useSetting<string | null>(
    "userPreferences.imageGeneration.defaultModel",
  );
  const [style, setStyle] = useSetting<string>(
    "userPreferences.imageGeneration.style",
  );

  return (
    <>
      <SettingsSubHeader
        title="Image generation"
        description="Default model and style for the /images/generate page and the image-generate picker."
        icon={ImageIcon}
      />
      <SettingsSection title="Output">
        <SettingsModelPicker
          label="Model"
          value={model}
          onValueChange={setModel}
          scope="all"
          allowPlatformDefault
          platformDefaultLabel="AI Matrx default (chosen by the platform)"
          description="Leave on the AI Matrx default to use whichever image model the platform has set for image generation."
          defaultModality="image"
        />
        <SettingsSelect
          label="Style"
          description="Seeds the style field when you open image generation — you can still change it per image."
          value={style}
          onValueChange={setStyle}
          placeholder="None — no style added"
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
          last
        />
      </SettingsSection>
      <SettingsCallout tone="info">
        Resolution, color palette, and automatic enhancement passes aren't
        supported by image generation yet, so there's nothing to default here
        for them.
      </SettingsCallout>
    </>
  );
}
