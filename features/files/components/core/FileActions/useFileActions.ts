/**
 * features/files/components/core/FileActions/useFileActions.ts
 *
 * Headless action bundle — every action reads from Redux and dispatches the
 * right thunk. Buttons, menus, shortcuts call into this rather than touching
 * thunks directly.
 */

"use client";

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  createShareLink,
  deleteFile as deleteFileThunk,
  getSignedUrl,
  loadShareLinks,
  moveFile as moveFileThunk,
  renameFile as renameFileThunk,
  restoreVersion as restoreVersionThunk,
  updateFileMetadata,
} from "@/features/files/redux/thunks";
import {
  deleteAny,
  moveAny,
  renameAny,
} from "@/features/files/redux/virtual-thunks";
import {
  selectActiveShareLinksForResource,
  selectFileById,
} from "@/features/files/redux/selectors";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import * as Files from "@/features/files/api/files";
import { pythonShareUrl } from "@/features/files/handler/utils/python-base";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import type { Visibility } from "@/features/files/types";

export interface FileActionHandlers {
  rename: (newName: string) => Promise<void>;
  move: (newParentFolderId: string | null) => Promise<void>;
  setVisibility: (visibility: Visibility) => Promise<void>;
  updateMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  /**
   * Soft delete by default. Pass `{ hard: true }` to remove S3 bytes.
   */
  delete: (opts?: { hard?: boolean }) => Promise<void>;
  restoreVersion: (versionNumber: number) => Promise<void>;
  /**
   * Fetches a fresh signed URL and triggers a download via a transient anchor.
   * Doesn't write to state.
   */
  download: () => Promise<void>;
  /**
   * Copies a public, embeddable URL to clipboard.
   *
   * Priority order:
   *   1. **CDN URL** (`file.publicUrl`) — used when the file's visibility is
   *      "public" and the Python backend has CDN enabled. Permanent, cache-
   *      accelerated, not revocable. Ideal for embedding in RSS feeds, OG
   *      images, podcasts, or anywhere that needs a stable URL.
   *   2. **Share-token URL** — `{BACKEND}/share/<token>/download`. Used for
   *      private/shared files (or public files where CDN isn't configured).
   *      Revocable from the Share dialog. Still works as `<img src>` or
   *      direct download with no Next.js hop.
   *
   * If the file is public but `publicUrl` is null in Redux (common when the
   * file was loaded from the tree RPC rather than the REST endpoint), the
   * handler fetches the REST record once to hydrate the CDN URL before
   * falling back to share-token creation.
   *
   * Pass `{ expiresIn }` to use the legacy temporary signed-URL path —
   * intended for the duplicate flow which needs to fetch bytes immediately.
   */
  copyShareUrl: (opts?: { expiresIn?: number }) => Promise<string | null>;
}

