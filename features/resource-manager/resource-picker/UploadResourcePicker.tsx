"use client";

import React, { useState, useCallback } from "react";
import { ChevronLeft, Upload, Image as ImageIcon, File as FileIcon2, Loader2, AlertCircle, CheckCircle2, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileUpload, composeLegacyFolderPath } from "@/features/files";
import { compressPdfMultipart, materializeAssetResult } from "@/features/files/api/assets";
import { getFileDetailsByUrl, EnhancedFileDetails } from "@/utils/file-operations/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UploadedFile {
    /**
     * cld_files UUID. When present, downstream code building outbound AI
     * API payloads should construct a `MediaRef` from this id (via
     * `fileIdToMediaRef`) rather than the share URL.
     */
    fileId?: string;
    url: string;
    /**
     * **FE classification token** — one of `"image" | "video" | "audio"
     * | "document" | "text" | "pdf" | "other" | "unknown"` from
     * `classifyFileType()`. This is NOT a MIME type; do not send it to
     * the backend as `mime_type`. Use `mime_type` below for the real
     * RFC MIME (`"image/jpeg"`, `"audio/mp3"`, etc.).
     */
    type: string;
    /** Real RFC MIME type from the source File / upload result. */
    mime_type?: string;
    details?: EnhancedFileDetails;
}

interface UploadResourcePickerProps {
    onBack: () => void;
    onSelect: (files: UploadedFile[]) => void;
}

function classifyForLegacy(mimeType: string): string {
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

async function compressImageFile(file: File): Promise<{ file: File; note: string } | null> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const MAX_DIM = 1920;
                let { width, height } = img;
                if (width > MAX_DIM) { height = (height * MAX_DIM) / width; width = MAX_DIM; }
                if (height > MAX_DIM) { width = (width * MAX_DIM) / height; height = MAX_DIM; }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) { resolve(null); return; }
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) { resolve(null); return; }
                        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
                        resolve({
                            file: compressed,
                            note: `Compressed from ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
                        });
                    },
                    "image/jpeg",
                    0.82
                );
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

async function compressPdfFile(file: File, maxSizeMB = 50): Promise<{ file: File; note: string } | null> {
    try {
        // Calls Python /assets/pdf-compress/multipart directly (no Next.js
        // hop). Level 2 = light cleanup; the server escalates tiers as
        // needed to fit under maxSizeMB.
        const { data } = await compressPdfMultipart(file, {
            level: 2,
            maxSizeBytes: maxSizeMB * 1024 * 1024,
        });
        const blob = await materializeAssetResult(data);
        const compressed = new File([blob], file.name, { type: "application/pdf" });
        return {
            file: compressed,
            note: `Compressed from ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
        };
    } catch {
        return null;
    }
}

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB — warn user, attempt compression

