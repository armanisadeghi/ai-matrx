/**
 * features/files/handler/upload.ts
 *
 * The single write path. Coerces a `FileSource` into a `File`, then runs
 * it through `cloudUpload` (which dispatches optimistic Redux updates,
 * calls Python's `/files/upload`, and optionally creates a share link in
 * the same round-trip). The returned `NormalizedFile` reflects the new
 * `cld_files` row and carries the share-link URL when requested.
 *
 * Org-scope routing: when `inheritActiveScope` is on (default), the
 * active organization / project / task ids from the appContext slice
 * are stamped into `metadata.scope` so each row carries its scope
 * context. The Python backend reads this and writes the columns.
 */

import type { RootState, AppDispatch } from "@/lib/redux/store";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import {
  cloudUpload,
  isCloudUploadFailure,
} from "@/features/files/upload/cloudUpload";
import * as Files from "@/features/files/api/files";
import {
  uploadAsset,
  uploadAssetWithProgress,
} from "@/features/files/api/assets";
import { pythonShareUrl } from "@/features/files/handler/utils/python-base";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { FileUploadError } from "./errors";
import { fromCloudFile } from "./input/normalize";
import type { FileSource, NormalizedFile, UploadOpts } from "./types";

const DEFAULT_FOLDER = "Inbox";

export async function uploadInternal(
  source: FileSource,
  opts: UploadOpts,
): Promise<NormalizedFile> {
  const file = await sourceToFile(source, opts.fileName);
  if (!file) {
    throw new FileUploadError(
      "Cannot upload: source did not produce raw bytes (use the input shape that already has a fileId instead)",
    );
  }

  const store = getStoreSingleton();
  if (!store) {
    throw new FileUploadError("Cannot upload: redux store not yet initialized");
  }
  const dispatch = store.dispatch as AppDispatch;

  const folderPath = opts.folderPath ?? defaultFolderForSource(source);
  const metadata = stampScope(
    opts.metadata ?? {},
    opts.inheritActiveScope ?? true,
  );

  // Asset-pipeline branch — when `preset` is set the upload routes through
  // `POST /assets`, which renders preset variants server-side and returns
  // the canonical Asset envelope. The handler stitches the envelope onto
  // the returned NormalizedFile so consumers can read every variant URL
  // (og_url, thumbnail_url, etc.) without a second round-trip.
  if (opts.preset) {
    const params = {
      file,
      preset: opts.preset,
      folder: folderPath.replace(/^\/+|\/+$/g, ""),
      visibility: opts.visibility ?? "public",
      customVariants: opts.customVariants,
      shareWith: opts.shareWith,
      shareLevel: opts.shareLevel,
      metadata,
    };
    const { data: asset } = opts.onProgress
      ? await uploadAssetWithProgress(params, (event) =>
          opts.onProgress!(event.loaded, event.total),
        )
      : await uploadAsset(params);
    // Hydrate the cloud-files row so the cloudFiles slice sees the new
    // master record and downstream readers (selectors, realtime) get it.
    const { data: full } = await Files.getFile(asset.file_id);
    const cloudFile = apiFileRecordToCloudFile(full);
    const normalized = fromCloudFile(cloudFile, source);
    return {
      ...normalized,
      asset,
      url: asset.primary_url ?? normalized.url,
    };
  }

  const result = await cloudUpload(
    file,
    {
      folderPath: folderPath.replace(/^\/+|\/+$/g, ""),
      visibility: opts.visibility ?? "private",
      shareWith: opts.shareWith,
      shareLevel: opts.shareLevel,
      metadata,
      onProgress: opts.onProgress
        ? (event) => opts.onProgress!(event.loaded, event.total)
        : undefined,
      createShareLink: opts.createShareLink,
      shareLinkPermissionLevel: opts.shareLinkPermissionLevel,
      shareLinkExpiresAt: opts.shareLinkExpiresAt,
      shareLinkMaxUses: opts.shareLinkMaxUses,
    },
    dispatch,
  );

  if (isCloudUploadFailure(result)) {
    throw new FileUploadError(result.error);
  }

  // cloudUpload returns slim metadata. Fetch the full row so the
  // returned NormalizedFile reflects every column the cloudFiles slice
  // will see (visibility/owner/permissions/checksum/...).
  const { data: full } = await Files.getFile(result.fileId);
  const cloudFile = apiFileRecordToCloudFile(full);
  const normalized = fromCloudFile(cloudFile, source);

  // Stitch on the share-link fields — cloudUpload created them in the
  // same round-trip as the upload. Guarantee `url` is non-empty when a
  // share token is present: prefer the directUrl, then the user-facing
  // `/share/{token}` page (when an appOrigin is supplied), then the
  // canonical Python `/share/{token}/download` URL. Never assign `""`
  // — `??` does not short-circuit empty strings and downstream consumers
  // depend on truthiness for the URL field.
  if (result.shareToken) {
    const appShareUrl = opts.appOrigin
      ? `${opts.appOrigin.replace(/\/$/, "")}/share/${result.shareToken}`
      : undefined;
    const url =
      result.directUrl ||
      appShareUrl ||
      result.shareUrl ||
      normalized.url ||
      pythonShareUrl(result.shareToken);
    return {
      ...normalized,
      shareToken: result.shareToken,
      url,
    };
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Source → File coercion. Anything that already carries server identity
// (cloud_file, file_id, signed_url, ...) is rejected — those are not
// "uploads", they're already persisted. The handler's resolve() path is
// the right tool for those.
// ---------------------------------------------------------------------------

async function sourceToFile(
  source: FileSource,
  overrideName?: string,
): Promise<File | null> {
  switch (source.kind) {
    case "file":
      return overrideName ? renameFile(source.file, overrideName) : source.file;

    case "blob": {
      const name =
        overrideName ?? source.fileName ?? guessFilename(source.blob.type);
      return new File([source.blob], name, {
        type: source.mime ?? source.blob.type ?? "application/octet-stream",
      });
    }

    case "buffer": {
      const blob = bufferToBlob(source.buffer, source.mime);
      const name =
        overrideName ?? source.fileName ?? guessFilename(source.mime);
      return new File([blob], name, { type: source.mime });
    }

    case "stream": {
      const reader = source.stream.getReader();
      const parts: BlobPart[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const copy = new Uint8Array(value.byteLength);
          copy.set(value);
          parts.push(copy.buffer as ArrayBuffer);
        }
      }
      const blob = new Blob(parts, { type: source.mime });
      const name =
        overrideName ?? source.fileName ?? guessFilename(source.mime);
      return new File([blob], name, { type: source.mime });
    }

    case "data_uri":
    case "base64": {
      const dataUri =
        source.kind === "data_uri"
          ? source.dataUri
          : `data:${source.mime};base64,${source.base64}`;
      const blob = await dataUriToBlob(dataUri);
      const fallbackName =
        ("fileName" in source && source.fileName) || guessFilename(blob.type);
      const name = overrideName ?? fallbackName;
      return new File([blob], name, { type: blob.type });
    }

    case "external_url": {
      const res = await fetch(source.url);
      if (!res.ok) {
        throw new FileUploadError(
          `Failed to fetch external URL for upload (${res.status})`,
        );
      }
      const blob = await res.blob();
      const name =
        overrideName ?? filenameFromUrl(source.url) ?? guessFilename(blob.type);
      return new File([blob], name, { type: source.mime ?? blob.type });
    }

    case "youtube":
      throw new FileUploadError(
        "YouTube URLs cannot be uploaded — pass them as a source directly",
      );

    default:
      return null;
  }
}

function bufferToBlob(
  buffer: ArrayBuffer | Uint8Array | SharedArrayBuffer,
  mime: string,
): Blob {
  if (buffer instanceof Uint8Array) {
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    return new Blob([copy.buffer], { type: mime });
  }
  if (buffer instanceof ArrayBuffer) return new Blob([buffer], { type: mime });
  const view = new Uint8Array(buffer as unknown as ArrayBufferLike);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new Blob([copy.buffer], { type: mime });
}

function dataUriToBlob(dataUri: string): Promise<Blob> {
  return fetch(dataUri).then((r) => r.blob());
}

function renameFile(file: File, name: string): File {
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").pop();
    return last && last.length > 0 ? last : undefined;
  } catch {
    return undefined;
  }
}

