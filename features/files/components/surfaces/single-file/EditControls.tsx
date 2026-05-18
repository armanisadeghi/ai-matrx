/**
 * features/files/components/surfaces/single-file/EditControls.tsx
 *
 * Left-rail controls for the Edit tab. Forwards through
 * `FileViewerControlsContext` to Monaco's `updateOptions` (wired in
 * `CloudFileInlineEditor`'s useEffect).
 */

"use client";

import { Minus, Plus } from "lucide-react";
import {
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  useFileViewerControls,
} from "@/features/files/components/surfaces/FileViewerControlsContext";
import { ControlRailFrame, ControlRailSection } from "./FileViewerControlRail";
import {
  RailIconButton,
  RailIconRow,
  RailSegmented,
  RailSlider,
  RailToggle,
} from "./RailControls";

export function EditControls() {
  const c = useFileViewerControls();
  if (!c) return null;

  return (
    <ControlRailFrame>
      <ControlRailSection title="Font size">
        <RailIconRow>
          <RailIconButton
            icon={<Minus className="h-3.5 w-3.5" />}
            ariaLabel="Decrease font size"
            title="Decrease font size"
            onClick={() => c.setEditorFontSize((n) => n - 1)}
            disabled={c.editorFontSize <= EDITOR_FONT_MIN}
          />
          <RailIconButton
            icon={<Plus className="h-3.5 w-3.5" />}
            ariaLabel="Increase font size"
            title="Increase font size"
            onClick={() => c.setEditorFontSize((n) => n + 1)}
            disabled={c.editorFontSize >= EDITOR_FONT_MAX}
          />
        </RailIconRow>
        <RailSlider
          value={c.editorFontSize}
          onChange={c.setEditorFontSize}
          min={EDITOR_FONT_MIN}
          max={EDITOR_FONT_MAX}
          step={1}
          formatValue={(n) => `${n}px`}
        />
      </ControlRailSection>

      <ControlRailSection title="Layout">
        <RailToggle
          label="Word wrap"
          active={c.editorWordWrap}
          onClick={() => c.setEditorWordWrap(!c.editorWordWrap)}
        />
        <RailToggle
          label="Minimap"
          active={c.editorMinimap}
          onClick={() => c.setEditorMinimap(!c.editorMinimap)}
        />
      </ControlRailSection>

      <ControlRailSection title="Tab size">
        <RailSegmented
          value={c.editorTabSize}
          onChange={(next) => c.setEditorTabSize(next)}
          options={[
            { value: 2, label: "2" },
            { value: 4, label: "4" },
            { value: 8, label: "8" },
          ]}
        />
      </ControlRailSection>
    </ControlRailFrame>
  );
}
