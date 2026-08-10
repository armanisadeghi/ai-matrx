"use client";

/**
 * Generate mode — text → image via the Python `/images/generate` endpoint.
 *
 * Minimal, focused UX:
 *   • Multi-line prompt, size selector, count, optional style.
 *   • Result tiles with click-through to Edit, Annotate, Avatar, or download.
 *   • Streams NDJSON from aidream POST /images/generate (execute_ai_request
 *     over an image-modality model); every result is a persisted cld_files row.
 */

import { useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Loader2, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateImage,
  type GeneratedImageFile,
} from "@/features/image-studio/api/python";
import {
  GENERATE_IMAGE_COUNTS,
  GENERATE_IMAGE_SIZES,
  GENERATE_IMAGE_SIZE_LABELS,
  isGenerateImageCount,
  isGenerateImageSize,
  type GenerateImageSize,
} from "@/features/image-studio/types";
import { IMAGE_STUDIO_BACKEND_CAPABILITIES } from "@/features/image-studio/constants/backend-capabilities";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  IMAGE_GENERATE_SURFACE_NAME,
  createImageGenerateScope,
} from "@/features/surfaces/manifests/image-generate.manifest";

/** Longest prompt/style the form will stage from an agent write. */
const MAX_PROMPT_CHARS = 4000;
const MAX_STYLE_CHARS = 200;

export default function GenerateShellClient() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [size, setSize] = useState<GenerateImageSize>("square");
  const [count, setCount] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GeneratedImageFile[]>([]);

  const handleGenerate = async () => {
    if (!IMAGE_STUDIO_BACKEND_CAPABILITIES.generate) {
      toast.info("Image generation is coming soon.");
      return;
    }
    if (!prompt.trim()) {
      toast.info("Type a prompt to generate.");
      return;
    }
    setBusy(true);
    try {
      const res = await generateImage({
        prompt: prompt.trim(),
        size,
        style: style.trim() || undefined,
        count,
      });
      setResults(res.files);
      toast.success(
        `Generated ${res.files.length} image${res.files.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generate failed";
      const notImpl = /404|not.*found|not.*implement/i.test(msg);
      toast.info(
        notImpl
          ? "Generate endpoint ships next wave — see features/images/AI-AGENTS.md"
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  // Surface scope — built at trigger time from the live form + results state.
  const getGenerateScope = () =>
    createImageGenerateScope({
      prompt,
      ...(style.trim() ? { style: style.trim() } : {}),
      image_size: size,
      image_count: count,
      generation_request_summary: {
        prompt,
        style: style.trim() || null,
        image_size: size,
        image_count: count,
      },
      result_count: results.length,
      result_file_ids: results
        .map((r) => r.cloud_file_id)
        .filter((id): id is string => Boolean(id)),
      is_generating: busy,
      generation_enabled: IMAGE_STUDIO_BACKEND_CAPABILITIES.generate,
    });

  // Surface write handlers — the write half of the 360 loop. Every handler
  // stages into the SAME state the user's own typing sets, so an agent write
  // is indistinguishable from a keystroke and the user still presses
  // Generate. Bad shapes THROW: the writeback seam turns the throw into an
  // error envelope the agent reads, which is strictly better than silently
  // coercing a value nobody chose. Enum checks go through the canonical
  // guards so the accepted set cannot drift from the declared one.
  const getSurfaceWriteHandlers = () => ({
    generation_prompt: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("generation_prompt expects a non-empty string.");
      if (value.length > MAX_PROMPT_CHARS)
        throw new Error(
          `generation_prompt is limited to ${MAX_PROMPT_CHARS} characters; got ${value.length}.`,
        );
      setPrompt(value);
    },
    generation_style: (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          "generation_style expects a string (empty string clears it).",
        );
      if (value.length > MAX_STYLE_CHARS)
        throw new Error(
          `generation_style is limited to ${MAX_STYLE_CHARS} characters; got ${value.length}.`,
        );
      setStyle(value);
    },
    generation_size: (value: unknown) => {
      if (!isGenerateImageSize(value))
        throw new Error(
          `generation_size expects one of: ${GENERATE_IMAGE_SIZES.join(" | ")}.`,
        );
      setSize(value);
    },
    generation_count: (value: unknown) => {
      if (!isGenerateImageCount(value))
        throw new Error(
          `generation_count expects a whole number, one of: ${GENERATE_IMAGE_COUNTS.join(" | ")}.`,
        );
      setCount(value);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={IMAGE_GENERATE_SURFACE_NAME}
      getScope={getGenerateScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr] gap-3 md:gap-4 p-3 md:p-5">
      <aside className="flex flex-col gap-3 min-h-0">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A cozy reading nook by a rainy window, warm lamp light, photorealistic"
            className="min-h-[140px] md:min-h-[120px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Size</label>
            <Select
              value={size}
              onValueChange={(v) => setSize(v as GenerateImageSize)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATE_IMAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {GENERATE_IMAGE_SIZE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Count</label>
            <Select
              value={String(count)}
              onValueChange={(v) => setCount(parseInt(v, 10))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERATE_IMAGE_COUNTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Style (optional)</label>
          <input
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder='e.g. "editorial illustration", "minimalist vector"'
            className="h-10 md:h-9 rounded-md border border-border bg-background px-3 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={
            !IMAGE_STUDIO_BACKEND_CAPABILITIES.generate ||
            busy ||
            !prompt.trim()
          }
          className="min-h-[44px] md:min-h-0"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5 mr-1.5" />
          )}
          Generate
        </Button>

        {!IMAGE_STUDIO_BACKEND_CAPABILITIES.generate && (
          <p className="text-xs text-muted-foreground">
            Image generation is coming soon. Upload or select an existing image
            to use the available editing tools.
          </p>
        )}

        <div className="hidden md:block rounded-md border border-border bg-card/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Zap className="h-3 w-3" />
            About this tool
          </div>
          <p>
            Generates new images from a text prompt via the Python image
            backend. Each result is saved to your Cloud Files automatically;
            click any tile to take it into Edit, Annotate, or Avatar mode.
          </p>
        </div>
      </aside>

      <section className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          {results.length === 0
            ? "Results will appear here."
            : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:overflow-y-auto lg:pr-1">
          {results.map((r) => (
            <div
              key={r.cloud_file_id}
              className="group relative rounded-lg overflow-hidden border border-border bg-card"
            >
              {/* Pass cloud_file_id (UUID) so the handler routes through
                  the auto-refresh + CDN-routing path; fall back to
                  public_url if the UUID isn't present. */}
              <InlineMediaRef
                ref={r.cloud_file_id ?? r.public_url ?? null}
                size="fill"
                fit="cover"
                rounded="none"
                fallback="icon"
                className="w-full aspect-square"
                alt={r.cloud_file_id}
              />
              <div className="p-2 flex flex-wrap gap-1.5 text-xs">
                <Link
                  href={`/images/edit/${encodeURIComponent(r.cloud_file_id)}`}
                  className="min-h-[32px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  Edit
                </Link>
                <Link
                  href={`/images/annotate?cloudFileId=${encodeURIComponent(r.cloud_file_id)}`}
                  className="min-h-[32px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  Annotate
                </Link>
                <Link
                  href={`/images/avatar?cloudFileId=${encodeURIComponent(r.cloud_file_id)}`}
                  className="min-h-[32px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  Use as avatar
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </SurfaceRuntimeProvider>
  );
}
