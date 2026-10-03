"use client";

/**
 * InlineUploadArea — the compact, embeddable upload surface for the unified
 * "Files" attach picker. Extracted from the deleted standalone
 * `UploadResourcePicker` (2026-08-08, one-Files-entry overhaul); the upload
 * contract is unchanged: compression for large images/PDFs, `useFileUpload`
 * with `visibility: "personal"` + share link, and `onSelect(files)` fired
 * once with every successfully uploaded file so the host can await durable
 * edges before dismissing.
 */

import type React from "react";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  Loader2,
  Minimize2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useFileUpload,
  type UseFileUploadResult,
} from "@/features/files/handler/hooks/useFileUpload";
import { FileAcquisitionActions } from "@/features/files/components/core/FileAcquisition/FileAcquisitionActions";
import { composeUploadFolderPath } from "@/features/files/handler/utils/upload-folder-path";
import { isUploadCancelledError } from "@/features/files/handler/errors";
import {
  compressPdfMultipart,
  materializeAssetResult,
} from "@/features/files/api/assets";
import {
  getFileDetailsByUrl,
  EnhancedFileDetails,
} from "@/utils/file-operations/constants";
// THE ONE byte-size formatter (@ai-matrx/media 0.5.0 moved it to kit). The
// local `formatBytes` that stood here divided by a `const k = 1024` binding, so
// the shape detector in `scripts/byte-size-shape.mjs` — which looks for a
// literal 1024/1048576/1073741824 divisor — could not see it. Same output for
// every real size, plus the em-dash guard for null/NaN/negative.
import { formatFileSize } from "@ai-matrx/kit/format";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";
import { pythonFileInlineUrl } from "@/features/files/handler/utils/python-base";
import { matchStorageAccept } from "@/features/files/storage-sources/accept";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Input } from "@ai-matrx/design-system";
import { ImageLinkError, imageLinkToFile } from "./imageLink";

export interface UploadedFile {
  /** Original local filename, retained even when the durable URL is opaque. */
  name: string;
  /**
   * cld_files UUID. When present, downstream code building outbound AI
   * API payloads should construct a `MediaRef` from this id (via
   * `fileIdToMediaRef`) rather than the share URL.
   */
  fileId: string;
  url: string;
  /**
   * **FE classification token** — one of `"image" | "video" | "audio"
   * | "document" | "text" | "pdf" | "other" | "unknown"` from
   * `classifyUploadType()`. This is NOT a MIME type; do not send it to
   * the backend as `mime_type`. Use `mime_type` below for the real
   * RFC MIME (`"image/jpeg"`, `"audio/mp3"`, etc.).
   */
  type: string;
  /** Real RFC MIME type from the source File / upload result. */
  mime_type?: string;
  /** Canonical file metadata, built for every successful upload. */
  details: EnhancedFileDetails;
}

interface InlineUploadAreaProps {
  /**
   * Fired once per batch with every file that uploaded successfully.
   * Failed files stay visible in the progress list with a retry.
   */
  onSelect: (files: UploadedFile[]) => void | Promise<void>;
  /** Lets the host disable navigation while uploads are in flight. */
  onBusyChange?: (busy: boolean) => void;
  selectionMode?: "single" | "multiple";
  /**
   * The workspace the host already knows the file belongs in (the data grid's attachment cell: the
   * TABLE's organization). Declared, the upload choke point files it there without asking.
   */
  organizationId?: string | null;
  /**
   * What the chooser and a drop accept (an `<input accept>` string, e.g.
   * "image/*"). A dropped file outside it is refused out loud, never uploaded.
   * Omitted = anything.
   */
  accept?: string;
  /**
   * Also take an image LINK (the Source input's Image tile): the image is
   * fetched into a File and goes through the same upload as a chosen one.
   */
  imageLinks?: boolean;
  /**
   * The host shows what it received (the Source input's cards): once
   * `onSelect` has taken a batch, its uploaded rows leave this area — a
   * removed Source never lingers here as an upload (verify-4 V4-F #3).
   * Failed rows stay with their retry.
   */
  clearHandedOver?: boolean;
}

/** The drop line names what this area takes. */
function dropLabel(accept: string | undefined): string {
  if (accept === "image/*") return "Drop images";
  if (accept?.startsWith("audio/")) return "Drop recordings";
  return "Drop files or folders";
}

