/**
 * features/files/media-client/client.ts
 *
 * THE strangler seam for the C20 media swap: the app's `MediaClient`
 * implementation for `@ai-matrx/media`, wired over today's universal file
 * handler. The handler stays the engine (resolution, session cookie, blob
 * cache, upload transports); this ONE module is the adapter the package
 * renders through. When `@ai-matrx/data/files` ships, it replaces the
 * internals here without touching any component.
 *
 * Law enforcement lives behind `resolve()`:
 *   - a signed/expiring URL is REFUSED (screams via
 *     `reportMediaDurabilityViolation`, then throws) — law 3 / D108;
 *   - private image pixels ride the bearer-authenticated blob lane
 *     (`transport: "blob"`), exactly like the original `InlineMediaRef`;
 *   - video/audio and public CDN URLs bind durable URLs directly
 *     (`mx_files_session` cookie / permanent CDN).
 *
 * See `features/files/handler/FEATURE.md` and
 * common-docs/systems/media/media-durability/FEATURE.md before changing
 * anything here.
 */

import {
  mintDurableSrc,
  type MediaClient,
  type MediaKind,
  type MediaMultiUploadResult,
  type MediaRef,
  type MediaRefLike,
  type MediaResolution,
  type MediaUnavailableReason,
  type MediaUploadOptions,
  type MediaUploadResult,
} from "@ai-matrx/media";
import {
  classifyMediaUrl,
  reportMediaDurabilityViolation,
  shareableMediaUrl,
} from "@/lib/media/durability";
import {
  fileIdFromFileEndpointUrl,
  mimeFromUrl,
  recognizeOurFileUrl,
} from "@/lib/media/our-file-sources";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { fileHandler } from "@/features/files/handler/handler";
import {
  FileAccessDeniedError,
  FileDeletedError,
  FileNotFoundError,
} from "@/features/files/handler/errors";
import { ensureFilesSession } from "@/features/files/handler/session";
import {
  fileUrls,
  pythonShareUrl,
} from "@/features/files/handler/utils/python-base";
import type { Visibility } from "@/features/files/types";
import {
  selectActiveShareLinksForResource,
  selectFileById,
} from "@/features/files/redux/selectors";
import {
  createShareLink,
  ensureCloudFileFields,
  loadShareLinks,
} from "@/features/files/redux/thunks";
import {
  areCloudFileFieldsLoaded,
  FILE_RENDER_FIELDS,
} from "@/features/files/redux/file-hydration";
import {
  getCached,
  hydrateFromIdb,
  setCached,
} from "@/features/files/hooks/blob-cache";
import * as Files from "@/features/files/api/files";
import { requestUpload } from "@/features/files/upload/UploadGuardHost";
import type { AppDispatch } from "@/lib/redux/store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NormalizedRef =
  | { kind: "file_id"; fileId: string; mime: string | null }
  | { kind: "url"; url: string; mime: string | null }
  | null;

function normalizeRef(ref: MediaRefLike | null | undefined): NormalizedRef {
  if (!ref) return null;
  if (typeof ref === "string") {
    if (UUID_RE.test(ref)) return { kind: "file_id", fileId: ref, mime: null };
    if (!ref.trim()) return null;
    return normalizeUrl(ref, null);
  }
  if (ref.file_id) {
    return { kind: "file_id", fileId: ref.file_id, mime: ref.mime_type ?? null };
  }
  if (ref.url) return normalizeUrl(ref.url, ref.mime_type ?? null);
  return null;
}

/**
 * A URL pointing at one of OUR authenticated byte endpoints
 * (`{base}/files/{id}/download`, `{base}/media/{id}/v/{class}`) is an
 * IDENTITY in disguise: rendered as an opaque external URL it fails for
 * everyone whose file-session cookie isn't fresh, and canvas/crossOrigin
 * consumers fetch it with no Authorization header at all (QA F2 — the
 * annotate lane). Promote it to the file_id lane so pixels ride the
 * bearer-authenticated blob transport like every owned file.
 */
