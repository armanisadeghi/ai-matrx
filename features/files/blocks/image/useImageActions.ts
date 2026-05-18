/**
 * features/files/blocks/image/useImageActions.ts
 *
 * Single source of truth for "what can you do with an image" — the
 * action callbacks and busy state that drive the toolbar, dropdown,
 * context menu, mobile drawer, and any other surface that exposes
 * image actions.
 *
 * The renderer used to host these inline, but with download-as,
 * resize-and-download, print, and a multi-mode share popover all
 * stacking up, the file ballooned and the same callbacks were
 * duplicated across three menu surfaces. Lifting them into a hook
 * makes the renderer pure view code and gives the rest of the app
 * (image grid, lightbox, image manager) a stable consumable API.
 *
 * Actions split into TWO buckets:
 *
 * - **Local**: things you can do with bytes you already have in the
 *   browser — open in new tab, copy link, copy image, expand, print.
 *
 * - **Server**: things that round-trip through the asset pipeline so
 *   the result PERSISTS on the cld_files row (and a re-request hits
 *   the cache). Used for `Download as <format>` and `Resize and
 *   download <preset>` — both go through `renderImageVariant`.
 *
 * Share is NOT a callback here — it's a popover surface, so it stays
 * on the renderer as a wrapping component. Everything else funnels
 * through this hook.
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { deriveViewerUrl } from "./helpers/derive-viewer-url";
import { printImage } from "./utils/print-image";
import {
  renderImageVariant,
  suggestVariantFilename,
  type ImageVariantFormat,
  type ImageVariantSpec,
} from "./utils/render-image-variant";
import { saveImageFile } from "./utils/save-image-file";
import type { UnifiedImageBlock } from "./types";

export interface ImageActionsApi {
  // ── Local actions (no network) ─────────────────────────────────────
  openNewTab(): void;
  copyLink(): Promise<void>;
  copyImage(): Promise<void>;
  download(): Promise<void>;
  print(): Promise<void>;
  viewOriginal(): void;

  // ── Server actions (asset pipeline; result persists) ───────────────
  downloadAs(format: ImageVariantFormat): Promise<void>;
  resizeAndDownload(width: number, format?: ImageVariantFormat): Promise<void>;

  // ── State ──────────────────────────────────────────────────────────
  isDownloading: boolean;
  isVariantBusy: boolean;
  /**
   * Returns true when this `(file_id, key)` is currently being rendered.
   * Lets the UI badge a specific menu item ("JPEG • rendering…") rather
   * than locking the whole menu.
   */
  isVariantKeyBusy(key: string): boolean;

  // ── Derived ────────────────────────────────────────────────────────
  parentFileId: string | null;
  /** Best filename for the *original* image. */
  downloadName: string;
}

export interface UseImageActionsArgs {
  block: UnifiedImageBlock;
  /** Currently resolved src — needed for copy/print of the visible bytes. */
  currentSrc: string | null;
  /**
   * Resolved file id — passed in (not derived) because the matrx-block
   * `fileId` is the canonical id, but `useUnifiedImageUrl` exposes a
   * possibly-refreshed `fileId` that the caller may want to forward.
   * Use `block.fileId` when in doubt.
   */
  fileId: string | null;
}