function classifyUploadType(mimeType: string): string {
  if (!mimeType) return "unknown";
  const t = mimeType.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("text/") || t === "application/json") return "text";
  if (t === "application/pdf") return "pdf";
  return "other";
}

export function canonicalImportToUploadedFile(
  imported: CanonicalStorageImport,
): UploadedFile {
  const { file } = imported;
  const mimeType = file.mimeType ?? "";
  const size = file.fileSize ?? 0;
  const url = file.url ?? file.publicUrl ?? pythonFileInlineUrl(file.id);
  const details = getFileDetailsByUrl(
    url,
    {
      eTag: file.checksum ?? "",
      size,
      mimetype: mimeType,
      cacheControl: "max-age=3600",
      lastModified: file.updatedAt,
      contentLength: size,
      httpStatusCode: 200,
    },
    file.id,
  );
  return {
    name: file.fileName,
    fileId: file.id,
    url,
    type: classifyUploadType(mimeType),
    mime_type: file.mimeType ?? undefined,
    details: { ...details, filename: file.fileName },
  };
}

export function canonicalImportsToUploadedFiles(
  imports: CanonicalStorageImport[],
): UploadedFile[] {
  return [...new Map(imports.map((item) => [item.fileId, item])).values()].map(
    canonicalImportToUploadedFile,
  );
}

interface FileStatus {
  file: File;
  relativePath: string;
  status: "pending" | "compressing" | "uploading" | "done" | "error";
  errorMessage?: string;
  compressionNote?: string;
}

async function compressImageFile(
  file: File,
): Promise<{ file: File; note: string } | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1920;
        let { width, height } = img;
        if (width > MAX_DIM) {
          height = (height * MAX_DIM) / width;
          width = MAX_DIM;
        }
        if (height > MAX_DIM) {
          width = (width * MAX_DIM) / height;
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            const compressed = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              { type: "image/jpeg" },
            );
            resolve({
              file: compressed,
              note: `Compressed from ${formatFileSize(file.size)} → ${formatFileSize(compressed.size)}`,
            });
          },
          "image/jpeg",
          0.82,
        );
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function compressPdfFile(
  file: File,
  maxSizeMB = 50,
): Promise<{ file: File; note: string } | null> {
  try {
    // Calls Python /assets/pdf-compress/multipart directly (no Next.js
    // hop). Level 2 = light cleanup; the server escalates tiers as
    // needed to fit under maxSizeMB.
    const { data } = await compressPdfMultipart(file, {
      level: 2,
      maxSizeBytes: maxSizeMB * 1024 * 1024,
    });
    const blob = await materializeAssetResult(data);
    const compressed = new File([blob], file.name, {
      type: "application/pdf",
    });
    return {
      file: compressed,
      note: `Compressed from ${formatFileSize(file.size)} → ${formatFileSize(compressed.size)}`,
    };
  } catch {
    return null;
  }
}

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB — warn user, attempt compression

interface UploadCandidate {
  file: File;
  /** Path relative to the chosen/dropped root, including the filename. */
  relativePath: string;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  file: (
    success: (file: File) => void,
    failure?: (error: DOMException) => void,
  ) => void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  createReader: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
}

function candidateFromFile(file: File): UploadCandidate {
  return {
    file,
    relativePath: file.webkitRelativePath || file.name,
  };
}

async function readDirectoryEntries(
  directory: FileSystemDirectoryEntryLike,
): Promise<FileSystemEntryLike[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntryLike[] = [];
  // Chromium returns directory entries in batches; an empty batch is EOF.
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function collectEntryFiles(
  entry: FileSystemEntryLike,
  parentPath = "",
): Promise<UploadCandidate[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntryLike).file(resolve, reject),
    );
    return [{ file, relativePath: `${parentPath}${file.name}` }];
  }
  if (!entry.isDirectory) return [];

  const directory = entry as FileSystemDirectoryEntryLike;
  const childPath = `${parentPath}${directory.name}/`;
  const children = await readDirectoryEntries(directory);
  const nested = await Promise.all(
    children.map((child) => collectEntryFiles(child, childPath)),
  );
  return nested.flat();
}

