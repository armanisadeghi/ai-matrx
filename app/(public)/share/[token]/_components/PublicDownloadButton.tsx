/**
 * app/(public)/share/[token]/_components/PublicDownloadButton.tsx
 *
 * Client component — the download action on the public share page. Prefers
 * the embedded signed URL (instant). Falls back to hitting
 * `/share/:token/download` if the URL was omitted.
 */

"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { pythonShareUrl } from "@/features/files";

export interface PublicDownloadButtonProps {
  token: string;
  url: string | null;
  filename: string | null;
}

export function PublicDownloadButton({
  token,
  url,
  filename,
}: PublicDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleClick = useCallback(async () => {
    setDownloading(true);
    try {
      // Prefer the embedded signed URL (instant, S3-direct). Fall back to
      // Python's `/share/{token}/download` proxy, resolved via the canonical
      // handler URL builder — never hand-assemble the URL inline.
      triggerAnchor(url ?? pythonShareUrl(token), filename);
    } finally {
      // Keep the spinner briefly so users see feedback.
      setTimeout(() => setDownloading(false), 600);
    }
  }, [token, url, filename]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={downloading}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      Download
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
