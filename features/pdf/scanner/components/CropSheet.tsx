"use client";

/**
 * CropSheet — per-photo crop drawer.
 *
 * Non-negotiable: the FIRST render shows the entire image with all four
 * corner handles visible. The editor is sized to the measured drawer
 * body (never overflow-scrolled), and QuadEditor auto-fits the view to
 * the quad on every change.
 *
 * Rotation is REAL here: the preview physically rotates (a canvas-
 * rendered display copy) and the quad is coordinate-mapped between the
 * original space (what the server crops with — crop applies BEFORE
 * rotation) and the rotated display space, so corners stay attached to
 * the same document points while you rotate.
 *
 * Detection: the background pass usually pre-populates the quad; if
 * nothing was found, the conservative pass runs on open, and "Try
 * harder" fires the relaxed server pass (brightness region + rect
 * fallback).
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, Loader2, Maximize2, RotateCw, ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useFileSrc } from "@/features/files";

import { detectDocument } from "../api";
import { ENHANCE_LABELS, applyEnhance } from "../enhance";
import type {
  Quad,
  QuadPoint,
  ScanEnhanceMode,
  ScanItem,
  ScanRotation,
} from "../types";
import { QuadEditor, fullFrameQuad } from "./QuadEditor";

/** Enhance selection carried out of the sheet on Apply. */
export interface CropEnhance {
  mode: ScanEnhanceMode | undefined;
  fileId: string | undefined;
}

interface CropSheetProps {
  item: ScanItem | null;
  onClose: () => void;
  onApply: (
    itemId: string,
    quad: Quad | null,
    rotation: ScanRotation,
    enhance: CropEnhance,
  ) => void;
}