async function collectDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<UploadCandidate[]> {
  const collected: UploadCandidate[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    const entry = (
      item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntryLike | null;
      }
    ).webkitGetAsEntry?.();
    if (entry) {
      collected.push(...(await collectEntryFiles(entry)));
      continue;
    }
    const file = item.getAsFile();
    if (file) collected.push(candidateFromFile(file));
  }
  return collected.length > 0
    ? collected
    : Array.from(dataTransfer.files, candidateFromFile);
}

function uploadDirectory(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash > 0 ? relativePath.slice(0, lastSlash) : "";
}

/**
 * Upload one candidate through the canonical upload hook and build its
 * `UploadedFile`. Throws what the upload throws. Outside the component so the
 * React Compiler can compile it (a try block with value blocks makes it skip).
 */
async function uploadCandidate(
  upload: UseFileUploadResult["upload"],
  candidate: UploadCandidate,
  organizationId: string | null,
): Promise<UploadedFile> {
  const file = candidate.file;
  const relativeDirectory = uploadDirectory(candidate.relativePath);
  const folderPath = composeUploadFolderPath(
    "userContent",
    relativeDirectory
      ? `prompt-attachments/${relativeDirectory}`
      : "prompt-attachments",
  );
  // No `metadata.scope.organization_id` is passed here on purpose:
  // `cloudUpload` resolves the owning workspace for EVERY upload path
  // (`bindUploadOrganization`), asking the person when nothing is
  // selected. This component sending nothing at all is precisely the
  // 2026-08-30 bug — the server then filed the attachment in the
  // uploader's own organization, which promptly disagreed with the
  // organization they picked for the conversation a minute later. The
  // fix belongs at the one upload choke point, not in each door. A host that KNOWS the
  // workspace (the data grid's attachment cell: the table's organization) declares it,
  // and the choke point honours a declared organization.
  const normalized = await upload(
    { kind: "file", file },
    {
      // The handler's own owner option — it wins over the ambient active organization
      // (a `metadata.scope` value was overwritten by the active one: review-2 lane F live).
      ...(organizationId ? { organizationId } : {}),
      folderPath,
      visibility: "personal",
      createShareLink: true,
      shareLinkPermissionLevel: "viewer",
    },
  );
  const url = normalized.url ?? "";
  const resolvedDetails = getFileDetailsByUrl(
    url,
    {
      eTag: "",
      size: file.size,
      mimetype: file.type,
      cacheControl: "max-age=3600",
      lastModified: new Date(file.lastModified).toISOString(),
      contentLength: file.size,
    } as never,
    normalized.fileId,
  );
  return {
    name: file.name,
    fileId: normalized.fileId,
    url,
    type: classifyUploadType(file.type),
    mime_type: normalized.meta.mime ?? file.type,
    // Opaque durable URLs often end in a checksum/storage key. The
    // user-selected File name is the display identity and must survive
    // into the composer and submitted message metadata.
    details: { ...resolvedDetails, filename: file.name },
  };
}

function uploadErrorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : "Upload failed. The file may be too large or the server rejected it.";
}

/**
 * The tiles `FileAcquisitionActions` renders inline, drawn as ordinary
 * buttons (Arman, 2026-10-03: "just make them normal"): two by two, icon
 * beside a text-sm label, 36px tall (child selectors out-rank the tiles' own
 * single-class utilities).
 */
const ACQUISITION_TILES_CLASS =
  "gap-1.5 sm:grid-cols-2 [&>button]:h-9 [&>button]:min-h-0 [&>button]:flex-row [&>button]:justify-start [&>button]:gap-2 [&>button]:rounded-lg [&>button]:bg-background [&>button]:px-3 [&>button]:py-0 [&>button]:text-sm [&>button]:font-normal pointer-coarse:[&>button]:h-11";

