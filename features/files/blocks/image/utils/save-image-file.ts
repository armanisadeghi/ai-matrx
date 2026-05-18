/**
 * features/files/blocks/image/utils/save-image-file.ts
 *
 * One entry point for "save this image to my device" that does the
 * right thing on every platform.
 *
 * The default web pattern — `<a download="...">` — is wrong on iOS
 * Safari: it routes the image into the Files app, not Photos. iOS
 * users then have to open Files, find the image, share-sheet it,
 * and pick "Save Image" before it lands in their camera roll. We
 * want one tap.
 *
 * The fix: Web Share API Level 2 (`navigator.share({ files })`).
 * On iOS Safari it opens the native share sheet whose first row is
 * **"Save Image"** → saves directly to Photos. The same sheet also
 * gives the user AirDrop, Messages, Mail, Notes, and every installed
 * third-party app at zero extra cost. On Android Chrome the sheet
 * exposes Save-to-Files / Drive / etc. On desktops without
 * file-share capability we transparently fall back to the classic
 * anchor download.
 *
 * Capability detection runs `navigator.canShare({ files: [file] })`
 * because some browsers expose `navigator.share` but reject file
 * payloads (e.g. older Safari, Firefox). `canShare` is the only
 * reliable gate.
 *
 * Cancellation is normal — when the user opens the sheet and dismisses
 * without picking an action, `navigator.share` rejects with
 * `AbortError`. That's not a failure mode and never surfaces as a toast.
 */

export interface SaveImageFileArgs {
  /** The image URL to fetch. Signed S3 / CDN / blob: all work. */
  url: string;
  /** Filename presented to the user (Photos uses it; Files app uses it). */
  filename: string;
  /** Optional MIME type — falls back to the blob's own type, then jpeg. */
  mimeType?: string | null;
  /** Optional title surfaced in the share sheet header on iOS. */
  title?: string;
}

export type SaveImageMethod =
  /** Used the native share sheet successfully. */
  | "share"
  /** Native share sheet opened and the user dismissed it. Not an error. */
  | "share-cancelled"
  /** Anchor-based download fired (file lands in Downloads / Files app). */
  | "download";

export interface SaveImageFileResult {
  method: SaveImageMethod;
}

/**
 * Save or share an image, preferring the native share sheet on mobile.
 *
 * Throws only for unrecoverable errors (network failure on fetch,
 * non-OK response). User-driven cancellation of the share sheet is
 * NOT an error — it returns `{ method: "share-cancelled" }`.
 */
export async function saveImageFile(
  args: SaveImageFileArgs,
): Promise<SaveImageFileResult> {
  const { url, filename, mimeType, title } = args;

  // Fetch the bytes once. We need them for either path — the share
  // API requires a real File, and the anchor fallback needs a blob:
  // URL to avoid Safari yanking the response mid-download.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const resolvedType = mimeType || blob.type || "image/jpeg";
  const file = new File([blob], filename, { type: resolvedType });

  if (canShareImageFile(file)) {
    try {
      await navigator.share({ files: [file], title: title ?? filename });
      return { method: "share" };
    } catch (err) {
      if (isUserAbort(err)) {
        return { method: "share-cancelled" };
      }
      // Fall through to anchor download on any other share failure
      // (rare: usually means the share sheet itself errored out).
    }
  }

  downloadBlobAsFile(blob, filename);
  return { method: "download" };
}

// ─── Capability ────────────────────────────────────────────────────────────────

/**
 * True when `navigator.share` is present AND the browser accepts the
 * specific file payload we're about to hand it.
 */
function canShareImageFile(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Quick yes/no check without needing the actual bytes. Components can
 * use this to label a button "Save image" vs "Download" before the
 * user taps. Erring on the side of `false` is safe — we always re-check
 * with the real file before invoking the share API.
 */
export function browserSupportsImageShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  // canShare is allowed to be called without args to test general support;
  // we then probe a tiny stub file to confirm file payloads work.
  try {
    const probe = new File([new Uint8Array([0])], "probe.jpg", {
      type: "image/jpeg",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isUserAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function downloadBlobAsFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer the revoke — Safari sometimes races with the download
    // trigger and cancels the save if the object URL is yanked
    // synchronously after `click()`.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
