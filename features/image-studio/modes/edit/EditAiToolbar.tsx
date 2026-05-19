"use client";

/**
 * AI / pixel-op assists strip. Lives inside the editor frame, just below
 * the header. Every action targets a saved cloud file (the /[id] route
 * guarantees `sourceCloudFileId` is non-null by the time the user gets here).
 *
 * Catalogue exposed:
 *   • Adjust — popover with brightness / contrast / saturation / sharpness
 *     sliders → op="adjust" on POST /images/edit
 *   • Auto color — one-click → op="auto_color"
 *   • Sharpen — one-click w/ defaults → op="sharpen"
 *   • Denoise — one-click w/ defaults → op="denoise"
 *   • Remove BG — POST /images/bg-remove (mask_id OR'd when mask is painted)
 *   • Upscale 2× / 4× — POST /images/upscale (legacy; SR lands in Wave 2)
 *   • Inpaint — POST /images/inpaint, mask required
 *
 * Visual hierarchy: every secondary action is a ghost button so the
 * editor's primary "Save" in the header is the only prominent blue.
 */

import { useCallback, useState } from "react";
import {
  ArrowUpRight,
  Brush,
  Eraser,
  Lightbulb,
  Loader2,
  PaintBucket,
  Settings2,
  Sliders,
  Sparkles,
  Sun,
  Wand2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fileHandler } from "@/features/files/handler/handler";
import {
  adjust,
  autoColor,
  denoise as denoiseOp,
  editImageByPrompt,
  inpaint,
  removeBackground,
  sharpen as sharpenOp,
  suggestEdits,
  upscaleImage,
  type AssetEnvelope,
} from "../../api/python";
import type { MaskState } from "./use-mask-state";

interface Props {
  sourceCloudFileId: string | null;
  sourceUrl: string;
  onResult: (newUrl: string, newName: string) => void;
  mask: MaskState;
}

type Busy =
  | null
  | "adjust"
  | "auto"
  | "sharpen"
  | "denoise"
  | "bg"
  | "up2"
  | "up4"
  | "inpaint"
  | "suggest"
  | "prompt";

