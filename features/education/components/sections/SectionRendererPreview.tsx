"use client";

import { RichContent } from "@/components/rich-content/RichContent";
import type { EduSection } from "../../types";
import { SectionRendererBase } from "./SectionRendererBase";

/** The editor re-renders prose as the author types. */
export function SectionRendererPreview({ sections }: { sections: EduSection[] }) {
  return (
    <SectionRendererBase
      sections={sections}
      renderProse={(source) => <RichContent level="standard" source={source} />}
    />
  );
}
