"use client";

/**
 * Shared source picker for image-studio modes and overlay hosts.
 *
 * Returns an ImageSource without navigating or uploading. The consuming mode
 * owns the eventual save through the universal file handler.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Camera,
  Clipboard,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Monitor,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { toast } from "@/lib/toast";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";

interface ModeImagePickerProps {
  title: string;
  onPick: (source: ImageSource) => void;
  enableCapture?: boolean;
  captureHideSelectors?: string[];
  showLibraryLink?: boolean;
}

export function ModeImagePicker({
  title,
  onPick,
  enableCapture = false,
  captureHideSelectors,
  showLibraryLink = true,
}: ModeImagePickerProps) {
  const [urlInput, setUrlInput] = useState("");
  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    hideSelectors: captureHideSelectors,
  });

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    onPick({ kind: "file", file });
  };

  const handleClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        toast.info("Paste an image with Ctrl+V or Command+V");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1]?.split("+")[0] ?? "png";
        handleFile(
          new File([blob], `pasted-${Date.now()}.${extension}`, {
            type: imageType,
          }),
        );
        return;
      }
      toast.info("No image found in the clipboard");
    } catch {
      toast.info("Copy an image first, then click Paste image");
    }
  };

  const handleCapture = async (method: "tab" | "screen") => {
    try {
      const result =
        method === "tab"
          ? await captureTab()
          : await captureScreen();
      onPick({ kind: "file", file: result.file });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "AbortError") return;
      toast.error(
        method === "tab"
          ? "Could not capture this page"
          : "Could not capture the selected screen",
      );
    }
  };

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto overscroll-contain p-3 md:items-center md:p-6">
      <div className="flex w-full max-w-xl flex-col gap-4 md:gap-5">
        <div className="space-y-1 text-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {enableCapture
              ? "Drop an image, paste one, capture the page, or load an image URL."
              : "Drop an image, paste one, or load an image URL."}
          </p>
        </div>

        <label
          className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/30 py-8 transition-colors hover:bg-card/60 md:rounded-xl md:py-10"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.currentTarget.value = "";
            }}
          />
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm">Drop an image here or click to browse</div>
          <div className="text-xs text-muted-foreground">
            PNG, JPG, WebP, GIF
          </div>
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleClipboard()}
          >
            <Clipboard className="mr-1.5 h-4 w-4" />
            Paste image
          </Button>
          {enableCapture ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isCapturing}
                onClick={() => void handleCapture("tab")}
              >
                {isCapturing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-1.5 h-4 w-4" />
                )}
                Capture this page
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isCapturing}
                onClick={() => void handleCapture("screen")}
              >
                {isCapturing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Monitor className="mr-1.5 h-4 w-4" />
                )}
                Capture screen
              </Button>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="Paste an image URL"
            className="h-10 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            style={{ fontSize: "16px" }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!urlInput.trim()}
            className="min-h-[40px]"
            onClick={() => {
              const url = urlInput.trim();
              if (url) onPick({ kind: "url", url });
            }}
          >
            Load
          </Button>
        </div>

        {showLibraryLink ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            <span>or</span>
            <Link href="/files/all" className="underline hover:text-foreground">
              pick from your Cloud Files
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
