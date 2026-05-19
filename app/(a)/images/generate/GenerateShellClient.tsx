"use client";

/**
 * Generate mode — text → image via the Python `/images/generate` endpoint.
 *
 * Minimal, focused UX:
 *   • Multi-line prompt, size selector, count, optional style.
 *   • Result tiles with click-through to Edit, Annotate, Avatar, or download.
 *   • While the Python endpoint is unimplemented, surfaces a friendly
 *     "coming soon" instead of a network error.
 */

import { useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateImage, type ImageResult } from "@/features/image-studio/api/python";
import { InlineMediaRef } from "@/features/files";

type Size = "square" | "portrait" | "landscape" | "wide" | "tall";

export default function GenerateShellClient() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [size, setSize] = useState<Size>("square");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);

  const handleGenerate = async () => {
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
      toast.success(`Generated ${res.files.length} image${res.files.length === 1 ? "" : "s"}.`);
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

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr] gap-3 md:gap-4 p-3 md:p-5">
      <aside className="flex flex-col gap-3 min-h-0">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='A cozy reading nook by a rainy window, warm lamp light, photorealistic'
            className="min-h-[140px] md:min-h-[120px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Size</label>
            <Select value={size} onValueChange={(v) => setSize(v as Size)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
                <SelectItem value="wide">Wide (16:9)</SelectItem>
                <SelectItem value="tall">Tall (9:16)</SelectItem>
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
                {[1, 2, 3, 4].map((n) => (
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
          disabled={busy || !prompt.trim()}
          className="min-h-[44px] md:min-h-0"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5 mr-1.5" />
          )}
          Generate
        </Button>

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
                  href={`/images/edit?cloudFileId=${encodeURIComponent(r.cloud_file_id)}`}
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
  );
}
