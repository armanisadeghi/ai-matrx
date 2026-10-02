"use client";

import { Image as ImageIcon } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";

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
  // The chosen class of that model (Matrx Fast vs Matrx Lightning are separate
  // products); sent as `offering_id` beside `model`. null = preferred class.
  const [offeringId, setOfferingId] = useSetting<string | null>(
    "userPreferences.imageGeneration.defaultOfferingId",
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
      <PreferencesLoadGate what="your image generation defaults">
        <SettingsSection title="Output">
          <SettingsModelPicker
            label="Model"
            value={model}
            onValueChange={setModel}
            offeringId={offeringId ?? null}
            onOfferingIdChange={setOfferingId}
            scope="all"
            allowPlatformDefault
            platformDefaultLabel="AI Matrx default (chosen by the platform)"
            description="The AI Matrx default uses the platform's image model."
            defaultModality="image"
          />
          <SettingsSelect
            label="Style"
            description="Pre-fills the style field; change it per image."
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
      </PreferencesLoadGate>
      <SettingsCallout tone="info">
        Resolution, color palette, and automatic enhancement passes aren't
        supported by image generation yet, so there's nothing to default here
        for them.
      </SettingsCallout>
    </>
  );
}