export function useFileActions(fileId: string): FileActionHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  // Synthetic ids (`vfs:<adapter>:<vid>`) belong to virtual sources. Route
  // ops through the source-aware `*Any` thunks so each adapter's `write`,
  // `rename`, `move`, `delete` runs against the right Postgres column —
  // not the Python REST contract that only knows real cloud-files.
  const isVirtual = isSyntheticId(fileId) || file?.source.kind === "virtual";

  const rename = useCallback(
    async (newName: string) => {
      if (isVirtual) {
        await dispatch(renameAny({ id: fileId, newName })).unwrap();
        return;
      }
      await dispatch(renameFileThunk({ fileId, newName })).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const move = useCallback(
    async (newParentFolderId: string | null) => {
      if (isVirtual) {
        await dispatch(
          moveAny({ id: fileId, newParentId: newParentFolderId }),
        ).unwrap();
        return;
      }
      await dispatch(moveFileThunk({ fileId, newParentFolderId })).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const setVisibility = useCallback(
    async (visibility: Visibility) => {
      if (isVirtual) {
        // Visibility on virtual rows isn't uniformly supported across
        // adapters yet; the Notes/CodeFiles adapters track visibility
        // differently from real cloud-files. Surface as a no-op until each
        // adapter declares the capability.
        return;
      }
      await dispatch(
        updateFileMetadata({ fileId, patch: { visibility } }),
      ).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const updateMetadata = useCallback(
    async (metadata: Record<string, unknown>) => {
      if (isVirtual) return;
      await dispatch(
        updateFileMetadata({ fileId, patch: { metadata } }),
      ).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const deleteAction = useCallback(
    async (opts?: { hard?: boolean }) => {
      if (isVirtual) {
        await dispatch(
          deleteAny({ id: fileId, hard: opts?.hard ?? false }),
        ).unwrap();
        return;
      }
      await dispatch(
        deleteFileThunk({ fileId, hardDelete: opts?.hard ?? false }),
      ).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const restoreVersion = useCallback(
    async (versionNumber: number) => {
      if (isVirtual) {
        // Per-source version semantics live on the adapter; not routed yet.
        return;
      }
      await dispatch(restoreVersionThunk({ fileId, versionNumber })).unwrap();
    },
    [dispatch, fileId, isVirtual],
  );

  const download = useCallback(async () => {
    if (isVirtual) {
      // Virtual files don't have signed S3 URLs. Callers should hide the
      // download UI — the early return is belt-and-suspenders.
      return;
    }
    // Stream bytes through the Python backend (not via a signed S3 URL).
    // S3 signed URLs are cross-origin and browsers silently ignore the
    // `a.download` attribute on cross-origin URLs — the file saves with
    // whatever name S3 puts in the URL path (usually a UUID, no extension).
    // A blob: URL is always same-origin, so `a.download` is honoured and
    // the browser saves with the correct filename and extension.
    const { blob, filename } = await Files.downloadFile(fileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Prefer the filename from Content-Disposition (set by the Python backend).
    // Fall back to the name stored in Redux, then a generic fallback.
    a.download = filename ?? file?.fileName ?? "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [file?.fileName, fileId, isVirtual]);

  const copyShareUrl = useCallback(
    async (opts?: { expiresIn?: number }) => {
      if (isVirtual) return null;

      // Legacy temporary-URL path — only used by the duplicate flow that
      // needs to `fetch()` bytes immediately. A short-lived signed URL is
      // the right tool there: no side-effects on the file's share state.
      if (opts?.expiresIn !== undefined) {
        const result = await dispatch(
          getSignedUrl({ fileId, expiresIn: opts.expiresIn }),
        ).unwrap();
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(result.url);
          } catch {
            /* ignore clipboard failures (non-secure contexts) */
          }
        }
        return result.url;
      }

      // For PUBLIC files, prefer the CDN URL (`publicUrl`) — it's
      // permanent, CDN-cached, and doesn't require a revocable token.
      // `publicUrl` is null when the file was loaded from the tree RPC
      // (which doesn't return the computed CDN URL), so we fetch the
      // REST record once to hydrate it.
      if (file?.visibility === "public") {
        let cdnUrl = file.publicUrl ?? null;
        if (!cdnUrl) {
          try {
            const { data } = await Files.getFile(fileId);
            cdnUrl = apiFileRecordToCloudFile(data).publicUrl ?? null;
          } catch {
            // REST fetch failed — fall through to share-token path.
          }
        }
        if (cdnUrl) {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(cdnUrl);
            } catch {
              /* ignore clipboard failures (non-secure contexts) */
            }
          }
          return cdnUrl;
        }
        // publicUrl unavailable even after REST fetch (CDN not configured
        // on the backend) — fall through to the share-token path below.
      }

      // Default path — return a persistent public URL backed by a share
      // token. Reuses an existing active read-only link when present;
      // otherwise creates one. The URL points at Python's public
      // `{BACKEND}/share/<token>/download` endpoint so it works as an
      // `<img src>`, raw download, or anywhere else — no Next.js hop.
      let token: string | undefined;

      // Look in the slice first to avoid a needless network round-trip.
      const cachedLinks = selectActiveShareLinksForResource(
        store.getState(),
        fileId,
      );
      const cachedReadLink = cachedLinks.find(
        (l) => l.permissionLevel === "read",
      );
      if (cachedReadLink) {
        token = cachedReadLink.shareToken;
      } else {
        // Cache may be cold (no one has opened the Share dialog this
        // session). Load before deciding to create — keeps us from
        // accidentally creating duplicate links.
        await dispatch(loadShareLinks({ resourceId: fileId }))
          .unwrap()
          .catch(() => undefined);
        const refreshed = selectActiveShareLinksForResource(
          store.getState(),
          fileId,
        );
        const reusable = refreshed.find((l) => l.permissionLevel === "read");
        if (reusable) {
          token = reusable.shareToken;
        } else {
          // None exists — mint a fresh read-only, no-expiry link. The
          // user can revoke it via the Share dialog whenever they want.
          const link = await dispatch(
            createShareLink({
              resourceId: fileId,
              resourceType: "file",
              permissionLevel: "read",
            }),
          ).unwrap();
          token = link.shareToken;
        }
      }

      if (!token) return null;

      const url = pythonShareUrl(token);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* ignore clipboard failures */
        }
      }
      return url;
    },
    [dispatch, fileId, isVirtual, store],
  );

  return useMemo(
    () => ({
      rename,
      move,
      setVisibility,
      updateMetadata,
      delete: deleteAction,
      restoreVersion,
      download,
      copyShareUrl,
    }),
    [
      rename,
      move,
      setVisibility,
      updateMetadata,
      deleteAction,
      restoreVersion,
      download,
      copyShareUrl,
    ],
  );
}