export function InlineUploadArea({
  onSelect,
  onBusyChange,
  selectionMode = "multiple",
  organizationId = null,
  accept,
  imageLinks = false,
  clearHandedOver = false,
}: InlineUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [link, setLink] = useState("");
  const [fetchingLink, setFetchingLink] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { upload, uploading: isLoading, error: hookErrorObj } = useFileUpload();
  const hookError = hookErrorObj?.message ?? null;

  const isProcessing =
    isFinalizing ||
    fileStatuses.some(
      (f) => f.status === "compressing" || f.status === "uploading",
    );

  const setBusy = (busy: boolean) => onBusyChange?.(busy);

  /** Hand a batch to the host; upload + durable wiring is one busy interval. */
  const handOver = (files: UploadedFile[]): Promise<void> => {
    setIsFinalizing(true);
    setBusy(true);
    // Association/chat hosts must finish their edges before the user can
    // reset or start a second batch.
    return Promise.resolve()
      .then(() => onSelect(files))
      .finally(() => {
        setIsFinalizing(false);
        setBusy(false);
      });
  };

  const handleFiles = async (candidates: UploadCandidate[]) => {
    if (candidates.length === 0) return;

    setBusy(true);
    setUploadError(null);
    const initialStatuses: FileStatus[] = candidates.map(
      ({ file, relativePath }) => ({
        file,
        relativePath,
        status: "pending",
      }),
    );
    setFileStatuses(initialStatuses);

    const filesToUpload: UploadCandidate[] = [];
    const updatedStatuses = [...initialStatuses];

    // Pre-process: compress large images and PDFs.
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const file = candidate.file;
      const compressible =
        file.size > LARGE_FILE_THRESHOLD &&
        (file.type.startsWith("image/") || file.type === "application/pdf");
      if (!compressible) {
        updatedStatuses[i] = { ...updatedStatuses[i], status: "uploading" };
        filesToUpload.push(candidate);
        continue;
      }

      updatedStatuses[i] = { ...updatedStatuses[i], status: "compressing" };
      setFileStatuses([...updatedStatuses]);

      const result = file.type.startsWith("image/")
        ? await compressImageFile(file)
        : await compressPdfFile(file);

      if (result) {
        const directory = uploadDirectory(candidate.relativePath);
        const relativePath = directory
          ? `${directory}/${result.file.name}`
          : result.file.name;
        updatedStatuses[i] = {
          ...updatedStatuses[i],
          file: result.file,
          relativePath,
          status: "uploading",
          compressionNote: result.note,
        };
        filesToUpload.push({ file: result.file, relativePath });
      } else {
        // Compression failed — upload original and warn
        updatedStatuses[i] = {
          ...updatedStatuses[i],
          status: "uploading",
          compressionNote: `Could not compress — uploading original (${formatFileSize(file.size)})`,
        };
        filesToUpload.push(candidate);
      }
    }

    setFileStatuses([...updatedStatuses]);

    const results: UploadedFile[] = [];
    let firstError: string | null = null;
    for (const candidate of filesToUpload) {
      const statusIdx = updatedStatuses.findIndex(
        (s) =>
          s.relativePath === candidate.relativePath && s.status === "uploading",
      );
      const outcome = await uploadCandidate(
        upload,
        candidate,
        organizationId,
      ).then(
        (uploaded) => ({ uploaded, error: null }),
        (error: unknown) => ({ uploaded: null, error }),
      );
      if (outcome.uploaded) {
        results.push(outcome.uploaded);
        if (statusIdx >= 0) {
          updatedStatuses[statusIdx] = {
            ...updatedStatuses[statusIdx],
            status: "done",
          };
        }
      } else {
        // Declining the workspace question stops the whole batch quietly:
        // nothing uploaded, no error surface, the picker exactly as it was.
        if (isUploadCancelledError(outcome.error)) {
          setFileStatuses([]);
          setBusy(false);
          return;
        }
        const errMsg = uploadErrorMessage(outcome.error);
        if (!firstError) firstError = errMsg;
        if (statusIdx >= 0) {
          updatedStatuses[statusIdx] = {
            ...updatedStatuses[statusIdx],
            status: "error",
            errorMessage: errMsg,
          };
        }
      }
      setFileStatuses([...updatedStatuses]);
    }

    if (firstError) setUploadError(firstError);
    if (results.length === 0) {
      setBusy(false);
      return;
    }
    await handOver(results);
    if (clearHandedOver) {
      setFileStatuses((prev) => prev.filter((f) => f.status !== "done"));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    void collectDroppedFiles(e.dataTransfer)
      .then((dropped) => {
        if (!accept) return handleFiles(dropped);
        const refused = dropped.filter(
          ({ file }) =>
            !matchStorageAccept(file.name, file.type, accept).accepted,
        );
        if (refused.length) {
          setUploadError(
            `${refused.map(({ file }) => file.name).join(", ")} ${refused.length === 1 ? "is" : "are"} not a kind this takes, so ${refused.length === 1 ? "it was" : "they were"} not uploaded.`,
          );
        }
        return handleFiles(dropped.filter((c) => !refused.includes(c)));
      })
      .catch((error: unknown) => {
        console.error("[InlineUploadArea] failed to read dropped files", error);
        setUploadError(
          error instanceof Error
            ? error.message
            : "Could not read that folder.",
        );
      });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const clearAndReset = () => {
    setFileStatuses([]);
    setUploadError(null);
    setIsFinalizing(false);
    setBusy(false);
  };

  const addImageLink = () => {
    if (!link.trim() || fetchingLink) return;
    setUploadError(null);
    setFetchingLink(true);
    void imageLinkToFile(link)
      .then((file) => {
        setLink("");
        return handleFiles([candidateFromFile(file)]);
      })
      .catch((err: unknown) => {
        setUploadError(
          err instanceof ImageLinkError || err instanceof Error
            ? err.message
            : "That image could not be added.",
        );
      })
      .finally(() => setFetchingLink(false));
  };

  const hasErrors = fileStatuses.some((f) => f.status === "error");
  const displayError = uploadError || hookError;

  if (fileStatuses.length > 0) {
    return (
      <div className="shrink-0 space-y-1">
        {/* Progress rows — capped and scrollable. */}
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {fileStatuses.map((fs, i) => (
            <div
              key={i}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-lg border px-2 py-1 text-sm",
                fs.status === "error"
                  ? "border-destructive/20 bg-destructive/10"
                  : fs.status === "done"
                    ? "border-emerald-500/20 bg-emerald-500/10"
                    : "border-border bg-muted",
              )}
            >
              <span className="shrink-0">
                {fs.status === "compressing" && (
                  <Minimize2 className="h-4 w-4 animate-pulse text-primary" />
                )}
                {fs.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {fs.status === "done" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                )}
                {fs.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                {fs.status === "pending" && (
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-foreground"
                title={fs.file.name}
              >
                {fs.file.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fs.status === "compressing"
                  ? "Compressing…"
                  : fs.status === "uploading"
                    ? "Uploading…"
                    : formatFileSize(fs.file.size)}
              </span>
            </div>
          ))}
        </div>

        {displayError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{displayError}</span>
            <button
              type="button"
              onClick={clearAndReset}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11"
              aria-label="Dismiss upload error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <ErrorAlchemyMenu error={displayError} />
          </div>
        )}

        {!isProcessing && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-lg text-sm pointer-coarse:h-11"
            onClick={clearAndReset}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {hasErrors ? "Try again" : "Upload more"}
          </Button>
        )}
      </div>
    );
  }

  /* Idle: one compact drop strip — the source tiles are the drop target. */
  return (
    <div className="shrink-0 space-y-1.5">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        title={dropLabel(accept)}
        className={cn(
          "rounded-lg border border-dashed p-1.5 transition-colors",
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-border hover:border-muted-foreground/40",
        )}
      >
        {isDragging ? (
          <span className="flex min-h-11 items-center justify-center gap-2 text-sm">
            <Upload className="h-4 w-4 shrink-0" />
            Drop to upload and add
          </span>
        ) : (
          <FileAcquisitionActions
            presentation="inline"
            className={ACQUISITION_TILES_CLASS}
            disabled={isLoading}
            onFiles={(files) => handleFiles(files.map(candidateFromFile))}
            multiple={selectionMode === "multiple"}
            accept={accept}
            storageImportFolderPath={composeUploadFolderPath(
              "userContent",
              "prompt-attachments",
            )}
            onStorageImported={(files) =>
              handOver(canonicalImportsToUploadedFiles(files))
            }
            onError={setUploadError}
          />
        )}
      </div>
      {imageLinks ? (
        <form
          className="flex w-full items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addImageLink();
          }}
        >
          <Input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Or paste an image link"
            aria-label="Image link"
            disabled={fetchingLink}
            className="h-9 min-w-0 flex-1 rounded-lg text-base sm:text-sm pointer-coarse:h-11"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 rounded-lg text-sm pointer-coarse:h-11"
            disabled={!link.trim() || fetchingLink}
          >
            {fetchingLink ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
        </form>
      ) : null}
      {displayError ? (
        <p
          role="alert"
          className="flex w-full items-start gap-1.5 px-1 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{displayError}</span>
          <ErrorAlchemyMenu error={displayError} />
        </p>
      ) : null}
    </div>
  );
}
