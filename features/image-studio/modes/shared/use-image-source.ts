"use client";

import { useEffect, useState } from "react";
import type { ImageSource } from "./types";
import { useMediaResolution } from "@ai-matrx/media/core";

/**
 * Resolve an `ImageSource` to a single, browser-loadable URL plus a
 * suggested filename. Manages object-URL lifecycle for `file` sources.
 *
 * For `cloudFileId` sources, this layer expects the caller to already have
 * the public URL (passed via `url` source); we don't fetch it here. The
 * pages/modals that mount the mode either:
 *   - pass `?source=<cloudFileId>` and resolve to the share URL via the
 *     standard cloud-files lookup before rendering, OR
 *   - pass `?url=` directly when the URL is already known.
 *
 * Keeping the resolution out of the hook keeps the modes pure and easy
 * to mount in tests / Storybook.
 */
export function useImageSource(source: ImageSource | null): {
  url: string | null;
  filename: string;
  ready: boolean;
  /**
   * Why a `cloudFileId` source could not be resolved (access denied, not
   * found, deleted…), or null. A mode shows this failure — never "No image
   * loaded" over a resolve that refused (RC-B12 round 12).
   */
  error: Error | null;
} {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const cloudResolution = useMediaResolution(
    source?.kind === "cloudFileId" ? source.cloudFileId : null,
  );
  const cloudFileUrl = cloudResolution.resolution?.src ?? null;
  const error =
    source?.kind === "cloudFileId" && cloudResolution.status === "unavailable"
      ? new Error(
          `This image could not be opened (${(cloudResolution.reason ?? "unknown").replace(/_/g, " ")}).`,
        )
      : null;

  useEffect(() => {
    if (source?.kind !== "file") return undefined;
    let active = true;
    const nextObjectUrl = URL.createObjectURL(source.file);
    // Object URL creation synchronizes with a browser resource. Publish it
    // after the effect body so React never receives a synchronous effect write.
    queueMicrotask(() => {
      if (active) setObjectUrl(nextObjectUrl);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(nextObjectUrl);
    };
  }, [source]);

  const filename =
    source?.kind === "file"
      ? source.file.name
      : source?.kind === "url"
        ? (source.suggestedFilename ?? deriveFilenameFromUrl(source.url))
        : "image";

  const resolvedUrl =
    source?.kind === "file"
      ? objectUrl
      : source?.kind === "url"
        ? source.url
        : source?.kind === "cloudFileId"
          ? cloudFileUrl
          : null;

  return {
    url: resolvedUrl,
    filename,
    ready: resolvedUrl !== null,
    error,
  };
}

function deriveFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url, "http://x");
    const last = u.pathname.split("/").pop() ?? "image";
    return last.includes(".") ? last : `${last}.png`;
  } catch {
    return "image.png";
  }
}
