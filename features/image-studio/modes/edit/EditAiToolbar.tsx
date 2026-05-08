"use client";

/**
 * The thin toolbar above Filerobot. Hosts the AI assists — these aren't
 * available inside Filerobot's native toolbar, and they want their own
 * busy state, so a sibling toolbar is the cleanest mount point.
 *
 * Each button is gated by what it needs:
 *   • Background remove + Upscale + Variants need a cloud_file_id, which
 *     means the source must already be persisted. If we're on a freshly
 *     dropped File, the buttons are disabled with an explanatory tooltip.
 *   • Suggest edits + Generate variant work either way (the agent path
 *     accepts a fresh Blob too).
 *
 * When the Python endpoint isn't yet implemented, the call returns 404 and
 * we surface a friendly "coming soon" message rather than a generic error.
 */

import { useState } from "react";
import {
  ArrowUp,
  Eraser,
  Loader2,
  Sparkles,
  Wand2,
  ZapOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  removeBackground,
  upscaleImage,
  editImage,
} from "../../api/python";

interface Props {
  sourceCloudFileId: string | null;
  sourceUrl: string;
  onResult: (newUrl: string, newName: string) => void;
}

type Busy = null | "bg" | "up2" | "up4" | "edit" | "suggest";

export function EditAiToolbar({
  sourceCloudFileId,
  sourceUrl: _sourceUrl,
  onResult,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const requireCloudId = (op: string): string | null => {
    if (sourceCloudFileId) return sourceCloudFileId;
    toast.info(
      `${op} needs the image to be saved first. Click Save, then re-open from Cloud Files.`,
    );
    return null;
  };

  const handleBgRemove = async () => {
    const id = requireCloudId("Background remove");
    if (!id) return;
    setBusy("bg");
    try {
      const { file } = await removeBackground({ source_id: id });
      onResult(file.public_url, deriveName(file.public_url, "no-bg.png"));
    } catch (err) {
      handleApiError(err, "Background remove");
    } finally {
      setBusy(null);
    }
  };

  const handleUpscale = async (factor: 2 | 4) => {
    const id = requireCloudId("Upscale");
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
    const id = requireCloudId("AI edit");
    if (!id) return;
    if (!editPrompt.trim()) {
      toast.info("Type what you want changed.");
      return;
    }
    setBusy("edit");
    try {
      const { file } = await editImage({
        source_id: id,
        prompt: editPrompt.trim(),
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
    // Wired to the `image-suggest-edits` agent shortcut once it lands in
    // the DB + system-shortcuts.ts. Until then this button is
    // intentionally a stub — the agent surface is described in
    // features/image-studio/AI-AGENTS.md.
    toast.info(
      "Suggest edits agent ships next wave — see features/image-studio/AI-AGENTS.md",
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card/40 px-3 py-1.5 shrink-0">
        <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI assist
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleSuggestEdits}
              disabled={busy !== null}
            >
              {busy === "suggest" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Suggest edits
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ask AI what edits this image needs</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={handleBgRemove}
              disabled={busy !== null}
            >
              {busy === "bg" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Eraser className="h-3.5 w-3.5 mr-1.5" />
              )}
              Remove BG
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove background → transparent PNG</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => handleUpscale(2)}
              disabled={busy !== null}
            >
              {busy === "up2" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
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
              className="h-8 shrink-0"
              onClick={() => handleUpscale(4)}
              disabled={busy !== null}
            >
              {busy === "up4" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
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
              className="h-8 w-56 md:w-72 rounded-md border border-border bg-background px-2 text-xs"
              style={{ fontSize: "16px" }}
              disabled={busy !== null}
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={handleEditPrompt}
              disabled={busy !== null || !editPrompt.trim()}
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
              className="h-8 shrink-0"
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
                className="h-8 shrink-0"
                onClick={() => setEditOpen(true)}
                disabled={busy !== null}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                AI edit by prompt
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Edit the image by typing what you want changed
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function handleApiError(err: unknown, opName: string) {
  const msg = err instanceof Error ? err.message : `${opName} failed`;
  // Friendly path while Python endpoints are stubs.
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
