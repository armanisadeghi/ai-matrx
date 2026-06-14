// features/kg-suggestions/components/source-preview/SourcePreviewPanel.tsx
//
// The non-blocking, resizable, repositionable surface that floats the source
// preview beside whatever inbox the user is triaging from — built on the
// reusable `MatrxDynamicPanel` ("flexible panel"): no backdrop, the page stays
// interactive, and (critically) opening/closing it does NOT dismiss the
// suggestions drawer behind it. Mounted only while a preview target is active.
//
// The outer wrapper carries `data-source-preview-panel` so a host overlay
// (Sheet/Drawer) can detect interactions that originate inside the panel and
// refuse to treat them as an outside-click dismissal.

"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Lightbulb } from "lucide-react";
import { SuggestionSourcePreview } from "./SuggestionSourcePreview";
import type { SourcePreviewTarget } from "./SourcePreviewContext";

// MatrxDynamicPanel pulls in react-resizable-panels + dropdown chrome; only
// load it when a preview is actually opened.
const MatrxDynamicPanel = dynamic(
  () => import("@/components/matrx/resizable/MatrxDynamicPanel"),
  { ssr: false },
);

type PanelPosition = "left" | "right" | "top" | "bottom";

export interface SourcePreviewPanelProps {
  target: SourcePreviewTarget | null;
  onClose: () => void;
  /** Where the panel floats. Default 'right'; the drawer uses 'left'. */
  position?: PanelPosition;
}

export function SourcePreviewPanel({
  target,
  onClose,
  position = "right",
}: SourcePreviewPanelProps) {
  // Escape closes the preview first (and stops the event so the host inbox
  // doesn't also close).
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div data-source-preview-panel>
      <MatrxDynamicPanel
        initialPosition={position}
        isExpanded
        defaultExpanded
        onExpandedChange={(expanded) => {
          if (!expanded) onClose();
        }}
        defaultSize={38}
        minSize={22}
        maxSize={88}
        expandButtonProps={{ label: "Source" }}
        header={
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            Source preview
          </div>
        }
      >
        <SuggestionSourcePreview
          kind={target.kind}
          id={target.id}
          snippet={target.snippet}
          title={target.title ?? null}
          className="h-full"
        />
      </MatrxDynamicPanel>
    </div>
  );
}

export default SourcePreviewPanel;
