"use client";

import { useState } from "react";
import { BackdropGallery } from "./BackdropGallery";
import { DraggableGlassWidget } from "./DraggableGlassWidget";
import { GLASS_VARIANTS, VariantPicker } from "./VariantPicker";

export default function GlassLabClient() {
  const [activeId, setActiveId] = useState<string>("v1");
  const variant =
    GLASS_VARIANTS.find((v) => v.id === activeId) ?? GLASS_VARIANTS[0];

  return (
    <>
      <BackdropGallery />
      <DraggableGlassWidget
        variantClass={variant.className}
        adaptive={!!variant.adaptive}
      />
      <VariantPicker activeId={activeId} onSelect={setActiveId} />
    </>
  );
}
