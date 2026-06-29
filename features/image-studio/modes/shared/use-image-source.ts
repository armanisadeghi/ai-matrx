"use client";

import { useEffect, useState } from "react";
import type { ImageSource } from "./types";

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
} {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return undefined;
    }
    if (source.kind === "file") {
      const objectUrl = URL.createObjectURL(source.file);
      setUrl(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
    if (source.kind === "url") {
      setUrl(source.url);
      return undefined;
    }
    // cloudFileId — the caller is expected to convert to a `url` source
    // before passing in. If we ever receive one here, leave url null.
    setUrl(null);
    return undefined;
  }, [source]);

  const filename =
    source?.kind === "file"
      ? source.file.name
      : source?.kind === "url"
        ? (source.suggestedFilename ?? deriveFilenameFromUrl(source.url))
        : "image";

  return { url, filename, ready: url !== null };
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
