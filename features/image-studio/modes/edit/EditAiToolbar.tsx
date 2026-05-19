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

  // Pull the primary URL out of whatever the backend sends back. New
  // IMAGE_OPS endpoints return an AssetEnvelope (primary_url + variants);
  // the legacy /images/upscale wrapper may still return {file: ImageResult}
  // (public_url). We probe every known shape so a quiet contract change on
  // the backend can never blow up the result-load path again.
  const consume = useCallback(
    (response: unknown, fallbackName: string) => {
      const r = response as Record<string, unknown> | null | undefined;
      const variants = r?.variants as
        | Record<string, { url?: string | null }>
        | undefined;
      const file = r?.file as { public_url?: string } | undefined;
      const url =
        (r?.primary_url as string | undefined) ??
        variants?.original?.url ??
        (r?.public_url as string | undefined) ??
        file?.public_url ??
        ((r?.asset as { primary_url?: string })?.primary_url ?? null);
      if (!url) {
        toast.error("Op completed but returned no URL.", {
          description:
            "Open the console — the full response payload is logged there.",
        });
        // eslint-disable-next-line no-console
        console.warn("[image-edit] unrecognized op response shape:", response);
        return;
      }
      onResult(url, deriveName(url, fallbackName));
    },
    [onResult],
  );

  /**
   * Run an AI op with full visibility. Pinned-position toast walks the
   * user through requesting → succeeded / failed, and the console logs
   * the request + response so silent failures aren't possible. Returns
   * the response or null on failure.
   *
   * Errors are categorised so the user sees actionable messages:
   *   • 404 / "not found" → "ships next wave"
   *   • 503 / "pip install" → "backend not installed: <command>"
   *   • Network failure → "network error"
   *   • Anything else → the server's actual message
   */
  const runOp = useCallback(
    async <T,>(
      label: string,
      requestPreview: unknown,
      op: () => Promise<T>,
    ): Promise<T | null> => {
      const toastId = toast.loading(`${label}…`, {
        description: "Calling the image-ops backend",
      });
      // eslint-disable-next-line no-console
      console.info(`[image-edit] ${label} → request`, requestPreview);
      try {
        const response = await op();
        // eslint-disable-next-line no-console
        console.info(`[image-edit] ${label} → response`, response);
        toast.success(`${label} complete.`, { id: toastId });
        return response;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[image-edit] ${label} → error`, err);
        const detail = describeError(err);
        toast.error(`${label} failed`, {
          id: toastId,
          description: detail.message,
          duration: detail.duration,
        });
        return null;
      }
    },
    [],
  );

  const handleAdjust = async () => {
    const id = ensureId("Adjust");
    if (!id) return;
    setBusy("adjust");
    const asset = await runOp("Adjust", { source_id: id, ...adjustValues }, () =>
      adjust(id, adjustValues),
    );
    setBusy(null);
    if (asset) {
      consume(asset, "adjusted.png");
      setAdjustOpen(false);
    }
  };

  const handleAutoColor = async () => {
    const id = ensureId("Auto color");
    if (!id) return;
    setBusy("auto");
    const asset = await runOp("Auto color", { source_id: id }, () =>
      autoColor(id),
    );
    setBusy(null);
    if (asset) consume(asset, "auto-color.png");
  };

  const handleSharpen = async () => {
    const id = ensureId("Sharpen");
    if (!id) return;
    setBusy("sharpen");
    const asset = await runOp("Sharpen", { source_id: id, amount: 1.2 }, () =>
      sharpenOp(id, { amount: 1.2 }),
    );
    setBusy(null);
    if (asset) consume(asset, "sharpen.png");
  };

  const handleDenoise = async () => {
    const id = ensureId("Denoise");
    if (!id) return;
    setBusy("denoise");
    const asset = await runOp("Denoise", { source_id: id, strength: 2 }, () =>
      denoiseOp(id, { strength: 2 }),
    );
    setBusy(null);
    if (asset) consume(asset, "denoise.png");
  };

  const handleBgRemove = async () => {
    const id = ensureId("Background remove");
    if (!id) return;
    setBusy("bg");
    const maskId = await resolveMaskId(id);
    const body = {
      source_id: id,
      ...(maskId ? { mask_id: maskId } : {}),
    };
    const asset = await runOp("Background remove", body, () =>
      removeBackground(body),
    );
    setBusy(null);
    if (asset) consume(asset, "no-bg.png");
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
    const maskId = await resolveMaskId(id);
    if (!maskId) {
      toast.error("Couldn't upload mask. Try again.");
      setBusy(null);
      return;
    }
    const body = { source_id: id, mask_id: maskId };
    const asset = await runOp("Inpaint", body, () => inpaint(body));
    setBusy(null);
    if (asset) consume(asset, "inpaint.png");
  };

  const handleUpscale = async (factor: 2 | 4) => {
    const id = ensureId("Upscale");
    if (!id) return;
    setBusy(factor === 2 ? "up2" : "up4");
    const body = { source_id: id, factor };
    const asset = await runOp(`${factor}× upscale`, body, () =>
      upscaleImage(body),
    );
    setBusy(null);
    if (asset) consume(asset, `${factor}x.png`);
  };

  // ── AI features (Wave 2 — endpoints live, UI ready) ─────────────────────

  const handleSuggest = async () => {
    const id = ensureId("Suggest edits");
    if (!id) return;
    setBusy("suggest");
    const body = { source_id: id };
    const response = await runOp("Suggest edits", body, () => suggestEdits(body));
    setBusy(null);
    if (response) {
      if (!response.suggestions?.length) {
        toast.info("The image looks good — no edits suggested.");
        return;
      }
      const first = response.suggestions[0];
      toast.success(`Suggested: ${first.label} — coming soon as one-click.`);
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
    const maskId = await resolveMaskId(id);
    const body = {
      source_id: id,
      prompt: promptText.trim(),
      ...(maskId ? { mask_id: maskId } : {}),
    };
    const asset = await runOp("AI edit", body, () => editImageByPrompt(body));
    setBusy(null);
    if (asset) {
      consume(asset, "ai-edit.png");
      setPromptOpen(false);
      setPromptText("");
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

      {/* AI prompt input lives in a popover so the toolbar never reflows.
          Constraining the toolbar to a stable layout is critical for the
          editor — every layout shift is a usability papercut. */}
      <Popover open={promptOpen} onOpenChange={setPromptOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
            disabled={anyBusy || idMissing}
          >
            {busy === "prompt" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            AI edit
            {mask.hasPixels ? (
              <span className="text-[9px] uppercase tracking-wide text-primary/80 ml-0.5">
                masked
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-foreground/80">
                Describe the edit
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {mask.hasPixels
                  ? "Constrained to the painted mask region."
                  : "Applied to the entire image."}
              </p>
            </div>
            <input
              autoFocus
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handlePrompt();
                if (e.key === "Escape") setPromptOpen(false);
              }}
              placeholder='"make it sunset", "change shirt to blue"…'
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              style={{ fontSize: "16px" }}
              disabled={anyBusy}
            />
            <div className="flex justify-between items-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPromptText("")}
                disabled={anyBusy || !promptText}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handlePrompt}
                disabled={anyBusy || !promptText.trim()}
              >
                {busy === "prompt" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Apply"
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
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

/**
 * Categorise a thrown error from one of the image ops into a human-readable
 * toast description. Visible during beta because silent failures got us
 * here in the first place; every error tells the user what happened AND
 * dumps the full Error to the console for inspection.
 */
function describeError(err: unknown): { message: string; duration?: number } {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();

  if (/\b404\b|not.?found|not.?implement/.test(lower) || lower.includes("unavailable")) {
    return { message: "This op isn't implemented yet — ships next wave." };
  }

  // matrx-utils' optional-backend 503: "pip install matrx-utils[...]"
  const installMatch = raw.match(/pip install[^\n"]*/i);
  if (/\b503\b/.test(raw) || installMatch) {
    const cmd = installMatch?.[0]?.trim() ?? "pip install matrx-utils[image-segmentation]";
    return {
      message: `Backend isn't installed on the server. Have ops run: ${cmd}`,
      duration: 12_000,
    };
  }

  if (/network|fetch failed|failed to fetch|ECONN/i.test(raw)) {
    return {
      message: "Network error — can't reach the image-ops backend. Check connection or VPN.",
      duration: 8_000,
    };
  }

  if (/\b401\b|unauthor/i.test(raw)) {
    return { message: "Not authorised — try refreshing the page to renew your session." };
  }

  if (/\b403\b|forbid/i.test(raw)) {
    return { message: "Forbidden — you may not have access to this file." };
  }

  if (/\b5\d\d\b/.test(raw)) {
    return {
      message: `Server error: ${raw}. Check the console for the full payload.`,
      duration: 10_000,
    };
  }

  return { message: raw || "Unknown error — check the console for the full payload." };
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