function normalizeUrl(url: string, mime: string | null): NormalizedRef {
  const endpointFileId = fileIdFromFileEndpointUrl(url);
  if (endpointFileId) {
    return {
      kind: "file_id",
      fileId: endpointFileId,
      mime: mime ?? mimeFromUrl(url),
    };
  }
  return { kind: "url", url, mime };
}

function mimeToKind(mime: string | null): MediaKind {
  if (!mime) return "image"; // matches the original <img> default
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function looksLikeCdnUrl(url: string): boolean {
  return url.startsWith("https://cdn.") || url.includes("/cdn/");
}

/**
 * Fire-and-forget Redux hydration for a file id (public/CDN detection,
 * mime, thumbnail metadata). Deduped per id; scheduled on a microtask so a
 * render-time `resolve()` never dispatches during React's render phase.
 */
const hydrationRequested = new Set<string>();
function scheduleHydration(fileId: string): void {
  if (hydrationRequested.has(fileId)) return;
  hydrationRequested.add(fileId);
  queueMicrotask(() => {
    const store = getStoreSingleton();
    if (!store) {
      hydrationRequested.delete(fileId);
      return;
    }
    const existing = selectFileById(store.getState(), fileId);
    if (areCloudFileFieldsLoaded(existing, FILE_RENDER_FIELDS)) return;
    const dispatch = store.dispatch as AppDispatch;
    void dispatch(
      ensureCloudFileFields({ fileId, fields: FILE_RENDER_FIELDS }),
    ).finally(() => {
      // Allow a later re-request if this attempt failed to land the fields.
      const after = getStoreSingleton();
      const record = after ? selectFileById(after.getState(), fileId) : undefined;
      if (!areCloudFileFieldsLoaded(record, FILE_RENDER_FIELDS)) {
        hydrationRequested.delete(fileId);
      }
    });
  });
}

/**
 * In-flight byte-download dedup, mirroring `hooks/useFileBlob.ts` — two
 * simultaneous consumers of the same fileId share ONE network download.
 */
const inflightDownloads = new Map<string, Promise<Blob>>();

async function fileIdBlob(fileId: string): Promise<{ url: string; blob: Blob }> {
  if (fileId.startsWith("vfs:")) {
    throw new Error(
      "MediaClient.getBlob can't load virtual files — use the adapter's inlinePreview or readAny instead.",
    );
  }
  const cached = getCached(fileId);
  if (cached) return { url: cached.url, blob: cached.blob };
  const idbHit = await hydrateFromIdb(fileId);
  if (idbHit) return { url: idbHit.url, blob: idbHit.blob };
  let download = inflightDownloads.get(fileId);
  if (!download) {
    download = Files.downloadFileWithProgress(fileId, () => {}).then(
      ({ blob }) => blob,
    );
    inflightDownloads.set(fileId, download);
    void download
      .finally(() => {
        if (inflightDownloads.get(fileId) === download) {
          inflightDownloads.delete(fileId);
        }
      })
      .catch(() => {
        // Every awaiting consumer handles the rejection; this only stops the
        // void'd cleanup chain from re-surfacing it as unhandled.
      });
  }
  const blob = await download;
  const already = getCached(fileId);
  const objectUrl = already?.url ?? URL.createObjectURL(blob);
  if (!already) setCached(fileId, blob, objectUrl, { mimeType: blob.type });
  return { url: objectUrl, blob };
}

function refuseExpiringUrl(url: string): never {
  reportMediaDurabilityViolation(url, "media-client.resolve");
  throw new Error(
    "Expiring/signed media URL refused — a signed URL is a handoff, never an identity. Pass the file_id.",
  );
}

/**
 * Side-effect-free variant of `shareableUrl` for the quick COPY action:
 * returns a durable public URL when one already exists, and null otherwise —
 * it never mints a share link (minting is the SHARE door's job).
 */
export function shareableUrlNoMint(ref: MediaRefLike): string | null {
  const norm = normalizeRef(ref);
  if (!norm) return null;
  if (norm.kind === "url") return shareableMediaUrl(norm.url);
  const store = getStoreSingleton();
  const record = store
    ? selectFileById(store.getState(), norm.fileId)
    : undefined;
  if (record?.visibility !== "public") return null;
  return shareableMediaUrl(record.cdnUrl ?? record.publicUrl);
}

export const mediaClient: MediaClient = {
  resolve(ref: MediaRefLike): MediaResolution | null {
    const norm = normalizeRef(ref);
    if (!norm) return null;

    if (norm.kind === "url") {
      if (classifyMediaUrl(norm.url) === "expiring") refuseExpiringUrl(norm.url);
      const mime = norm.mime ?? mimeFromUrl(norm.url);
      const ours = recognizeOurFileUrl(norm.url) !== null;
      return {
        src: mintDurableSrc(norm.url),
        kind: mimeToKind(mime),
        mimeType: mime ?? undefined,
        transport: "element",
        isCdn: looksLikeCdnUrl(norm.url),
        // A session refresh can't resurrect someone else's link rot.
        recoverable: ours,
      };
    }

    const { fileId } = norm;
    const store = getStoreSingleton();
    const record = store ? selectFileById(store.getState(), fileId) : undefined;
    if (!fileId.startsWith("vfs:")) scheduleHydration(fileId);

    const mime = norm.mime ?? record?.mimeType ?? null;
    const kind = mimeToKind(mime);
    const thumbRaw = record?.thumbnailUrl ?? null;
    const thumbnailSrc =
      thumbRaw && classifyMediaUrl(thumbRaw) !== "expiring"
        ? mintDurableSrc(thumbRaw)
        : undefined;

    const permanentPublicUrl =
      record?.visibility === "public"
        ? (record.cdnUrl ?? record.publicUrl ?? null)
        : null;
    if (permanentPublicUrl) {
      return {
        src: mintDurableSrc(permanentPublicUrl),
        kind,
        mimeType: mime ?? undefined,
        transport: "element",
        isCdn: true,
        recoverable: true,
        thumbnailSrc,
      };
    }

    // Private/unknown-visibility pixels: images (and file-kinds rendered as
    // <img>) ride the bearer-authenticated blob lane, exactly like the
    // original InlineMediaRef. Video/audio bind the durable URL directly
    // (the mx_files_session cookie authenticates GET byte routes).
    const transport = kind === "video" || kind === "audio" ? "element" : "blob";
    return {
      src: mintDurableSrc(fileUrls(fileId).inline),
      kind,
      mimeType: mime ?? undefined,
      transport,
      recoverable: true,
      thumbnailSrc,
    };
  },

  async getBlob(ref: MediaRefLike) {
    const norm = normalizeRef(ref);
    if (!norm) throw new Error("MediaClient.getBlob: empty media ref");
    if (norm.kind === "file_id") {
      const { url, blob } = await fileIdBlob(norm.fileId);
      return {
        url,
        blob,
        // The module-level blob cache owns the object URL — it revokes on
        // eviction/invalidate, never on component unmount.
        release: () => {},
      };
    }
    if (classifyMediaUrl(norm.url) === "expiring") refuseExpiringUrl(norm.url);
    const blob = await fileHandler
      .use({ kind: "external_url", url: norm.url })
      .as({ kind: "blob" });
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      blob,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  },

  async recoverLoadError(_src, attempt) {
    if (attempt > 1) return "terminal";
    console.warn(
      "[media-client] media failed to load — refreshing the file session and retrying the same durable URL.",
    );
    try {
      await ensureFilesSession({ force: true });
      return "retry";
    } catch {
      return "terminal";
    }
  },

  async upload(
    file: File | Blob,
    opts: MediaUploadOptions = {},
  ): Promise<MediaUploadResult> {
    // A target folder id only exists on the batch path (requestUpload —
    // which also runs the SHA-256 dedup pre-flight). Route through it so
    // the file lands where the caller asked.
    if (opts.parentFolderId != null && file instanceof File) {
      const result = await this.uploadMany!([file], opts);
      if (result.cancelled) throw new Error("Upload cancelled");
      const fileId = result.uploaded[0];
      if (!fileId) {
        throw new Error(result.failed[0]?.error ?? "Upload failed");
      }
      return { fileId, ref: { file_id: fileId } };
    }
    const source =
      file instanceof File
        ? ({ kind: "file", file } as const)
        : ({
            kind: "blob",
            blob: file,
            fileName: opts.fileName,
            mime: opts.mimeType,
          } as const);
    const normalized = await fileHandler.upload(source, {
      fileName: opts.fileName,
      visibility: opts.visibility as Visibility | undefined,
      metadata: opts.metadata,
      onProgress: opts.onProgress,
    });
    const ref: MediaRef = {
      file_id: normalized.fileId,
      url: normalized.url ?? undefined,
      mime_type: normalized.meta?.mime ?? undefined,
    };
    return { fileId: normalized.fileId, ref };
  },

  async uploadMany(
    files: File[],
    opts: MediaUploadOptions = {},
  ): Promise<MediaMultiUploadResult> {
    const { uploaded, failed, cancelled } = await requestUpload({
      files,
      parentFolderId: opts.parentFolderId ?? null,
      folderPath: null,
      visibility: (opts.visibility as Visibility | undefined) ?? "personal",
      metadata: opts.metadata,
    });
    return { uploaded, failed, cancelled };
  },

  async shareableUrl(ref: MediaRefLike): Promise<string | null> {
    // THE public-link door (M-SHARE, ruling C19): permanent CDN URL for
    // public files, else reuse-or-mint a no-expiry read-only share link —
    // the exact two paths of the retired Image/Video share popovers. Asked
    // on CLICK by the package share body (minting is a side effect the
    // origin also deferred to the click). Fails closed (law 4).
    const norm = normalizeRef(ref);
    if (!norm) return null;
    if (norm.kind === "url") return shareableMediaUrl(norm.url);
    const { fileId } = norm;
    if (fileId.startsWith("vfs:")) return null;
    const store = getStoreSingleton();
    if (!store) return null;
    const dispatch = store.dispatch as AppDispatch;
    // Hydrate visibility/CDN fields before deciding to mint — an unhydrated
    // public file must never get a redundant share link.
    await dispatch(ensureCloudFileFields({ fileId, fields: FILE_RENDER_FIELDS }));
    const record = selectFileById(store.getState(), fileId);
    if (record?.visibility === "public") {
      const permanent = shareableMediaUrl(record.cdnUrl ?? record.publicUrl);
      if (permanent) return permanent;
    }
    // Reuse an existing no-expiry read-only link, or mint one.
    await dispatch(
      loadShareLinks({ resourceId: fileId, resourceType: "file" }),
    ).unwrap();
    const existing = selectActiveShareLinksForResource(
      store.getState(),
      fileId,
    ).find((l) => l.permissionLevel === "viewer" && !l.expiresAt && !l.maxUses);
    const token =
      existing?.shareToken ??
      (
        await dispatch(
          createShareLink({
            resourceId: fileId,
            resourceType: "file",
            permissionLevel: "viewer",
          }),
        ).unwrap()
      ).shareToken;
    return pythonShareUrl(token);
  },

  classifyError(err: unknown): MediaUnavailableReason {
    if (err instanceof FileAccessDeniedError) return "access_denied";
    if (err instanceof FileNotFoundError) return "not_found";
    if (err instanceof FileDeletedError) return "deleted";
    return "unknown";
  },
};