export function UploadResourcePicker({ onBack, onSelect }: UploadResourcePickerProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const { upload, uploading: isLoading, error: hookErrorObj } = useFileUpload();
    const hookError = hookErrorObj?.message ?? null;

    const isProcessing = fileStatuses.some((f) => f.status === "compressing" || f.status === "uploading");

    const handleFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;

        setUploadError(null);
        const initialStatuses: FileStatus[] = files.map((f) => ({ file: f, status: "pending" }));
        setFileStatuses(initialStatuses);

        const filesToUpload: File[] = [];
        const updatedStatuses = [...initialStatuses];

        // Pre-process: compress large files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > LARGE_FILE_THRESHOLD) {
                const isImage = file.type.startsWith("image/");
                const isPdf = file.type === "application/pdf";

                if (isImage || isPdf) {
                    updatedStatuses[i] = { ...updatedStatuses[i], status: "compressing" };
                    setFileStatuses([...updatedStatuses]);

                    const result = isImage
                        ? await compressImageFile(file)
                        : await compressPdfFile(file);

                    if (result) {
                        updatedStatuses[i] = {
                            ...updatedStatuses[i],
                            file: result.file,
                            status: "uploading",
                            compressionNote: result.note,
                        };
                        filesToUpload.push(result.file);
                    } else {
                        // Compression failed — upload original and warn
                        updatedStatuses[i] = {
                            ...updatedStatuses[i],
                            status: "uploading",
                            compressionNote: `Could not compress — uploading original (${formatBytes(file.size)})`,
                        };
                        filesToUpload.push(file);
                    }
                } else {
                    updatedStatuses[i] = { ...updatedStatuses[i], status: "uploading" };
                    filesToUpload.push(file);
                }
            } else {
                updatedStatuses[i] = { ...updatedStatuses[i], status: "uploading" };
                filesToUpload.push(file);
            }
        }

        setFileStatuses([...updatedStatuses]);

        const results: UploadedFile[] = [];
        let firstError: string | null = null;
        const folderPath = composeLegacyFolderPath(
            "userContent",
            "prompt-attachments",
        );

        for (const file of filesToUpload) {
            const statusIdx = updatedStatuses.findIndex(
                (s) => s.file === file && s.status === "uploading",
            );
            try {
                const normalized = await upload(
                    { kind: "file", file },
                    {
                        folderPath,
                        visibility: "private",
                        createShareLink: true,
                        shareLinkPermissionLevel: "read",
                    },
                );
                const url = normalized.url ?? "";
                results.push({
                    fileId: normalized.fileId,
                    url,
                    type: classifyForLegacy(file.type),
                    mime_type: normalized.meta.mime ?? file.type,
                    details: getFileDetailsByUrl(
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
        if (results.length > 0) onSelect(results);
    }, [upload, onSelect]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFiles(Array.from(e.dataTransfer.files));
    }, [handleFiles]);

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

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(Array.from(e.target.files || []));
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [handleFiles]);

    const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

    const clearAndReset = useCallback(() => {
        setFileStatuses([]);
        setUploadError(null);
    }, []);

    const hasErrors = fileStatuses.some((f) => f.status === "error");
    const displayError = uploadError || hookError;

    return (
        <div className="flex flex-col max-h-[min(460px,70dvh)]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={onBack}
                    disabled={isProcessing}
                >
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <Upload className="w-4 h-4 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
                    Upload Files
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-3">
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                />

                {/* Error Alert */}
                {displayError && (
                    <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-xs font-semibold">Upload Failed</AlertTitle>
                        <AlertDescription className="text-xs">
                            {displayError}
                            <div className="mt-1 text-xs opacity-80">
                                Large PDFs and images are automatically compressed before upload. If the file is still too large,
                                try splitting it into smaller parts or reducing the resolution.
                            </div>
                        </AlertDescription>
                        <button onClick={clearAndReset} className="absolute top-2 right-2 text-current opacity-60 hover:opacity-100">
                            <X className="h-3 w-3" />
                        </button>
                    </Alert>
                )}

                {/* File progress list */}
                {fileStatuses.length > 0 && (
                    <div className="space-y-1.5">
                        {fileStatuses.map((fs, i) => (
                            <div
                                key={i}
                                className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-xs border ${
                                    fs.status === "error"
                                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                                        : fs.status === "done"
                                        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                        : "bg-muted border-border"
                                }`}
                            >
                                <div className="flex-shrink-0 mt-0.5">
                                    {fs.status === "compressing" && <Minimize2 className="w-3.5 h-3.5 text-blue-500 animate-pulse" />}
                                    {fs.status === "uploading" && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                                    {fs.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                                    {fs.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
                                    {fs.status === "pending" && <FileIcon2 className="w-3.5 h-3.5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium truncate text-foreground">{fs.file.name}</span>
                                        <span className="text-muted-foreground flex-shrink-0">{formatBytes(fs.file.size)}</span>
                                    </div>
                                    {fs.status === "compressing" && (
                                        <div className="text-blue-600 dark:text-blue-400 mt-0.5">Compressing…</div>
                                    )}
                                    {fs.status === "uploading" && (
                                        <div className="text-blue-600 dark:text-blue-400 mt-0.5">Uploading…</div>
                                    )}
                                    {fs.compressionNote && fs.status !== "compressing" && (
                                        <div className="text-muted-foreground mt-0.5">{fs.compressionNote}</div>
                                    )}
                                    {fs.status === "error" && fs.errorMessage && (
                                        <div className="text-red-700 dark:text-red-400 mt-0.5">{fs.errorMessage}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {hasErrors && (
                            <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={clearAndReset}>
                                Try Again
                            </Button>
                        )}
                    </div>
                )}

                {/* Drop zone — only show when no active uploads */}
                {fileStatuses.length === 0 && (
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 transition-colors ${
                            isDragging
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                                : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
                        }`}
                    >
                        <div className="flex gap-4 mb-4">
                            <ImageIcon className="w-8 h-8 text-gray-400" />
                            <FileIcon2 className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Drop files here
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                            or click the button below to browse
                        </p>
                        <Button onClick={openFilePicker} className="h-8" disabled={isProcessing || isLoading}>
                            <Upload className="w-4 h-4 mr-2" />
                            Choose Files
                        </Button>
                    </div>
                )}

                {/* Upload another batch after completion */}
                {fileStatuses.length > 0 && !isProcessing && !hasErrors && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearAndReset}>
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Upload More Files
                    </Button>
                )}

                {/* Info */}
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-md flex-shrink-0">
                    <h4 className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Supported Files
                    </h4>
                    <ul className="text-[10px] text-blue-600 dark:text-blue-300 space-y-0.5">
                        <li>• Images: JPG, PNG, GIF, WebP, SVG</li>
                        <li>• Documents: PDF, DOC, DOCX, TXT, MD</li>
                        <li>• Media: MP3, MP4, WAV</li>
                        <li>• Data: CSV, JSON, XML</li>
                        <li>• Archives: ZIP, RAR</li>
                        <li className="text-blue-500 dark:text-blue-400">• Large PDFs and images are automatically compressed</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