export function CropSheet({ item, onClose, onApply }: CropSheetProps) {
  return (
    <Drawer open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="h-[92dvh]">
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

// ── Rotation coordinate maps (θ clockwise; original size W×H) ────────────

function pointToDisplay(
  p: QuadPoint,
  rot: ScanRotation,
  w: number,
  h: number,
): QuadPoint {
  switch (rot) {
    case 90:
      return [h - p[1], p[0]];
    case 180:
      return [w - p[0], h - p[1]];
    case 270:
      return [p[1], w - p[0]];
    default:
      return p;
  }
}

function pointFromDisplay(
  p: QuadPoint,
  rot: ScanRotation,
  w: number,
  h: number,
): QuadPoint {
  switch (rot) {
    case 90:
      return [p[1], h - p[0]];
    case 180:
      return [w - p[0], h - p[1]];
    case 270:
      return [w - p[1], p[0]];
    default:
      return p;
  }
}

function quadToDisplay(q: Quad, rot: ScanRotation, w: number, h: number): Quad {
  return {
    top_left: pointToDisplay(q.top_left, rot, w, h),
    top_right: pointToDisplay(q.top_right, rot, w, h),
    bottom_right: pointToDisplay(q.bottom_right, rot, w, h),
    bottom_left: pointToDisplay(q.bottom_left, rot, w, h),
  };
}

function quadFromDisplay(q: Quad, rot: ScanRotation, w: number, h: number): Quad {
  return {
    top_left: pointFromDisplay(q.top_left, rot, w, h),
    top_right: pointFromDisplay(q.top_right, rot, w, h),
    bottom_right: pointFromDisplay(q.bottom_right, rot, w, h),
    bottom_left: pointFromDisplay(q.bottom_left, rot, w, h),
  };
}

/** Display bitmap cap — plenty for on-screen zoom without multi-MB data URLs. */
const DISPLAY_MAX_DIM = 2400;

/** Canvas-render a rotated display copy (rotation 0 passes through). */
function useRotatedImage(
  src: string | null,
  rotation: ScanRotation,
): { url: string | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; url: string | null }>({
    key: "",
    url: null,
  });
  const key = `${src}|${rotation}`;

  useEffect(() => {
    // Rotation 0 is derived directly below — this effect only renders
    // rotated copies (setState happens in the async onload callback).
    if (!src || rotation === 0) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, DISPLAY_MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      const swap = rotation % 180 !== 0;
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      setState({ key, url: canvas.toDataURL("image/jpeg", 0.85) });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, rotation, key]);

  if (rotation === 0) return { url: src, loading: false };
  return { url: state.key === key ? state.url : null, loading: state.key !== key };
}

function CropEditor({
  item,
  onClose,
  onApply,
}: {
  item: ScanItem;
  onClose: () => void;
  onApply: (
    itemId: string,
    quad: Quad | null,
    rotation: ScanRotation,
    enhance: CropEnhance,
  ) => void;
}) {
  // Quad state lives in ORIGINAL post-EXIF space (the server contract).
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [quad, setQuad] = useState<Quad | null>(item.quad ?? null);
  const [rotation, setRotation] = useState<ScanRotation>(item.rotation);
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [offerRetry, setOfferRetry] = useState(false);

  // Enhance (design: Original / Auto / Grayscale / B&W). Each pick runs the
  // platform image ops (non-destructive derivative); Apply carries the result.
  const [enhance, setEnhanceState] = useState<ScanEnhanceMode | undefined>(
    item.enhance,
  );
  const [enhancedFileId, setEnhancedFileId] = useState<string | undefined>(
    item.enhancedFileId,
  );
  const [enhanceBusy, setEnhanceBusy] = useState<ScanEnhanceMode | null>(null);

  const pickEnhance = useCallback(
    (mode: ScanEnhanceMode | undefined) => {
      if (enhanceBusy) return;
      if (mode === undefined) {
        setEnhanceState(undefined);
        setEnhancedFileId(undefined);
        return;
      }
      if (mode === enhance && enhancedFileId) return;
      if (!item.fileId) return; // chips disabled until uploaded anyway
      setEnhanceBusy(mode);
      applyEnhance(item.fileId, mode)
        .then((res) => {
          setEnhanceState(mode);
          setEnhancedFileId(res.fileId);
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error
              ? `Enhance failed: ${err.message}`
              : "Enhance failed — keeping the original.",
          );
        })
        .finally(() => setEnhanceBusy(null));
    },
    [enhanceBusy, enhance, enhancedFileId, item.fileId],
  );

  // Measured drawer-body area — the editor is sized to fit it exactly.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodySize, setBodySize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0)
        setBodySize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Prefer the session-local preview; fall back to the uploaded file's URL
  // (resumed sessions have no local preview).
  const remoteSrc = useFileSrc(
    !item.previewUrl && item.fileId
      ? { kind: "file_id", fileId: item.fileId }
      : null,
  );
  const imageUrl = item.previewUrl ?? remoteSrc ?? null;
  const rotated = useRotatedImage(imageUrl, rotation);

  const runDetect = useCallback(
    (mode: "standard" | "relaxed", sizeOverride?: { w: number; h: number }) => {
      const size = sizeOverride ?? naturalSize;
      if (!item.fileId || !size) return;
      setDetecting(true);
      setOfferRetry(false);
      detectDocument(item.fileId, mode)
        .then((res) => {
          if (res.found && res.quad) {
            setQuad(res.quad);
            setDetectNote(
              `Document detected (${Math.round(res.confidence * 100)}% confidence) — drag the corners to adjust`,
            );
            setOfferRetry(mode === "standard");
          } else {
            setQuad(fullFrameQuad(size.w, size.h));
            setDetectNote(
              mode === "standard"
                ? "No document boundary found"
                : "Still nothing — drag the corners manually",
            );
            setOfferRetry(mode === "standard");
          }
        })
        .catch(() => {
          setQuad(fullFrameQuad(size.w, size.h));
          setDetectNote("Detection unavailable — drag the corners manually");
        })
        .finally(() => setDetecting(false));
    },
    [item.fileId, naturalSize],
  );

  // Dimension probe doubles as the initial-detection trigger (an event
  // handler, not an effect): pre-detected quads render immediately,
  // otherwise the conservative pass runs now.
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      setNaturalSize(size);
      if (quad) {
        setOfferRetry(true); // allow re-running detection over an existing crop
        return;
      }
      if (item.fileId) {
        runDetect("standard", size);
      } else {
        setQuad(fullFrameQuad(size.w, size.h));
      }
    },
    [quad, item.fileId, runDetect],
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
    onApply(item.itemId, isFullFrame ? null : quad, rotation, {
      mode: enhance,
      fileId: enhance ? enhancedFileId : undefined,
    });
    onClose();
  }, [
    item.itemId,
    quad,
    isFullFrame,
    rotation,
    enhance,
    enhancedFileId,
    onApply,
    onClose,
  ]);

  // Display-space geometry (rotation-aware).
  const displayDims = naturalSize
    ? rotation % 180 !== 0
      ? { w: naturalSize.h, h: naturalSize.w }
      : naturalSize
    : null;
  // Editor viewport: fit the display aspect into the measured body with
  // breathing room so edge handles stay comfortably tappable.
  const editorSize =
    displayDims && bodySize
      ? (() => {
          const availW = Math.max(bodySize.w - 40, 80);
          const availH = Math.max(bodySize.h - 40, 80);
          const s = Math.min(availW / displayDims.w, availH / displayDims.h);
          return {
            w: Math.round(displayDims.w * s),
            h: Math.round(displayDims.h * s),
          };
        })()
      : null;

  const displayQuad =
    quad && naturalSize
      ? quadToDisplay(quad, rotation, naturalSize.w, naturalSize.h)
      : null;

  const handleEditorChange = useCallback(
    (dq: Quad) => {
      if (!naturalSize) return;
      setQuad(quadFromDisplay(dq, rotation, naturalSize.w, naturalSize.h));
    },
    [naturalSize, rotation],
  );

  const ready = Boolean(
    imageUrl && naturalSize && displayDims && editorSize && displayQuad && rotated.url,
  );

  return (
    <>
      <DrawerHeader className="pb-1 pt-3">
        <div className="flex items-center gap-2">
          <DrawerTitle className="text-sm">
            {detecting ? "Detecting document…" : "Adjust crop"}
          </DrawerTitle>
          {offerRetry && !detecting && item.fileId && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => runDetect("relaxed")}
            >
              <ScanSearch className="mr-1 h-3 w-3" />
              Try harder
            </Button>
          )}
        </div>
        {detectNote && !detecting && (
          <p className="text-left text-xs text-muted-foreground">{detectNote}</p>
        )}
      </DrawerHeader>

      {/* The measured, non-scrolling stage — the editor ALWAYS fits inside. */}
      <div
        ref={bodyRef}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        {imageUrl && (
          <>
            {/* Hidden probe reads the ORIGINAL dimensions once. */}
            {!naturalSize && (
              <img
                src={imageUrl}
                alt=""
                className="absolute h-px w-px opacity-0"
                onLoad={handleImageLoad}
              />
            )}
            {ready && (
              <div className="flex h-full w-full items-center justify-center">
                <QuadEditor
                  imageUrl={rotated.url as string}
                  naturalWidth={(displayDims as { w: number }).w}
                  naturalHeight={(displayDims as { h: number }).h}
                  viewportWidth={(editorSize as { w: number }).w}
                  viewportHeight={(editorSize as { h: number }).h}
                  quad={displayQuad as Quad}
                  onChange={handleEditorChange}
                />
              </div>
            )}
          </>
        )}
        {imageUrl && !ready && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!imageUrl && (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Preview unavailable for this file format — the crop editor needs a
            browser-renderable image.
          </div>
        )}
        {detecting && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Enhance row (design: Original / Auto / Grayscale / B&W) */}
      <div className="flex items-center gap-2 px-4 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Enhance
        </span>
        <div className="flex flex-1 gap-1.5">
          <EnhanceChip
            label="Original"
            active={enhance === undefined}
            busy={false}
            disabled={Boolean(enhanceBusy)}
            onClick={() => pickEnhance(undefined)}
          />
          {(Object.keys(ENHANCE_LABELS) as ScanEnhanceMode[]).map((mode) => (
            <EnhanceChip
              key={mode}
              label={ENHANCE_LABELS[mode]}
              active={enhance === mode}
              busy={enhanceBusy === mode}
              disabled={!item.fileId || Boolean(enhanceBusy)}
              onClick={() => pickEnhance(mode)}
            />
          ))}
        </div>
      </div>

      <DrawerFooter className="flex-row gap-2 pb-safe pt-2">
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
          disabled={!naturalSize}
          onClick={() => setRotation(((rotation + 90) % 360) as ScanRotation)}
        >
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          {rotation ? `${rotation}°` : "Rotate"}
        </Button>
        <Button
          size="sm"
          className="h-10 flex-1"
          disabled={!quad || detecting || Boolean(enhanceBusy)}
          onClick={apply}
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Use crop
        </Button>
      </DrawerFooter>
    </>
  );
}

function EnhanceChip({
  label,
  active,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && !active && "opacity-50",
      )}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}
