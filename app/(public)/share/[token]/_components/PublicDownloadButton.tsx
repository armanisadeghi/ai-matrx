/**
 * app/(public)/share/[token]/_components/PublicDownloadButton.tsx
 *
 * Client component — the primary save action on the public share page.
 *
 * For image files we route through `saveImageFile`, which prefers the
 * Web Share API on mobile (`navigator.share({ files })`). On iOS the
 * native share sheet exposes "Save Image" → Photos as the first option,
 * which is what mobile users actually want — anchor-downloading an
 * image on iOS dumps it into the Files app and forces a long-press
 * workaround to get it into the camera roll.
 *
 * For everything else (PDFs, audio, video, docs) we keep the classic
 * anchor download — the share sheet wouldn't add value there.
 */

"use client";

import { useCallback, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { pythonShareUrl } from "@/features/files";
import { saveImageFile } from "@/features/files/blocks/image/utils/save-image-file";

export interface PublicDownloadButtonProps {
  token: string;
  url: string | null;
  filename: string | null;
  mimeType?: string | null;
}

export function PublicDownloadButton({
  token,
  url,
  filename,
  mimeType,
}: PublicDownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const isImage = (mimeType ?? "").startsWith("image/");

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      const targetUrl = url ?? pythonShareUrl(token);

      if (isImage) {
        // Routes through the share sheet on mobile (Save Image → Photos
        // on iOS), falls back to anchor download elsewhere. See
        // `features/files/blocks/image/utils/save-image-file.ts`.
        await saveImageFile({
          url: targetUrl,
          filename: filename ?? "image.jpg",
          mimeType: mimeType ?? null,
          title: filename ?? "Shared image",
        });
      } else {
        triggerAnchor(targetUrl, filename);
      }
    } catch (err) {
      toast.error("Could not download file", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTimeout(() => setBusy(false), 600);
    }
  }, [token, url, filename, mimeType, isImage]);

  const Icon = busy ? Loader2 : isImage ? Share2 : Download;
  const iconClass = busy ? "h-4 w-4 animate-spin" : "h-4 w-4";
  const label = isImage ? "Save image" : "Download";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      <Icon className={iconClass} aria-hidden="true" />
      {label}
    </button>
  );
}

function triggerAnchor(href: string, filename: string | null): void {
  const a = document.createElement("a");
  a.href = href;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
