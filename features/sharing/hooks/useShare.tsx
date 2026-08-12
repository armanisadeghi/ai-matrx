"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";

interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
}

export interface UseShareResult {
  share: (options: ShareOptions) => Promise<void>;
  copied: boolean;
  fallbackDialog: ReactNode;
}

/** Native share-sheet first, clipboard second, accessible manual copy last. */
export function useShare(): UseShareResult {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const share = useCallback(async (options: ShareOptions) => {
    const url =
      options.url ??
      (typeof window !== "undefined" ? window.location.href : "");
    const payload = { title: options.title, text: options.text, url };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // A cancelled share may still be followed by an intentional copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setFallbackUrl(url);
    }
  }, []);

  return {
    share,
    copied,
    fallbackDialog: (
      <ClipboardFallbackDialog
        open={fallbackUrl !== null}
        onOpenChange={(open) => !open && setFallbackUrl(null)}
        url={fallbackUrl ?? ""}
      />
    ),
  };
}
