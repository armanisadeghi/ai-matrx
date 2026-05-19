"use client";

/**
 * AI assists strip — Suggest edits, Background remove, Upscale (2× / 4×),
 * AI edit by prompt. Lives inside the editor frame.
 *
 * Each AI op consumes the canonical `sourceCloudFileId` (the editor is
 * always operating on a saved cloud file by the time we get here). When
 * the mask overlay has been painted, the mask is uploaded as its own
 * cloud file and the resulting id is passed as `mask_id` so the backend
 * can constrain the op to the painted region.
 */

import { useCallback, useState } from "react";
import { ArrowUp, Eraser, Loader2, Sparkles, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fileHandler } from "@/features/files/handler/handler";
import {
  removeBackground,
  upscaleImage,
  editImage,
} from "../../api/python";
import type { MaskState } from "./use-mask-state";

interface Props {
  sourceCloudFileId: string | null;
  sourceUrl: string;
  onResult: (newUrl: string, newName: string) => void;
  mask: MaskState;
}

type Busy = null | "bg" | "up2" | "up4" | "edit" | "suggest";

export function EditAiToolbar({
  sourceCloudFileId,
  sourceUrl: _sourceUrl,
  onResult,
  mask,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const ensureId = (op: string): string | null => {
    if (sourceCloudFileId) return sourceCloudFileId;
    toast.info(`${op} needs a saved cloud file to work on.`);
    return null;
  };

  // Upload the painted mask (if any) as its own cloud file and return the
  // resulting id. Returns null when the mask is empty so callers can omit
  // the parameter and the backend defaults to unmasked behavior.
  const resolveMaskId = useCallback(
    async (sourceFileId: string): Promise<string | null> => {
      if (!mask.hasPixels) return null;
      const blob = await mask.exportPng();
      if (!blob) return null;
      const file = new File(
        [blob],
        `mask-${sourceFileId}-${Date.now()}.png`,
        { type: "image/png" },
      );
      const normalized = await fileHandler.upload(
        { kind: "file", file },
        {
          folderPath: "Images/Masks",
          visibility: "private",
          metadata: {
            kind: "mask",
            source_file_id: sourceFileId,
          },
        },
      );
      return normalized.fileId ?? null;
    },
    [mask],
  );

  const handleBgRemove = async () => {
    const id = ensureId("Background remove");
    if (!id) return;
    setBusy("bg");
    try {
      const maskId = await resolveMaskId(id);
      const { file } = await removeBackground({
        source_id: id,
        ...(maskId ? { mask_id: maskId } : {}),
      });
      onResult(file.public_url, deriveName(file.public_url, "no-bg.png"));
    } catch (err) {
      handleApiError(err, "Background remove");
    } finally {
      setBusy(null);
    }
  };

  const handleUpscale = async (factor: 2 | 4) => {
    const id = ensureId("Upscale");
    if (!id) return;
    setBusy(factor === 2 ? "up2" : "up4");
    try {
      const { file } = await upscaleImage({ source_id: id, factor });
      onResult(file.public_url, deriveName(file.public_url, `${factor}x.png`));
    } catch (err) {
      handleApiError(err, `${factor}× upscale`);
    } finally {
      setBusy(null);
    }
  };

  const handleEditPrompt = async () => {
    const id = ensureId("AI edit");
    if (!id) return;
    if (!editPrompt.trim()) {
      toast.info("Type what you want changed.");
      return;
    }
    setBusy("edit");
    try {
      const maskId = await resolveMaskId(id);
      const { file } = await editImage({
        source_id: id,
        prompt: editPrompt.trim(),
        ...(maskId ? { mask_id: maskId } : {}),
      });
      onResult(file.public_url, deriveName(file.public_url, "edited.png"));
      setEditOpen(false);
      setEditPrompt("");
    } catch (err) {
      handleApiError(err, "AI edit");
    } finally {
      setBusy(null);
    }
  };

  const handleSuggestEdits = () => {
    toast.info(
      "Suggest edits agent ships next wave — see features/image-studio/AI-AGENTS.md",
    );
  };

  const idMissing = !sourceCloudFileId;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/40 px-2 py-1 shrink-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1 flex items-center gap-1 shrink-0">
        <Sparkles className="h-3 w-3" />
        AI
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={handleSuggestEdits}
            disabled={busy !== null}
          >
            {busy === "suggest" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Suggest
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ask AI what edits this image needs</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={handleBgRemove}
            disabled={busy !== null || idMissing}
          >
            {busy === "bg" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eraser className="h-3.5 w-3.5" />
            )}
            Remove BG
            {mask.hasPixels ? (
              <span className="text-[9px] uppercase tracking-wide text-primary/80">
                masked
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Remove background → transparent PNG
          {mask.hasPixels ? " (constrained to mask)" : ""}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={() => handleUpscale(2)}
            disabled={busy !== null || idMissing}
          >
            {busy === "up2" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
            2×
          </Button>
        </TooltipTrigger>
        <TooltipContent>Upscale 2×</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={() => handleUpscale(4)}
            disabled={busy !== null || idMissing}
          >
            {busy === "up4" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
            4×
          </Button>
        </TooltipTrigger>
        <TooltipContent>Upscale 4×</TooltipContent>
      </Tooltip>

      <div className="hidden md:block flex-1" />

      {editOpen ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            autoFocus
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleEditPrompt();
              if (e.key === "Escape") {
                setEditOpen(false);
                setEditPrompt("");
              }
            }}
            placeholder='e.g. "make it sunset", "change shirt to blue"'
            className="h-7 w-56 md:w-72 rounded-md border border-border bg-background px-2 text-xs"
            style={{ fontSize: "16px" }}
            disabled={busy !== null}
          />
          <Button
            size="sm"
            className="h-7 shrink-0"
            onClick={handleEditPrompt}
            disabled={busy !== null || !editPrompt.trim() || idMissing}
          >
            {busy === "edit" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0"
            onClick={() => {
              setEditOpen(false);
              setEditPrompt("");
            }}
          >
            <ZapOff className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs"
              onClick={() => setEditOpen(true)}
              disabled={busy !== null || idMissing}
            >
              <Zap className="h-3.5 w-3.5" />
              AI edit by prompt
              {mask.hasPixels ? (
                <span className="text-[9px] uppercase tracking-wide opacity-80">
                  masked
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Edit the image by typing what you want changed
            {mask.hasPixels ? " (constrained to mask)" : ""}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function handleApiError(err: unknown, opName: string) {
  const msg = err instanceof Error ? err.message : `${opName} failed`;
  const notImplemented =
    /404|not.*found|not.*implement/i.test(msg) ||
    msg.toLowerCase().includes("unavailable");
  if (notImplemented) {
    toast.info(`${opName} ships next wave.`);
  } else {
    toast.error(msg);
  }
}

function deriveName(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop();
    return last && last.includes(".") ? last : fallback;
  } catch {
    return fallback;
  }
}
