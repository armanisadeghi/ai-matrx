"use client";

/**
 * User-triggered measured-page window.
 *
 * This module is reached only through NodeMeasureCard's dynamic front door.
 * Keeping WindowPanel and the canonical CMS measure workspace together here
 * prevents either heavy graph from entering the Content Plan route at boot.
 */

import CmsPageMeasure from "@/features/cms/components/measure/CmsPageMeasure";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export default function NodeMeasureWindow({
  webPageId,
  nodeLabel,
  onClose,
}: {
  webPageId: string;
  nodeLabel: string;
  onClose: () => void;
}) {
  return (
    <WindowPanel
      id={`plan-node-measure-${webPageId}`}
      title={`Measurement — ${nodeLabel}`}
      onClose={onClose}
      width="70vw"
      height="82dvh"
      minWidth={420}
      minHeight={320}
      bodyClassName="flex min-h-0 flex-col overflow-auto p-0"
    >
      <CmsPageMeasure webPageId={webPageId} />
    </WindowPanel>
  );
}