function guessFilename(mime: string): string {
  if (!mime) return "upload.bin";
  const ext = mime.split("/")[1]?.split(";")[0] ?? "bin";
  return `upload-${Date.now()}.${ext}`;
}

function stampScope(
  metadata: Record<string, unknown>,
  inherit: boolean,
): Record<string, unknown> {
  if (!inherit) return metadata;
  const store = getStoreSingleton();
  if (!store) return metadata;
  const state = store.getState() as RootState;
  const organizationId = selectOrganizationId(state);
  const projectId = selectProjectId(state);
  const taskId = selectTaskId(state);
  if (!organizationId && !projectId && !taskId) return metadata;
  const existing =
    (metadata.scope as Record<string, unknown> | undefined) ?? {};
  return {
    ...metadata,
    scope: {
      ...existing,
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(projectId ? { project_id: projectId } : {}),
      ...(taskId ? { task_id: taskId } : {}),
    },
  };
}

function defaultFolderForSource(source: FileSource): string {
  switch (source.kind) {
    case "file":
    case "blob":
      return DEFAULT_FOLDER;
    case "data_uri":
    case "base64":
      return `${DEFAULT_FOLDER}/Pasted`;
    case "external_url":
      return `${DEFAULT_FOLDER}/Imported`;
    default:
      return DEFAULT_FOLDER;
  }
}
