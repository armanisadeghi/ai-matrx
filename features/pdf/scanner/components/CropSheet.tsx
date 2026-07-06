"use client";

/**
 * CropSheet — per-photo crop drawer.
 *
 * Opens on an uploaded image item, auto-runs server boundary detection
 * (`POST /images/detect-document`), and draws the result as a draggable
 * QuadEditor overlay. The user accepts, adjusts, resets to full frame, or
 * cancels. Crops are stored as quad JSON on the item and applied
 * SERVER-SIDE at PDF build time — originals are never touched.
 *
 * The editor works on the displayed image; the quad the detector returns
 * and the quad the server crops with share the same post-EXIF-transpose
 * coordinate space, so no conversion happens anywhere.
 */

import React, { useCallback, useState } from "react";
import { Check, Loader2, Maximize2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useFileSrc } from "@/features/files";

import { detectDocument } from "../api";
import type { Quad, ScanItem, ScanRotation } from "../types";
import { QuadEditor, fullFrameQuad } from "./QuadEditor";

interface CropSheetProps {
  item: ScanItem | null;
  onClose: () => void;
  onApply: (itemId: string, quad: Quad | null, rotation: ScanRotation) => void;
}

export function CropSheet({ item, onClose, onApply }: CropSheetProps) {
  return (
    <Drawer open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        {/* Keyed remount resets all editor state per item — no sync effects. */}
        {item && (
          <CropEditor
            key={item.itemId}
            item={item}
            onClose={onClose}
            onApply={onApply}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function CropEditor({
  item,
  onClose,
  onApply,
}: {
  item: ScanItem;
  onClose: () => void;
  onApply: (itemId: string, quad: Quad | null, rotation: ScanRotation) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(item.quad ?? null);
  const [rotation, setRotation] = useState<ScanRotation>(item.rotation);
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);

  // Prefer the session-local preview; fall back to the uploaded file's URL
  // (resumed sessions have no local preview).
  const remoteSrc = useFileSrc(
    !item.previewUrl && item.fileId
      ? { kind: "file_id", fileId: item.fileId }
      : null,
  );
  const imageUrl = item.previewUrl ?? remoteSrc ?? null;

  // Dimension probe doubles as the detection trigger — an event handler,
  // so no setState-in-effect cascades.
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      setNaturalSize(size);
      if (quad) return; // re-editing an existing crop — keep it
      const fallback = fullFrameQuad(size.w, size.h);
      if (!item.fileId) {
        setQuad(fallback);
        return;
      }
      setDetecting(true);
      detectDocument(item.fileId)
        .then((res) => {
          if (res.found && res.quad) {
            setQuad(res.quad);
            setDetectNote(
              `Document detected (${Math.round(res.confidence * 100)}% confidence) — adjust the corners if needed`,
            );
          } else {
            setQuad(fallback);
            setDetectNote(
              "No document boundary detected — full frame selected",
            );
          }
        })
        .catch(() => {
          setQuad(fallback);
          setDetectNote("Boundary detection unavailable — full frame selected");
        })
        .finally(() => setDetecting(false));
    },
    [item.fileId, quad],
  );

  const isFullFrame =
    quad !== null &&
    naturalSize !== null &&
    JSON.stringify(quad) ===
      JSON.stringify(fullFrameQuad(naturalSize.w, naturalSize.h));

  const apply = useCallback(() => {
    if (!quad) return;
    // A full-frame quad means "no crop" — store null so the server skips
    // the warp entirely (faster, byte-identical page).
    onApply(item.itemId, isFullFrame ? null : quad, rotation);
    onClose();
  }, [item.itemId, quad, isFullFrame, rotation, onApply, onClose]);

  return (
    <>
      <DrawerHeader className="pb-2">
        <DrawerTitle className="text-sm">
          {detecting ? "Detecting document…" : "Adjust crop"}
        </DrawerTitle>
        {detectNote && !detecting && (
          <p className="text-xs text-muted-foreground">{detectNote}</p>
        )}
      </DrawerHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {imageUrl ? (
          <div className="relative mx-auto max-w-lg">
            {/* Probe reads dimensions + kicks off detection before the
                editor mounts. */}
            {!naturalSize && (
              <img
                src={imageUrl}
                alt=""
                className="w-full opacity-0"
                onLoad={handleImageLoad}
              />
            )}
            {naturalSize && quad && (
              <QuadEditor
                imageUrl={imageUrl}
                naturalWidth={naturalSize.w}
                naturalHeight={naturalSize.h}
                quad={quad}
                onChange={setQuad}
              />
            )}
            {(detecting || !naturalSize) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            Preview unavailable for this file format — the crop editor needs a
            browser-renderable image.
          </div>
        )}
      </div>

      <DrawerFooter className="flex-row gap-2 pb-safe pt-3">
        <Button
          variant="outline"
          size="sm"
          className="h-10"
          disabled={!naturalSize}
          onClick={() =>
            naturalSize && setQuad(fullFrameQuad(naturalSize.w, naturalSize.h))
          }
        >
          <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
          Full frame
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-10"
          onClick={() => setRotation(((rotation + 90) % 360) as ScanRotation)}
        >
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          {rotation ? `${rotation}°` : "Rotate"}
        </Button>
        <Button
          size="sm"
          className="h-10 flex-1"
          disabled={!quad || detecting}
          onClick={apply}
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Use crop
        </Button>
      </DrawerFooter>
    </>
  );
}
