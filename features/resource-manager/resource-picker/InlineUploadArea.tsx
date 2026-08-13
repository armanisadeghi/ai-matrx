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

import React, { useCallback, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    File as FileIcon,
    FolderUp,
    Loader2,
    Minimize2,
    Upload,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { composeUploadFolderPath } from "@/features/files/handler/utils/upload-folder-path";
import {
    compressPdfMultipart,
    materializeAssetResult,
} from "@/features/files/api/assets";
import {
    getFileDetailsByUrl,
    EnhancedFileDetails,
} from "@/utils/file-operations/constants";

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
    details?: EnhancedFileDetails;
}

interface InlineUploadAreaProps {
    /**
     * Fired once per batch with every file that uploaded successfully.
     * Failed files stay visible in the progress list with a retry.
     */
    onSelect: (files: UploadedFile[]) => void | Promise<void>;
    /** Lets the host disable navigation while uploads are in flight. */
    onBusyChange?: (busy: boolean) => void;
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

interface FileStatus {
    file: File;
    relativePath: string;
    status: "pending" | "compressing" | "uploading" | "done" | "error";
    errorMessage?: string;
    compressionNote?: string;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
                            note: `Compressed from ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
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
            note: `Compressed from ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
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
        const batch = await new Promise<FileSystemEntryLike[]>(
            (resolve, reject) => reader.readEntries(resolve, reject),
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

export function InlineUploadArea({
    onSelect,
    onBusyChange,
}: InlineUploadAreaProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

    const {
        upload,
        uploading: isLoading,
        error: hookErrorObj,
    } = useFileUpload();
    const hookError = hookErrorObj?.message ?? null;

    const isProcessing =
        isFinalizing ||
        fileStatuses.some(
            (f) => f.status === "compressing" || f.status === "uploading",
        );

    const setBusy = useCallback(
        (busy: boolean) => onBusyChange?.(busy),
        [onBusyChange],
    );

    const handleFiles = useCallback(
        async (candidates: UploadCandidate[]) => {
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

            // Pre-process: compress large files
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                const file = candidate.file;
                if (file.size > LARGE_FILE_THRESHOLD) {
                    const isImage = file.type.startsWith("image/");
                    const isPdf = file.type === "application/pdf";

                    if (isImage || isPdf) {
                        updatedStatuses[i] = {
                            ...updatedStatuses[i],
                            status: "compressing",
                        };
                        setFileStatuses([...updatedStatuses]);

                        const result = isImage
                            ? await compressImageFile(file)
                            : await compressPdfFile(file);

                        if (result) {
                            updatedStatuses[i] = {
                                ...updatedStatuses[i],
                                file: result.file,
                                relativePath: `${uploadDirectory(candidate.relativePath)}${uploadDirectory(candidate.relativePath) ? "/" : ""}${result.file.name}`,
                                status: "uploading",
                                compressionNote: result.note,
                            };
                            filesToUpload.push({
                                file: result.file,
                                relativePath: updatedStatuses[i].relativePath,
                            });
                        } else {
                            // Compression failed — upload original and warn
                            updatedStatuses[i] = {
                                ...updatedStatuses[i],
                                status: "uploading",
                                compressionNote: `Could not compress — uploading original (${formatBytes(file.size)})`,
                            };
                            filesToUpload.push(candidate);
                        }
                    } else {
                        updatedStatuses[i] = {
                            ...updatedStatuses[i],
                            status: "uploading",
                        };
                        filesToUpload.push(candidate);
                    }
                } else {
                    updatedStatuses[i] = {
                        ...updatedStatuses[i],
                        status: "uploading",
                    };
                    filesToUpload.push(candidate);
                }
            }

            setFileStatuses([...updatedStatuses]);

            const results: UploadedFile[] = [];
            let firstError: string | null = null;
            for (const candidate of filesToUpload) {
                const file = candidate.file;
                const statusIdx = updatedStatuses.findIndex(
                    (s) =>
                        s.relativePath === candidate.relativePath &&
                        s.status === "uploading",
                );
                try {
                    const relativeDirectory = uploadDirectory(
                        candidate.relativePath,
                    );
                    const folderPath = composeUploadFolderPath(
                        "userContent",
                        relativeDirectory
                            ? `prompt-attachments/${relativeDirectory}`
                            : "prompt-attachments",
                    );
                    const normalized = await upload(
                        { kind: "file", file },
                        {
                            folderPath,
                            visibility: "personal",
                            createShareLink: true,
                            shareLinkPermissionLevel: "viewer",
                        },
                    );
                    const url = normalized.url ?? "";
                    results.push({
                        name: file.name,
                        fileId: normalized.fileId,
                        url,
                        type: classifyUploadType(file.type),
                        mime_type: normalized.meta.mime ?? file.type,
                        details: getFileDetailsByUrl(
                            url,
                            {
                                eTag: "",
                                size: file.size,
                                mimetype: file.type,
                                cacheControl: "max-age=3600",
                                lastModified: new Date(
                                    file.lastModified,
                                ).toISOString(),
                                contentLength: file.size,
                            } as never,
                            normalized.fileId,
                        ),
                    });
                    if (statusIdx >= 0) {
                        updatedStatuses[statusIdx] = {
                            ...updatedStatuses[statusIdx],
                            status: "done",
                        };
                    }
                } catch (err) {
                    const errMsg =
                        err instanceof Error
                            ? err.message
                            : "Upload failed. The file may be too large or the server rejected it.";
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
            try {
                if (results.length > 0) {
                    setIsFinalizing(true);
                    await onSelect(results);
                }
            } finally {
                // Upload + host-side durable wiring is one busy interval.
                // Association/chat hosts must finish their edges before the
                // user can reset or start a second batch.
                setIsFinalizing(false);
                setBusy(false);
            }
        },
        [upload, onSelect, setBusy],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            void collectDroppedFiles(e.dataTransfer)
                .then(handleFiles)
                .catch((error: unknown) => {
                    console.error(
                        "[InlineUploadArea] failed to read dropped files",
                        error,
                    );
                    setUploadError(
                        error instanceof Error
                            ? error.message
                            : "Could not read that folder.",
                    );
                });
        },
        [handleFiles],
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleFileInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            void handleFiles(
                Array.from(e.target.files || [], candidateFromFile),
            );
            if (fileInputRef.current) fileInputRef.current.value = "";
        },
        [handleFiles],
    );

    const handleFolderInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            void handleFiles(
                Array.from(e.target.files || [], candidateFromFile),
            );
            if (folderInputRef.current) folderInputRef.current.value = "";
        },
        [handleFiles],
    );

