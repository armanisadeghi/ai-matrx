import "server-only";

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import type { EduSection } from "../../types";
import { SectionRendererBase } from "./SectionRendererBase";

/** Public pages keep authored prose in the initial HTML for crawlers. */
export function SectionRenderer({ sections }: { sections: EduSection[] }) {
  return (
    <SectionRendererBase
      sections={sections}
      renderProse={(source) => <RichContentServer level="standard" source={source} />}
    />
  );
}
