"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";

interface ShareOptions {
  title: string;
  text?: string;
  /** `null` omits a separate URL field when the reviewed text already contains it. */
  url?: string | null;
  /** Full text to copy when native sharing is unavailable. */
  copyText?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

/**
 * Which door actually opened. Callers that announce the result ("Link copied")
 * must not guess: a manual-fallback run copied nothing, and a toast claiming
 * otherwise is a screen that lies.
 */
export type ShareOutcome = "shared" | "copied" | "manual" | "cancelled";

export interface UseShareResult {
  share: (options: ShareOptions) => Promise<ShareOutcome>;
  copy: (
    text: string,
    fallback?: { title?: string; description?: string },
  ) => Promise<"copied" | "manual">;
  copied: boolean;
  fallbackDialog: ReactNode;
}

/** Native share-sheet first, clipboard second, accessible manual copy last. */
export function useShare(): UseShareResult {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [fallbackTitle, setFallbackTitle] = useState("Copy link");
  const [fallbackDescription, setFallbackDescription] = useState(
    "Press Cmd/Ctrl+C to copy, or use the Copy button below.",
  );

  const copy = useCallback(
    async (
      text: string,
      fallback?: { title?: string; description?: string },
    ): Promise<"copied" | "manual"> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
        return "copied";
      } catch {
        setFallbackTitle(fallback?.title ?? "Copy link");
        setFallbackDescription(
          fallback?.description ??
            "Press Cmd/Ctrl+C to copy, or use the Copy button below.",
        );
        setFallbackUrl(text);
        return "manual";
      }
    },
    [],
  );

  const share = useCallback(
    async (options: ShareOptions): Promise<ShareOutcome> => {
      const url =
        options.url === null
          ? ""
          : (options.url ??
            (typeof window !== "undefined" ? window.location.href : ""));
      const payload = {
        title: options.title,
        ...(options.text ? { text: options.text } : {}),
        ...(url ? { url } : {}),
      };
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share(payload);
          return "shared";
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "name" in error &&
            error.name === "AbortError"
          ) {
            return "cancelled";
          }
        }
      }
      const copyText = options.copyText ?? url;
      return copy(copyText, {
        title: options.fallbackTitle,
        description: options.fallbackDescription,
      });
    },
    [copy],
  );

  return {
    share,
    copy,
    copied,
    fallbackDialog: (
      <ClipboardFallbackDialog
        open={fallbackUrl !== null}
        onOpenChange={(open) => !open && setFallbackUrl(null)}
        url={fallbackUrl ?? ""}
        title={fallbackTitle}
        description={fallbackDescription}
      />
    ),
  };
}
