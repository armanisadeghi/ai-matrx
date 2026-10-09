"use client";

import React from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import GeneratedImageSetBlock from "@/components/mardown-display/blocks/media-io/GeneratedImageSetBlock";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const SAMPLE = [
  "/images/ai-cockpit-background.jpg",
  "/images/dashboard.jpg",
  "/images/hero-background.png",
  "/images/photo-edit-sample-image.jpg",
].map((url, index) => ({
  url,
  cdn_url: url,
  width: 1024,
  height: 1024,
  seed: 4100 + index,
}));

const code = `import GeneratedImageSetBlock from "@/components/mardown-display/blocks/media-io/GeneratedImageSetBlock";

<GeneratedImageSetBlock serverData={{ images, count, model, usage, isComplete: true }} />`;

export default function GeneratedImageSetDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;
  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Two or more images show in the Carousel viewer; one image keeps its single tile."
    >
      <div className="mx-auto w-full max-w-md">
        <GeneratedImageSetBlock
          serverData={{
            images: SAMPLE,
            count: SAMPLE.length,
            model: "image-model",
            usage: null,
            isComplete: true,
          }}
        />
      </div>
    </ComponentDisplayWrapper>
  );
}