export function EditAiToolbar({
  sourceCloudFileId,
  sourceUrl: _sourceUrl,
  onResult,
  mask,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [adjustValues, setAdjustValues] = useState({
    brightness: 1,
    contrast: 1,
    saturation: 1,
    sharpness: 1,
  });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);

  const idMissing = !sourceCloudFileId;
  const anyBusy = busy !== null;

  const ensureId = (op: string): string | null => {
    if (sourceCloudFileId) return sourceCloudFileId;
    toast.info(`${op} needs a saved cloud file to work on.`);
    return null;
  };

  // Upload the painted mask (if any) as its own cloud file. Empty mask
  // returns null so callers can omit the parameter.
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
          metadata: { kind: "mask", source_file_id: sourceFileId },
        },
      );
      return normalized.fileId ?? null;
    },
    [mask],
  );

  // Pull the primary URL + a reasonable filename out of the new Asset envelope.
  const consume = useCallback(
    (asset: AssetEnvelope, fallbackName: string) => {
      const url = asset.primary_url ?? asset.variants?.original?.url ?? null;
      if (!url) {
        toast.error("Op completed but returned no URL.");
        return;
      }
      onResult(url, deriveName(url, fallbackName));
    },
    [onResult],
  );

  const handleAdjust = async () => {
    const id = ensureId("Adjust");
    if (!id) return;
    setBusy("adjust");
    try {
      const { asset } = await adjust(id, adjustValues);
      consume(asset, "adjusted.png");
      setAdjustOpen(false);
    } catch (err) {
      handleApiError(err, "Adjust");
    } finally {
      setBusy(null);
    }
  };

  const handleAutoColor = async () => {
    const id = ensureId("Auto color");
    if (!id) return;
    setBusy("auto");
    try {
      const { asset } = await autoColor(id);
      consume(asset, "auto-color.png");
    } catch (err) {
      handleApiError(err, "Auto color");
    } finally {
      setBusy(null);
    }
  };

  const handleSharpen = async () => {
    const id = ensureId("Sharpen");
    if (!id) return;
    setBusy("sharpen");
    try {
      const { asset } = await sharpenOp(id, { amount: 1.2 });
      consume(asset, "sharpen.png");
    } catch (err) {
      handleApiError(err, "Sharpen");
    } finally {
      setBusy(null);
    }
  };

  const handleDenoise = async () => {
    const id = ensureId("Denoise");
    if (!id) return;
    setBusy("denoise");
    try {
      const { asset } = await denoiseOp(id, { strength: 2 });
      consume(asset, "denoise.png");
    } catch (err) {
      handleApiError(err, "Denoise");
    } finally {
      setBusy(null);
    }
  };

  const handleBgRemove = async () => {
    const id = ensureId("Background remove");
    if (!id) return;
    setBusy("bg");
    try {
      const maskId = await resolveMaskId(id);
      const { asset } = await removeBackground({
        source_id: id,
        ...(maskId ? { mask_id: maskId } : {}),
      });
      consume(asset, "no-bg.png");
    } catch (err) {
      handleApiError(err, "Background remove");
    } finally {
      setBusy(null);
    }
  };

  const handleInpaint = async () => {
    const id = ensureId("Inpaint");
    if (!id) return;
    if (!mask.hasPixels) {
      toast.info(
        "Inpaint needs a mask — paint over the region you want filled.",
      );
      return;
    }
    setBusy("inpaint");
    try {
      const maskId = await resolveMaskId(id);
      if (!maskId) {
        toast.error("Couldn't upload mask. Try again.");
        return;
      }
      const { asset } = await inpaint({ source_id: id, mask_id: maskId });
      consume(asset, "inpaint.png");
    } catch (err) {
      handleApiError(err, "Inpaint");
    } finally {
      setBusy(null);
    }
  };

  const handleUpscale = async (factor: 2 | 4) => {
    const id = ensureId("Upscale");
    if (!id) return;
    setBusy(factor === 2 ? "up2" : "up4");
    try {
      const { asset } = await upscaleImage({ source_id: id, factor });
      consume(asset, `${factor}x.png`);
    } catch (err) {
      handleApiError(err, `${factor}× upscale`);
    } finally {
      setBusy(null);
    }
  };

  // ── AI features (Wave 2 — endpoints live, UI ready) ─────────────────────

  const handleSuggest = async () => {
    const id = ensureId("Suggest edits");
    if (!id) return;
    setBusy("suggest");
    try {
      const { suggestions } = await suggestEdits({ source_id: id });
      if (!suggestions?.length) {
        toast.info("The image looks good — no edits suggested.");
        return;
      }
      // Pluck the first suggestion as a quick taste; a richer dropdown UI
      // lands when the agent ships with multiple ranked recommendations.
      const first = suggestions[0];
      toast.success(`Suggested: ${first.label} — coming soon as one-click.`);
    } catch (err) {
      handleApiError(err, "Suggest edits");
    } finally {
      setBusy(null);
    }
  };

  const handlePrompt = async () => {
    const id = ensureId("AI edit by prompt");
    if (!id) return;
    if (!promptText.trim()) {
      toast.info("Type what you want changed.");
      return;
    }
    setBusy("prompt");
    try {
      const maskId = await resolveMaskId(id);
      const { asset } = await editImageByPrompt({
        source_id: id,
        prompt: promptText.trim(),
        ...(maskId ? { mask_id: maskId } : {}),
      });
      consume(asset, "ai-edit.png");
      setPromptOpen(false);
      setPromptText("");
    } catch (err) {
      handleApiError(err, "AI edit by prompt");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1 shrink-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mr-2 ml-1 flex items-center gap-1 shrink-0">
        <Sparkles className="h-3 w-3" />
        Ops
      </span>

      {/* Adjust — popover with sliders */}
      <Popover open={adjustOpen} onOpenChange={setAdjustOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
            disabled={anyBusy || idMissing}
          >
            {busy === "adjust" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sliders className="h-3.5 w-3.5" />
            )}
            Adjust
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Live values applied when you press Apply.
            </p>
            <AdjustSlider
              label="Brightness"
              value={adjustValues.brightness}
              onChange={(v) =>
                setAdjustValues((s) => ({ ...s, brightness: v }))
              }
              min={0.2}
              max={2}
              step={0.05}
            />
            <AdjustSlider
              label="Contrast"
              value={adjustValues.contrast}
              onChange={(v) => setAdjustValues((s) => ({ ...s, contrast: v }))}
              min={0.2}
              max={2}
              step={0.05}
            />
            <AdjustSlider
              label="Saturation"
              value={adjustValues.saturation}
              onChange={(v) =>
                setAdjustValues((s) => ({ ...s, saturation: v }))
              }
              min={0}
              max={2}
              step={0.05}
            />
            <AdjustSlider
              label="Sharpness"
              value={adjustValues.sharpness}
              onChange={(v) => setAdjustValues((s) => ({ ...s, sharpness: v }))}
              min={0}
              max={2}
              step={0.05}
            />
            <div className="flex justify-between items-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setAdjustValues({
                    brightness: 1,
                    contrast: 1,
                    saturation: 1,
                    sharpness: 1,
                  })
                }
              >
                Reset
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleAdjust}
                disabled={anyBusy}
              >
                {busy === "adjust" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Apply"
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ToolbarOpButton
        label="Auto color"
        icon={Wand2}
        running={busy === "auto"}
        disabled={anyBusy || idMissing}
        onClick={handleAutoColor}
        tooltip="Auto white-balance + contrast"
      />

      <ToolbarOpButton
        label="Sharpen"
        icon={Sun}
        running={busy === "sharpen"}
        disabled={anyBusy || idMissing}
        onClick={handleSharpen}
        tooltip="Light sharpen pass"
      />

      <ToolbarOpButton
        label="Denoise"
        icon={Waves}
        running={busy === "denoise"}
        disabled={anyBusy || idMissing}
        onClick={handleDenoise}
        tooltip="Median-filter denoise"
      />

      <div className="w-px h-5 bg-border/60 mx-1 shrink-0" />

      <ToolbarOpButton
        label="Remove BG"
        icon={Eraser}
        running={busy === "bg"}
        disabled={anyBusy || idMissing}
        onClick={handleBgRemove}
        tooltip={
          mask.hasPixels
            ? "Remove background — keep masked pixels"
            : "Remove background → transparent PNG"
        }
        badge={mask.hasPixels ? "masked" : null}
      />

      <ToolbarOpButton
        label="Inpaint"
        icon={Brush}
        running={busy === "inpaint"}
        disabled={anyBusy || idMissing || !mask.hasPixels}
        onClick={handleInpaint}
        tooltip={
          mask.hasPixels
            ? "Fill masked region with content-aware patching"
            : "Paint a mask first, then Inpaint will fill it"
        }
        badge={mask.hasPixels ? "ready" : null}
      />

      <div className="w-px h-5 bg-border/60 mx-1 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs text-foreground/80 hover:text-foreground"
            onClick={() => handleUpscale(2)}
            disabled={anyBusy || idMissing}
          >
            {busy === "up2" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
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
            className="h-7 shrink-0 gap-1 text-xs text-foreground/80 hover:text-foreground"
            onClick={() => handleUpscale(4)}
            disabled={anyBusy || idMissing}
          >
            {busy === "up4" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
            4×
          </Button>
        </TooltipTrigger>
        <TooltipContent>Upscale 4×</TooltipContent>
      </Tooltip>

      <div className="hidden md:block flex-1" />

      {mask.hasPixels ? (
        <span className="hidden md:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary mr-2 shrink-0">
          <PaintBucket className="h-3 w-3" />
          mask active
        </span>
      ) : null}

      {/* AI features — endpoints live in Wave 2; UI is ready so they light
          up the moment the backend ships. */}
      <ToolbarOpButton
        label="Suggest"
        icon={Lightbulb}
        running={busy === "suggest"}
        disabled={anyBusy || idMissing}
        onClick={handleSuggest}
        tooltip="Ask AI what edits this image needs"
      />

      {promptOpen ? (
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          <input
            autoFocus
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handlePrompt();
              if (e.key === "Escape") {
                setPromptOpen(false);
                setPromptText("");
              }
            }}
            placeholder='"make it sunset", "change shirt to blue"…'
            className="h-7 w-56 md:w-72 rounded-md border border-border bg-background px-2 text-xs"
            style={{ fontSize: "16px" }}
            disabled={anyBusy}
          />
          <Button
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={handlePrompt}
            disabled={anyBusy || !promptText.trim() || idMissing}
          >
            {busy === "prompt" ? (
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
              setPromptOpen(false);
              setPromptText("");
            }}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
              onClick={() => setPromptOpen(true)}
              disabled={anyBusy || idMissing}
            >
              <Zap className="h-3.5 w-3.5" />
              AI edit
              {mask.hasPixels ? (
                <span className="text-[9px] uppercase tracking-wide text-primary/80 ml-0.5">
                  masked
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Edit the image by typing what you want changed
            {mask.hasPixels ? " — constrained to your mask" : ""}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function ToolbarOpButton({
  label,
  icon: Icon,
  running,
  disabled,
  onClick,
  tooltip,
  badge,
}: {
  label: string;
  icon: typeof Settings2;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
  tooltip: string;
  badge?: string | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
          onClick={onClick}
          disabled={disabled}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
          {label}
          {badge ? (
            <span className="text-[9px] uppercase tracking-wide text-primary/80 ml-0.5">
              {badge}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function AdjustSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <Label className="text-foreground/80">{label}</Label>
        <span className="font-mono text-muted-foreground tabular-nums">
          {value.toFixed(2)}×
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

function handleApiError(err: unknown, opName: string) {
  const msg = err instanceof Error ? err.message : `${opName} failed`;
  const notImplemented =
    /\b404\b|\bnot.found\b|not.implement/i.test(msg) ||
    msg.toLowerCase().includes("unavailable");
  const missingBackend = /\b503\b|pip install/i.test(msg);
  if (notImplemented) {
    toast.info(`${opName} ships next wave.`);
  } else if (missingBackend) {
    toast.error(
      `${opName}: backend not installed. ${msg.replace(/.*pip install/i, "pip install")}`,
    );
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
