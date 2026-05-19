"use client";

/**
 * Annotate mode — screenshot markup with marker.js 2.
 *
 * Different mental model from Edit mode:
 *   • The image itself isn't modified — we render a flat output that BAKES
 *     the annotations on top of the original.
 *   • Defaults are tuned for instructional screenshots: arrows + callouts +
 *     boxes + freehand, no filters/fine-tune.
 *   • AI assists planned (next wave): suggest annotations, redact PII, blur
 *     faces. The buttons are present but stub-friendly while the agents +
 *     Python endpoints are still being implemented.
 *
 * marker.js 2 is a class-based imperative library (not a React component) —
 * we mount it onto an `<img>` ref inside an effect, listen for `render`,
 * and pipe the resulting dataUrl through our save helper.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, ShieldAlert, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useImageSource } from "../shared/use-image-source";
import { saveEditedImage } from "../shared/save-edited-image";
import type { ModeShellProps } from "../shared/types";
import { detectFaces } from "../../api/python";

const ANNOTATE_FOLDER = "Images/Annotated";

interface RenderEvent {
  dataUrl: string;
  state: unknown;
}

export function AnnotateModeShell({
  source,
  defaultFolder = ANNOTATE_FOLDER,
  presentation = "page",
  onSave,
  onCancel,
}: ModeShellProps) {
  const { url, filename } = useImageSource(source);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerAreaRef = useRef<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<null | "redact" | "faces">(null);

  const startEditor = useCallback(async () => {
    if (!imgRef.current || !containerRef.current) return;
    if (markerAreaRef.current) return; // already open
    const { MarkerArea } = await import("markerjs2");
    const ma = new MarkerArea(imgRef.current);
    ma.targetRoot = containerRef.current;
    ma.settings.displayMode = "inline";
    ma.uiStyleSettings.zIndex = "30";
    ma.addEventListener("render", (event: RenderEvent) => {
      void persist(event.dataUrl);
    });
    ma.addEventListener("close", () => {
      markerAreaRef.current = null;
    });
    ma.show();
    markerAreaRef.current = ma;
  }, []);

  const persist = useCallback(
    async (dataUrl: string) => {
      setSaving(true);
      try {
        const blob = dataUrlToBlob(dataUrl);
        const result = await saveEditedImage({
          blob,
          filename: replaceExt(filename, "png", "-annotated"),
          folderPath: defaultFolder,
          mime: "image/png",
          metadata: { kind: "annotation", source_filename: filename },
        });
        toast.success("Annotated image saved.");
        onSave?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [defaultFolder, filename, onSave],
  );

  // Auto-open the editor as soon as the image is decoded — annotation flows
  // assume immediate engagement; there's no "preview before edit" step.
  const handleImgLoad = useCallback(() => {
    void startEditor();
  }, [startEditor]);

  useEffect(() => {
    return () => {
      const ma = markerAreaRef.current as { close?: () => void } | null;
      if (ma && typeof ma.close === "function") ma.close();
    };
  }, []);

  const handleSuggestAnnotations = () => {
    toast.info(
      "Suggest annotations agent ships next wave — see features/image-studio/AI-AGENTS.md",
    );
  };

  const handleRedact = () => {
    toast.info(
      "PII redaction agent ships next wave — see features/image-studio/AI-AGENTS.md",
    );
  };

  const handleBlurFaces = async () => {
    if (source?.kind !== "cloudFileId") {
      toast.info(
        "Face blur needs the image to be saved first — upload, then re-open.",
      );
      return;
    }
    setAiBusy("faces");
    try {
      const { faces } = await detectFaces({ source_id: source.cloudFileId });
      if (faces.length === 0) {
        toast.info("No faces detected.");
        return;
      }
      // marker.js doesn't expose a programmatic-marker API in v2. Surface
      // the detected count + leave the user to draw blur boxes — the
      // detected coordinates are still useful for visual reference.
      toast.success(
        `Detected ${faces.length} face${faces.length === 1 ? "" : "s"}. Use the freehand or rectangle marker to obscure them.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Face detect failed";
      toast.info(
        /404|not.*implement/i.test(msg)
          ? "Face detection ships next wave."
          : msg,
      );
    } finally {
      setAiBusy(null);
    }
  };

  if (!url) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        No image loaded.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card/40 px-3 py-1.5 shrink-0">
        <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
          <Zap className="h-3 w-3" />
          AI assist
        </span>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={handleSuggestAnnotations}
          disabled={aiBusy !== null}
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          Suggest annotations
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={handleRedact}
          disabled={aiBusy !== null}
        >
          <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
          Redact PII
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={handleBlurFaces}
          disabled={aiBusy !== null}
        >
          {aiBusy === "faces" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
          )}
          Detect faces
        </Button>

        <div className="flex-1" />

        {presentation === "modal" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={onCancel}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 relative bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt={filename}
          onLoad={handleImgLoad}
          crossOrigin="anonymous"
          className="absolute inset-0 m-auto max-h-full max-w-full"
        />
        {saving && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-50">
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-card border border-border shadow">
              <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Saving annotated image...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  const mime = /data:([^;]+);/.exec(meta)?.[1] ?? "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function replaceExt(filename: string, newExt: string, suffix = ""): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  return `${stem}${suffix}.${newExt}`;
}

// Keep Save icon importable from this module (used by route headers).
export { Save };