    const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);
    const openFolderPicker = useCallback(
        () => folderInputRef.current?.click(),
        [],
    );

    const clearAndReset = useCallback(() => {
        setFileStatuses([]);
        setUploadError(null);
        setIsFinalizing(false);
        setBusy(false);
    }, [setBusy]);

    const hasErrors = fileStatuses.some((f) => f.status === "error");
    const displayError = uploadError || hookError;

    return (
        <div className="shrink-0 border-b border-border px-2 py-1.5">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                onChange={handleFileInputChange}
                className="hidden"
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                onChange={handleFolderInputChange}
                className="hidden"
                // React's DOM types do not expose the browser-standard folder
                // picker attributes yet; Chromium/Safari preserve paths in
                // File.webkitRelativePath.
                {...({ webkitdirectory: "", directory: "" } as Record<
                    string,
                    string
                >)}
            />

            {fileStatuses.length === 0 ? (
                /* Idle: one dense drop strip. */
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                        "flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed px-2 text-xs transition-colors",
                        isDragging
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                    )}
                >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    {isDragging ? (
                        <span>Drop to upload and add</span>
                    ) : (
                        <>
                            <span className="hidden sm:inline">
                                Drop files or folders here, or
                            </span>
                            <button
                                type="button"
                                onClick={openFilePicker}
                                disabled={isLoading}
                                className="font-medium text-primary hover:underline disabled:opacity-50"
                            >
                                browse files
                            </button>
                            <span aria-hidden="true">/</span>
                            <button
                                type="button"
                                onClick={openFolderPicker}
                                disabled={isLoading}
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
                            >
                                <FolderUp className="h-3 w-3" />
                                folder
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-1">
                    {/* Compact progress rows — capped and scrollable. */}
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                        {fileStatuses.map((fs, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px]",
                                    fs.status === "error"
                                        ? "border-destructive/20 bg-destructive/10"
                                        : fs.status === "done"
                                          ? "border-emerald-500/20 bg-emerald-500/10"
                                          : "border-border bg-muted",
                                )}
                            >
                                <span className="shrink-0">
                                    {fs.status === "compressing" && (
                                        <Minimize2 className="h-3 w-3 animate-pulse text-blue-500" />
                                    )}
                                    {fs.status === "uploading" && (
                                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                    )}
                                    {fs.status === "done" && (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                    )}
                                    {fs.status === "error" && (
                                        <AlertCircle className="h-3 w-3 text-destructive" />
                                    )}
                                    {fs.status === "pending" && (
                                        <FileIcon className="h-3 w-3 text-muted-foreground" />
                                    )}
                                </span>
                                <span
                                    className="min-w-0 flex-1 truncate text-foreground"
                                    title={fs.file.name}
                                >
                                    {fs.file.name}
                                </span>
                                <span className="shrink-0 text-muted-foreground">
                                    {fs.status === "compressing"
                                        ? "Compressing…"
                                        : fs.status === "uploading"
                                          ? "Uploading…"
                                          : formatBytes(fs.file.size)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {displayError && (
                        <div className="flex items-start gap-1.5 rounded border border-destructive/20 bg-destructive/10 px-1.5 py-1 text-[11px] text-destructive">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="min-w-0 flex-1">
                                {displayError}
                            </span>
                            <button
                                type="button"
                                onClick={clearAndReset}
                                className="shrink-0 opacity-60 hover:opacity-100"
                                aria-label="Dismiss upload error"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}

                    {!isProcessing && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full text-xs"
                            onClick={clearAndReset}
                        >
                            <Upload className="mr-1.5 h-3 w-3" />
                            {hasErrors ? "Try Again" : "Upload More Files"}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