export function useImageActions({
  block,
  currentSrc,
  fileId,
}: UseImageActionsArgs): ImageActionsApi {
  const isMatrx = block.origin === "matrx";

  // ── State ─────────────────────────────────────────────────────────
  const [isDownloading, setIsDownloading] = useState(false);
  const [busyVariantKeys, setBusyVariantKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // ── Derived ───────────────────────────────────────────────────────
  const parentFileId = isMatrx ? block.parentFileId : null;

  const ext =
    block.mimeType?.split("/")[1] ??
    (block.fileName ? /\.([^.]+)$/.exec(block.fileName)?.[1] : null) ??
    (currentSrc ? currentSrc.split(".").pop()?.split("?")[0] : null) ??
    "png";

  const downloadName = block.fileName ?? `image.${ext}`;

  // ── Helpers ───────────────────────────────────────────────────────

  /** Mark a variant key as in-flight; auto-clears on completion. */
  const withVariantBusy = useCallback(
    async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      setBusyVariantKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        return await fn();
      } finally {
        setBusyVariantKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  /**
   * Fetch a URL as a Blob and trigger a same-origin download with the
   * given filename. Used for both the original download and rendered
   * variants — single path means filename handling is identical.
   */
  const downloadUrlAsFile = useCallback(
    async (url: string, filename: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        // Defer the revoke one tick — Safari sometimes races with the
        // download trigger and cancels the save if the URL is yanked
        // synchronously.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      }
    },
    [],
  );

  // ── Local actions ─────────────────────────────────────────────────

  const openNewTab = useCallback(() => {
    if (!currentSrc) return;
    window.open(currentSrc, "_blank", "noopener,noreferrer");
  }, [currentSrc]);

  const copyLink = useCallback(async () => {
    // Internal viewer URL when we own the file (permanent + auth-gated),
    // external URL otherwise.
    const viewerUrl = deriveViewerUrl(block);
    const linkToCopy = viewerUrl
      ? `${window.location.origin}${viewerUrl}`
      : ((block.origin === "external" ? block.externalUrl : currentSrc) ?? "");
    if (!linkToCopy) {
      toast.error("No link to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(linkToCopy);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [block, currentSrc]);

  const copyImage = useCallback(async () => {
    if (!currentSrc) return;
    try {
      const response = await fetch(currentSrc);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      toast.success("Image copied to clipboard");
    } catch {
      toast.error("Could not copy image — try downloading instead");
    }
  }, [currentSrc]);

  // downloadUrl only exists on matrx-origin blocks (where the server
  // mints a Content-Disposition: attachment signed URL). External blocks
  // fall through to the currently-rendered src.
  const matrxDownloadUrl = block.origin === "matrx" ? block.downloadUrl : null;

  /**
   * "Save" the image. On mobile (iOS Safari, Android Chrome) this opens
   * the native share sheet via `navigator.share({ files })` — iOS shows
   * "Save Image" → Photos as the first option, which is what users
   * actually want when they tap a save button on their phone. On
   * desktop / non-capable browsers it falls back to the classic anchor
   * download (file lands in Downloads). One button, right behavior
   * everywhere, no platform branching at the call site.
   *
   * See `utils/save-image-file.ts` for the capability gating.
   */
  const download = useCallback(async () => {
    if (isDownloading) return;
    const url = matrxDownloadUrl ?? currentSrc;
    if (!url) {
      toast.error("No download URL available");
      return;
    }
    setIsDownloading(true);
    try {
      await saveImageFile({
        url,
        filename: downloadName,
        mimeType: block.mimeType ?? null,
        title: block.fileName ?? downloadName,
      });
    } catch {
      toast.error("Could not save image");
    } finally {
      setIsDownloading(false);
    }
  }, [
    isDownloading,
    matrxDownloadUrl,
    currentSrc,
    downloadName,
    block.mimeType,
    block.fileName,
  ]);

  const print = useCallback(async () => {
    if (!currentSrc) {
      toast.error("Image not ready");
      return;
    }
    try {
      await printImage(currentSrc, { title: block.fileName ?? "Image" });
    } catch (err) {
      toast.error("Print failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [currentSrc, block.fileName]);

  const viewOriginal = useCallback(() => {
    if (!parentFileId) return;
    window.open(`/files/f/${parentFileId}`, "_blank", "noopener,noreferrer");
  }, [parentFileId]);

  // ── Server actions ────────────────────────────────────────────────

  /**
   * Render + download a single format. Width is preserved (no resize)
   * unless the caller goes through `resizeAndDownload`.
   *
   * If the original *already matches* the target format, this falls
   * back to the local download path so we don't burn a server round
   * trip for a no-op.
   */
  const downloadAs = useCallback(
    async (format: ImageVariantFormat) => {
      // Fast path — the original is already in this format.
      const currentExt = block.mimeType?.split("/")[1]?.toLowerCase();
      if (
        currentExt === format ||
        (format === "jpeg" && currentExt === "jpg")
      ) {
        await download();
        return;
      }

      if (!isMatrx || !fileId) {
        toast.error("Format conversion needs a Matrx-owned file");
        return;
      }
      const spec: ImageVariantSpec = { format, quality: 90 };
      const key = `matrx_${format}_q90`;
      await withVariantBusy(key, async () => {
        const id = toast.loading(`Rendering ${format.toUpperCase()}…`);
        try {
          const variant = await renderImageVariant(fileId, spec);
          await downloadUrlAsFile(
            variant.downloadUrl,
            suggestVariantFilename(block.fileName, spec),
          );
          toast.success(`Downloaded as ${format.toUpperCase()}`, { id });
        } catch (err) {
          toast.error("Conversion failed", {
            id,
            description: err instanceof Error ? err.message : undefined,
          });
        }
      });
    },
    [
      block.mimeType,
      block.fileName,
      isMatrx,
      fileId,
      download,
      withVariantBusy,
      downloadUrlAsFile,
    ],
  );

  /**
   * Render at a target width (aspect ratio preserved) and download.
   * `format` defaults to JPEG when downsizing to a small thumbnail
   * (256/512) — those are almost always for sharing, where JPEG is
   * the universal compatible format. Otherwise defaults to the
   * original format.
   */
  const resizeAndDownload = useCallback(
    async (width: number, format?: ImageVariantFormat) => {
      if (!isMatrx || !fileId) {
        toast.error("Resize needs a Matrx-owned file");
        return;
      }

      // Default-format heuristic: JPEG for "small" (≤512px) since
      // that's typically a sharing/preview use case; otherwise match
      // the original.
      const resolvedFormat: ImageVariantFormat =
        format ??
        (width <= 512
          ? "jpeg"
          : ((block.mimeType?.split("/")[1] as
              | ImageVariantFormat
              | undefined) ?? "jpeg"));

      const spec: ImageVariantSpec = {
        width,
        format: resolvedFormat,
        quality: 90,
      };
      const key = `matrx_w${width}_${resolvedFormat}_q90`;

      await withVariantBusy(key, async () => {
        const id = toast.loading(
          `Rendering ${width}px ${resolvedFormat.toUpperCase()}…`,
        );
        try {
          const variant = await renderImageVariant(fileId, spec);
          await downloadUrlAsFile(
            variant.downloadUrl,
            suggestVariantFilename(block.fileName, spec),
          );
          toast.success(
            `Downloaded ${width}px ${resolvedFormat.toUpperCase()}`,
            {
              id,
            },
          );
        } catch (err) {
          toast.error("Resize failed", {
            id,
            description: err instanceof Error ? err.message : undefined,
          });
        }
      });
    },
    [
      isMatrx,
      fileId,
      block.mimeType,
      block.fileName,
      withVariantBusy,
      downloadUrlAsFile,
    ],
  );

  const isVariantBusy = busyVariantKeys.size > 0;
  const isVariantKeyBusy = useCallback(
    (key: string) => busyVariantKeys.has(key),
    [busyVariantKeys],
  );

  return {
    openNewTab,
    copyLink,
    copyImage,
    download,
    print,
    viewOriginal,
    downloadAs,
    resizeAndDownload,
    isDownloading,
    isVariantBusy,
    isVariantKeyBusy,
    parentFileId,
    downloadName,
  };
}
