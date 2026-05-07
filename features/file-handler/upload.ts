/**
 * features/file-handler/upload.ts
 *
 * Phase 3: turn an ephemeral source (Blob/File/buffer/data URI/external URL)
 * into a durably-persisted NormalizedFile by uploading through the
 * cloud-files REST endpoint. The handler is the SINGLE write path —
 * no callsite calls `Files.uploadFile` directly anymore.
 *
 * Org-scope routing (a `cld_files` invariant on this project): when
 * `inheritActiveScope` is on (default), the active organization /
 * project / task ids from the appContext slice are stamped into
 * `metadata.scope` so each row carries its scope context. The Python
 * backend reads this and writes the columns. Existing files are
 * unaffected.
 */

import type { RootState } from "@/lib/redux/store";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import * as Files from "@/features/files/api/files";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/features/agent-context/redux/appContextSlice";
import { FileUploadError } from "./errors";
import { fromCloudFile } from "./input/normalize";
import { recordTelemetry } from "./intelligence/telemetry";
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

  const folderPath = opts.folderPath ?? defaultFolderForSource(source);
  const filePath = `${folderPath}/${file.name}`;

  const metadata = stampScope(opts.metadata ?? {}, opts.inheritActiveScope ?? true);

  const start = Date.now();
  recordTelemetry({ event: "upload_started", mime: file.type });

  try {
    const { data } = opts.onProgress
      ? await Files.uploadFileWithProgress(
          {
            file,
            filePath,
            visibility: opts.visibility,
            shareWith: opts.shareWith,
            shareLevel: opts.shareLevel,
            metadata,
          },
          (event) => opts.onProgress!(event.loaded, event.total),
        )
      : await Files.uploadFile({
          file,
          filePath,
          visibility: opts.visibility,
          shareWith: opts.shareWith,
          shareLevel: opts.shareLevel,
          metadata,
        });

    recordTelemetry({
      event: "upload_completed",
      fileId: data.file_id,
      mime: file.type,
      durationMs: Date.now() - start,
    });

    // The upload response is an `FileUploadResponse` (slim — no
    // visibility/owner/permissions). Fetch the full FileRecord so the
    // returned NormalizedFile reflects exactly what the cloud-files
    // slice will render.
    const { data: full } = await Files.getFile(data.file_id);
    const cloudFile = apiFileRecordToCloudFile(full);
    return fromCloudFile(cloudFile, source);
  } catch (err) {
    recordTelemetry({
      event: "upload_failed",
      mime: file.type,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
    throw new FileUploadError(
      err instanceof Error ? err.message : "Upload failed",
      { cause: err },
    );
  }
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
      const name = overrideName ?? source.fileName ?? guessFilename(source.blob.type);
      return new File([source.blob], name, {
        type: source.mime ?? source.blob.type ?? "application/octet-stream",
      });
    }

    case "buffer": {
      const blob = bufferToBlob(source.buffer, source.mime);
      const name = overrideName ?? source.fileName ?? guessFilename(source.mime);
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
      const name = overrideName ?? source.fileName ?? guessFilename(source.mime);
      return new File([blob], name, { type: source.mime });
    }

    case "data_uri":
    case "base64": {
      const dataUri = source.kind === "data_uri"
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
      const name = overrideName ?? filenameFromUrl(source.url) ?? guessFilename(blob.type);
      return new File([blob], name, { type: source.mime ?? blob.type });
    }

    case "youtube":
      throw new FileUploadError("YouTube URLs cannot be uploaded — pass them as a source directly");

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
  return new File([file], name, { type: file.type, lastModified: file.lastModified });
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
  const existing = (metadata.scope as Record<string, unknown> | undefined) ?? {};
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
