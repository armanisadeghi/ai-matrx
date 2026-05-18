/**
 * features/files/components/surfaces/single-file/ImagePreviewControls.tsx
 *
 * Left-rail controls for the Preview tab when previewKind === "image".
 * Drives `FileViewerControlsContext` — the ImagePreview reads back from
 * the same context.
 */

"use client";

import {
  Maximize,
  RotateCcw,
  RotateCw,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  IMAGE_ZOOM_STEP,
  useFileViewerControls,
} from "@/features/files/components/surfaces/FileViewerControlsContext";
import { ControlRailFrame, ControlRailSection } from "./FileViewerControlRail";
import {
  RailButton,
  RailIconButton,
  RailIconRow,
  RailSegmented,
  RailSlider,
  RailToggle,
} from "./RailControls";

export function ImagePreviewControls() {
  const c = useFileViewerControls();
  if (!c) return null;

  return (
    <ControlRailFrame>
      <ControlRailSection title="Fit">
        <RailSegmented
          value={c.imageFit}
          onChange={(next) => c.setImageFit(next)}
          options={[
            {
              value: "fit",
              label: "Fit",
              icon: <Maximize className="h-3 w-3" />,
            },
            {
              value: "actual",
              label: "100%",
              icon: <ScanLine className="h-3 w-3" />,
            },
          ]}
        />
      </ControlRailSection>

      <ControlRailSection title="Zoom">
        <RailIconRow>
          <RailIconButton
            icon={<ZoomOut className="h-3.5 w-3.5" />}
            ariaLabel="Zoom out"
            title="Zoom out"
            onClick={() => c.setImageZoom((z) => z - IMAGE_ZOOM_STEP)}
            disabled={c.imageZoom <= IMAGE_ZOOM_MIN}
          />
          <RailIconButton
            icon={<ZoomIn className="h-3.5 w-3.5" />}
            ariaLabel="Zoom in"
            title="Zoom in"
            onClick={() => c.setImageZoom((z) => z + IMAGE_ZOOM_STEP)}
            disabled={c.imageZoom >= IMAGE_ZOOM_MAX}
          />
        </RailIconRow>
        <RailSlider
          value={c.imageZoom}
          onChange={c.setImageZoom}
          min={IMAGE_ZOOM_MIN}
          max={IMAGE_ZOOM_MAX}
          step={0.05}
          formatValue={(n) => `${Math.round(n * 100)}%`}
        />
      </ControlRailSection>

      <ControlRailSection title="Rotate">
        <RailIconRow>
          <RailIconButton
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            ariaLabel="Rotate left"
            title="Rotate left 90\u00b0"
            onClick={() => {
              const next = ((c.imageRotation + 270) % 360) as
                | 0
                | 90
                | 180
                | 270;
              c.setImageRotation(next);
            }}
          />
          <RailIconButton
            icon={<RotateCw className="h-3.5 w-3.5" />}
            ariaLabel="Rotate right"
            title="Rotate right 90\u00b0"
            onClick={() => {
              const next = ((c.imageRotation + 90) % 360) as 0 | 90 | 180 | 270;
              c.setImageRotation(next);
            }}
          />
        </RailIconRow>
      </ControlRailSection>

      <ControlRailSection title="Background">
        <RailToggle
          label="Transparency grid"
          active={c.imageTransparencyGrid}
          onClick={() => c.setImageTransparencyGrid(!c.imageTransparencyGrid)}
          title="Show a checkered background so transparent pixels are visible"
        />
      </ControlRailSection>

      <div className="mt-auto">
        <RailButton
          icon={<ScanLine className="h-3.5 w-3.5" />}
          label="Reset view"
          onClick={() => c.resetImage()}
        />
      </div>
    </ControlRailFrame>
  );
}
