/**
 * features/files/components/surfaces/single-file/HtmlPreviewControls.tsx
 *
 * Left-rail controls for the Preview tab when previewKind === "html".
 * Drives `FileViewerControlsContext` — the HtmlPreview reads `htmlMode`,
 * `htmlViewport`, and `htmlReloadKey` from the same context.
 */

"use client";

import {
  Code as CodeIcon,
  Eye,
  Monitor,
  RotateCw,
  Smartphone,
  Tablet,
  Tv,
} from "lucide-react";
import { useFileViewerControls } from "@/features/files/components/surfaces/FileViewerControlsContext";
import { ControlRailFrame, ControlRailSection } from "./FileViewerControlRail";
import { RailButton, RailSegmented } from "./RailControls";

export function HtmlPreviewControls() {
  const c = useFileViewerControls();
  if (!c) return null;

  return (
    <ControlRailFrame>
      <ControlRailSection title="View">
        <RailSegmented
          value={c.htmlMode}
          onChange={(next) => c.setHtmlMode(next)}
          options={[
            {
              value: "rendered",
              label: "Rendered",
              icon: <Eye className="h-3 w-3" />,
            },
            {
              value: "source",
              label: "Source",
              icon: <CodeIcon className="h-3 w-3" />,
            },
          ]}
        />
      </ControlRailSection>

      <ControlRailSection title="Viewport">
        <RailSegmented
          value={c.htmlViewport}
          onChange={(next) => c.setHtmlViewport(next)}
          options={[
            {
              value: "auto",
              label: "Auto",
              icon: <Monitor className="h-3 w-3" />,
            },
            {
              value: "mobile",
              label: "Phone",
              icon: <Smartphone className="h-3 w-3" />,
            },
          ]}
        />
        <RailSegmented
          value={c.htmlViewport}
          onChange={(next) => c.setHtmlViewport(next)}
          options={[
            {
              value: "tablet",
              label: "Tablet",
              icon: <Tablet className="h-3 w-3" />,
            },
            {
              value: "desktop",
              label: "Desktop",
              icon: <Tv className="h-3 w-3" />,
            },
          ]}
        />
      </ControlRailSection>

      <div className="mt-auto">
        <RailButton
          icon={<RotateCw className="h-3.5 w-3.5" />}
          label="Reload preview"
          onClick={() => c.reloadHtml()}
        />
      </div>
    </ControlRailFrame>
  );
}
