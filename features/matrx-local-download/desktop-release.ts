import { formatFileSize } from "@ai-matrx/kit/format";

/**
 * The current Matrx Desktop release for macOS, read from the update feed the app itself uses.
 * The feed's `path` field names the signed, notarized zip in the same folder, so the download
 * link follows every release with no version written in this repo. Server-side only; the
 * fetch is revalidated, and a failed read is returned as `null` for the caller to say so.
 */
export const MATRX_DESKTOP_MAC_FEED_URL =
  "https://cdn.matrxserver.com/releases/matrx-desktop/mac/latest-mac.yml";

/** The stable address that always redirects to the newest file (`app/(public)/desktop/download`). */
export const MATRX_DESKTOP_MAC_DOWNLOAD_PATH = "/desktop/download";

/** How long a read of the feed is reused before it is checked again. */
export const MATRX_DESKTOP_FEED_REVALIDATE_SECONDS = 600;

export interface MatrxDesktopMacRelease {
  version: string;
  /** Absolute URL of the zip on the CDN. */
  url: string;
  /** Bytes, when the feed lists it. */
  sizeBytes: number | null;
  /** ISO timestamp, when the feed lists it. */
  releaseDate: string | null;
}

function topLevelValue(yml: string, key: string): string | null {
  const match = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(yml);
  if (!match) return null;
  return match[1].replace(/^['"]|['"]$/g, "");
}

/** Pure: turns the feed's text into a release, or null when it does not name a safe zip. */
export function parseMatrxDesktopMacFeed(
  yml: string,
  feedUrl: string = MATRX_DESKTOP_MAC_FEED_URL,
): MatrxDesktopMacRelease | null {
  const path = topLevelValue(yml, "path");
  const version = topLevelValue(yml, "version");
  // A bare file name only: the feed can never point the button at another place.
  if (!path || !version || !/^[\w.+-]+\.zip$/.test(path)) return null;

  // `size:` is listed under the file entry that carries the same name.
  const entry = new RegExp(
    `url:[ \\t]*${path.replace(/[.+]/g, "\\$&")}[\\s\\S]*?size:[ \\t]*(\\d+)`,
  ).exec(yml);

  return {
    version,
    url: new URL(path, feedUrl).toString(),
    sizeBytes: entry ? Number(entry[1]) : null,
    releaseDate: topLevelValue(yml, "releaseDate"),
  };
}

/** Reads the live feed (revalidated). Null when the feed is unreachable or unreadable. */
export async function getMatrxDesktopMacRelease(): Promise<MatrxDesktopMacRelease | null> {
  try {
    const response = await fetch(MATRX_DESKTOP_MAC_FEED_URL, {
      next: { revalidate: MATRX_DESKTOP_FEED_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    return parseMatrxDesktopMacFeed(await response.text());
  } catch {
    return null;
  }
}

export function formatDownloadSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  return formatFileSize(bytes, { base: 1000 });
}
