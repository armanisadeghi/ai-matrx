"use client";

/**
 * PdfRegionContextMenu — right-click actions on drawn PDF regions.
 *
 * The missing half of the annotation-first PDF editing build: the layer has
 * emitted region right-clicks since day one (2026-05-11) but no consumer ever
 * rendered a menu, and the backend actions (extract-at-bbox, promote-to-entity,
 * redact toggle, delete) sat unused. This wires them — as a v3 universal menu,
 * NOT a bespoke fork:
 *
 *   - Wraps the canvas in `NonEditableContextMenu` using the single-instance
 *     delegation pattern (`resolveContextOnOpen` reads the right-clicked
 *     element's `data-region-id`, which `PdfAnnotationLayer` already stamps
 *     on every region div).
 *   - Region actions arrive via `extraSections`; everything else (Copy, AI,
 *     agents, Export…) is the standard menu acting on the region's extracted
 *     text as `content`.
 *   - Background right-clicks (no region) show the plain menu — correct.
 *
 * IMPORTANT: do NOT pass `onRegionContextMenu` to the canvas/layer when using
 * this wrapper — the layer's own handler would `preventDefault` and the menu
 * would never open. The layer early-returns when that prop is absent, letting
 * the event bubble here.
 */

import { useState } from "react";
import { flushSync } from "react-dom";
import { EyeOff, Network, ScanText, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import {
  extractAtBbox,
  promoteAnnotationToEntity,
  type AnnotationOut,
  type AnnotationUpdateBody,
} from "@/features/file-analysis/api/file-analysis";

export interface PdfRegionContextMenuProps {
  fileId: string;
  annotations: AnnotationOut[];
  updateAnnotation: (
    annotationId: string,
    body: AnnotationUpdateBody,
  ) => Promise<AnnotationOut>;
  removeAnnotation: (annotationId: string) => Promise<void>;
  /** Sync the studio's selection to the right-clicked region. */
  onSelectAnnotation?: (annotationId: string) => void;
  children: React.ReactNode;
}

export function PdfRegionContextMenu({
  fileId,
  annotations,
  updateAnnotation,
  removeAnnotation,
  onSelectAnnotation,
  children,
}: PdfRegionContextMenuProps) {
  // The region under the last right-click, resolved at menu-open time.
  // State (not a ref) — extraSections are derived from it during render.
  const [activeRegion, setActiveRegion] = useState<AnnotationOut | null>(null);

  const handleExtract = async (region: AnnotationOut) => {
    try {
      const { data } = await extractAtBbox(fileId, {
        page_number: region.page_number,
        bbox: {
          x0: region.bbox.x0,
          y0: region.bbox.y0,
          x1: region.bbox.x1,
          y1: region.bbox.y1,
        },
        include_preview: false,
      });
      const text = data.extracted_text?.trim();
      if (!text) {
        toast({ title: "No text found in this region" });
        return;
      }
      await navigator.clipboard.writeText(text);
      // Persist onto the annotation when it has nothing yet, so the text
      // shows up in the inspector and future menus without re-extracting.
      if (!region.extracted_text) {
        await updateAnnotation(region.id, { extracted_text: text });
      }
      toast({
        title: `Extracted ${data.char_count} characters`,
        description: "Copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Extract failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handlePromote = async (region: AnnotationOut) => {
    try {
      const { data } = await promoteAnnotationToEntity(fileId, region.id);
      toast({
        title: "Promoted to entity",
        description: data.label ?? region.label,
      });
    } catch (err) {
      toast({
        title: "Promote failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleToggleRedact = async (region: AnnotationOut) => {
    try {
      await updateAnnotation(region.id, { redact: !region.redact });
      toast({
        title: region.redact ? "Region unredacted" : "Region marked for redaction",
      });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (region: AnnotationOut) => {
    const ok = await confirm({
      title: `Delete region "${region.label}"?`,
      description: "The annotation and its extracted data are removed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeAnnotation(region.id);
      toast({ title: "Region deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const extraSections: ContextMenuExtraSection[] = activeRegion
    ? [
        {
          id: "pdf-region",
          label: `Region — ${activeRegion.label}`,
          anchor: "after-clipboard",
          items: [
            {
              kind: "item",
              id: "region-extract",
              label: "Extract text here",
              description: "Server-side extraction, copied to clipboard",
              icon: ScanText,
              onSelect: () => void handleExtract(activeRegion),
            },
            {
              kind: "item",
              id: "region-promote",
              label: activeRegion.entity_id
                ? "Promoted to entity"
                : "Promote to entity",
              icon: Network,
              disabled: Boolean(activeRegion.entity_id),
              onSelect: () => void handlePromote(activeRegion),
            },
            {
              kind: "item",
              id: "region-redact",
              label: activeRegion.redact
                ? "Remove redaction mark"
                : "Mark for redaction",
              icon: EyeOff,
              onSelect: () => void handleToggleRedact(activeRegion),
            },
            {
              kind: "item",
              id: "region-delete",
              label: "Delete region",
              icon: Trash2,
              destructive: true,
              onSelect: () => void handleDelete(activeRegion),
            },
          ],
        },
      ]
    : [];

  return (
    <NonEditableContextMenu
      sourceFeature="files"
      contextData={{ file_id: fileId }}
      resolveContextOnOpen={(target) => {
        const hit = target?.closest?.("[data-region-id]");
        const regionId =
          hit instanceof HTMLElement ? hit.dataset.regionId : undefined;
        const region = regionId
          ? (annotations.find((a) => a.id === regionId) ?? null)
          : null;
        // `resolveContextOnOpen` runs inside the menu's open handler, BEFORE
        // it renders its content — but `extraSections` is derived from
        // `activeRegion` during render. A plain `setActiveRegion` is one tick
        // too late: the menu opens showing the PREVIOUS region (null on the
        // first right-click), so the region actions were always one click
        // behind and looked broken. `flushSync` commits the state now, so the
        // menu renders with this region's actions on the very first open.
        flushSync(() => setActiveRegion(region));
        if (!region) return null;
        onSelectAnnotation?.(region.id);
        return {
          content: region.extracted_text ?? region.label,
          region_id: region.id,
          region_label: region.label,
          region_category: region.label_category,
          page_number: region.page_number,
        };
      }}
      extraSections={extraSections}
      enableFloatingIcon={false}
    >
      {/* Real DOM element for the Radix asChild trigger — a component child
          would silently drop the trigger's cloned event handlers. */}
      <div className="relative h-full w-full">{children}</div>
    </NonEditableContextMenu>
  );
}
