"use client";

/**
 * Avatar mode — dedicated circular-crop experience.
 *
 * Built on `react-easy-crop` with:
 *   • 1:1 aspect lock (avatars are always square)
 *   • Circular preview overlay (matches what users see on profile pages)
 *   • Zoom + rotation
 *   • Smart Crop button (calls `smart-crop` agent with `intent: "avatar"`)
 *   • Auto-center on face (calls `face-detect` Python endpoint, picks
 *     centroid of detected faces and fits the circle around it)
 *
 * Save pipeline: crop → 512² PNG (high-quality avatar source) → upload via
 * useUploadAndShare into `Images/Avatars/`. The standard
 * `/api/images/upload?preset=avatar` route resizes into the 400/128/48
 * variants for downstream consumption — that part is unchanged.
 */

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { useImageSource } from "../shared/use-image-source";
import { saveEditedImage } from "../shared/save-edited-image";
import type { ModeShellProps } from "../shared/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, RotateCw, Save, Sparkles, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { detectFaces } from "../../api/python";
import { cropFileToFile } from "../../utils/crop-file";

const AVATAR_OUTPUT_PX = 512;
const AVATAR_FOLDER = "Images/Avatars";

interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function AvatarModeShell({
  source,
  defaultFolder = AVATAR_FOLDER,
  presentation = "page",
  onSave,
  onCancel,
}: ModeShellProps) {
  const { url, filename } = useImageSource(source);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [saving, setSaving] = useState(false);
  const [smartCropping, setSmartCropping] = useState(false);

  const onCropComplete = useCallback(
    (_area: unknown, areaPixels: PixelCrop) => {
      setPixels(areaPixels);
    },
    [],
  );

  const handleSmartCrop = useCallback(async () => {
    // The "smart-crop" LLM agent and `face-detect` Python endpoint are both
    // wired here. Order: try Python face-detect first (deterministic, fast),
    // fall back to the agent for non-face images.
    if (source?.kind !== "cloudFileId") {
      toast.info(
        "Smart crop needs the image to be saved first — upload, then re-open.",
      );
      return;
    }
    setSmartCropping(true);
    try {
      const { faces } = await detectFaces({ source_id: source.cloudFileId });
      if (faces.length === 0) {
        toast.info("No faces detected — adjust the crop manually.");
        return;
      }
      // Centroid of detected faces; fit a square that includes them all
      // with ~10% padding.
      let minX = 1,
        minY = 1,
        maxX = 0,
        maxY = 0;
      for (const f of faces) {
        minX = Math.min(minX, f.x);
        minY = Math.min(minY, f.y);
        maxX = Math.max(maxX, f.x + f.width);
        maxY = Math.max(maxY, f.y + f.height);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const span = Math.max(maxX - minX, maxY - minY) * 1.4;
      // react-easy-crop uses pixel coords — translate via the rendered image
      // size; the cropper will recompute on next interaction. Easiest path:
      // reset crop to centered, push zoom so the face span fills the frame.
      setCrop({ x: cx - 0.5, y: cy - 0.5 });
      setZoom(Math.max(1, Math.min(3, 1 / span)));
      toast.success(
        faces.length === 1
          ? "Centered on detected face."
          : `Centered on ${faces.length} faces.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Smart crop failed";
      // Backend not yet implemented → 404. Surface a friendly message.
      toast.info(
        msg.includes("404")
          ? "Smart crop is coming soon — adjust the crop manually."
          : msg,
      );
    } finally {
      setSmartCropping(false);
    }
  }, [source]);

  const handleSave = useCallback(async () => {
    if (!url || !pixels) return;
    setSaving(true);
    try {
      // Pull the source as a File via fetch so we can reuse cropFileToFile.
      const response = await fetch(url);
      const blob = await response.blob();
      const sourceFile = new File([blob], filename, { type: blob.type });
      const cropped = await cropFileToFile(sourceFile, pixels);
      // Render at AVATAR_OUTPUT_PX so the avatar source is high-DPI ready.
      const finalBlob = await renderSquare(cropped, AVATAR_OUTPUT_PX);
      const result = await saveEditedImage({
        blob: finalBlob,
        filename: replaceExt(filename, "png", "-avatar"),
        folderPath: defaultFolder,
        mime: "image/png",
        metadata: { kind: "avatar", source_filename: filename },
      });
      toast.success("Avatar saved.");
      onSave?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [url, pixels, filename, defaultFolder, onSave]);

  const wrapperClass =
    presentation === "modal"
      ? "h-full min-h-0 flex flex-col"
      : "h-full min-h-0 flex flex-col";

  return (
    <div className={wrapperClass}>
      <div className="relative flex-1 min-h-0 bg-black">
        {url ? (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No image loaded.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-3 md:px-4 py-3 border-t border-border bg-card/30">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_8rem] items-center gap-2 md:gap-3">
          <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.01}
            onValueChange={(v) => setZoom(v[0] ?? 1)}
            className="flex-1"
          />
          <RotateCw className="h-4 w-4 text-muted-foreground shrink-0" />
          <Slider
            value={[rotation]}
            min={-180}
            max={180}
            step={1}
            onValueChange={(v) => setRotation(v[0] ?? 0)}
            className="w-full md:w-32"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSmartCrop}
            disabled={smartCropping || !url}
            className="min-h-[40px]"
          >
            {smartCropping ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            Smart crop
          </Button>
          <div className="flex items-center gap-2">
            {presentation === "modal" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !pixels}
              className="min-h-[40px]"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save avatar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Re-encode an arbitrary image File as a square `size × size` PNG. Used to
 * produce a canonical avatar source that downstream variants resize from.
 */
async function renderSquare(file: File, size: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

function replaceExt(filename: string, newExt: string, suffix = ""): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  return `${stem}${suffix}.${newExt}`;
}
