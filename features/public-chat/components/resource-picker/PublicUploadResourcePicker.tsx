"use client";

import React, { useState, useCallback, useRef } from "react";
import { ChevronLeft, Upload, Image as ImageIcon, File as FileIcon2, Loader2, AlertCircle, CheckCircle2, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import type { NormalizedFile } from "@/features/files/handler/types";
import { compressPdfMultipart, materializeAssetResult } from "@/features/files/api/assets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PublicResource, PublicResourceType } from "../../types/content";

interface PublicUploadResourcePickerProps {
    onBack: () => void;
    onSelect: (resources: PublicResource[]) => void;
}

interface FileStatus {
    originalFile: File;
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
                        const compressed = new globalThis.File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
                        resolve({
                            file: compressed,
                            note: `Compressed: ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
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

async function compressPdfFile(file: globalThis.File, maxSizeMB = 50): Promise<{ file: globalThis.File; note: string } | null> {
    try {
        // Calls Python /assets/pdf-compress/multipart directly (no Next.js
        // hop). Level 2 = light cleanup; the server escalates tiers as
        // needed to fit under maxSizeMB.
        const { data } = await compressPdfMultipart(file, {
            level: 2,
            maxSizeBytes: maxSizeMB * 1024 * 1024,
        });
        const blob = await materializeAssetResult(data);
        const compressed = new globalThis.File([blob], file.name, { type: "application/pdf" });
        return {
            file: compressed,
            note: `Compressed: ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`,
        };
    } catch {
        return null;
    }
}

// Hard 50 MB ceiling matches the cloud-files free tier; auto-compress images/PDFs above 10 MB
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const COMPRESS_THRESHOLD = 10 * 1024 * 1024;

export function PublicUploadResourcePicker({ onBack, onSelect }: PublicUploadResourcePickerProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { upload, uploading, error: hookError, reset } = useFileUpload();

    const clearError = useCallback(() => reset(), [reset]);

    const isProcessing = fileStatuses.some((f) => f.status === "compressing" || f.status === "uploading");

    const normalizedToResource = useCallback((normalized: NormalizedFile, originalName: string, originalSize: number): PublicResource => {
        const mimeType = normalized.meta.mime ?? "";
        let resourceType: PublicResourceType = "file";
        if (mimeType.startsWith("image/")) resourceType = "image_link";
        else if (mimeType.startsWith("audio/")) resourceType = "audio";

        const url = normalized.url ?? (normalized.fileId ? `cld_files:${normalized.fileId}` : "");
        return {
            type: resourceType,
            data: {
                url,
                filename: normalized.meta.fileName ?? originalName,
                mime_type: mimeType,
                size: normalized.meta.sizeBytes ?? originalSize,
                type: mimeType,
            },
        };
    }, []);

    const handleFiles = useCallback(async (files: globalThis.File[]) => {
        if (files.length === 0) return;

        setUploadError(null);
        clearError();

        // Pre-validate: reject files exceeding 50 MB before attempting anything
        const oversized = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
        if (oversized.length > 0) {
            const names = oversized.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ");
            setUploadError(
                `The following file${oversized.length > 1 ? "s exceed" : " exceeds"} the 50 MB limit and cannot be uploaded: ${names}. ` +
                `Please split large files or reduce their size before uploading.`
            );
            return;
        }

        const initialStatuses: FileStatus[] = files.map((f) => ({
            originalFile: f,
            file: f,
            status: "pending",
        }));
        setFileStatuses(initialStatuses);

        const resources: PublicResource[] = [];
        const updatedStatuses = [...initialStatuses];

        for (let i = 0; i < files.length; i++) {
            let fileToUpload = files[i];
            const isImage = fileToUpload.type.startsWith("image/");
            const isPdf = fileToUpload.type === "application/pdf";

            // Auto-compress images and PDFs above 10 MB
            if (fileToUpload.size > COMPRESS_THRESHOLD && (isImage || isPdf)) {
                updatedStatuses[i] = { ...updatedStatuses[i], status: "compressing" };
                setFileStatuses([...updatedStatuses]);

                const result = isImage
                    ? await compressImageFile(fileToUpload)
                    : await compressPdfFile(fileToUpload);

                if (result) {
                    fileToUpload = result.file;
                    updatedStatuses[i] = {
                        ...updatedStatuses[i],
                        file: result.file,
                        compressionNote: result.note,
                    };
                } else {
                    updatedStatuses[i] = {
                        ...updatedStatuses[i],
                        compressionNote: `Compression unavailable — uploading original (${formatBytes(fileToUpload.size)})`,
                    };
                }
            }

            updatedStatuses[i] = { ...updatedStatuses[i], status: "uploading" };
            setFileStatuses([...updatedStatuses]);

            try {
                const normalized = await upload(
                    { kind: "file", file: fileToUpload },
                    { folderPath: "Public Chat Uploads", visibility: "public" },
                );
                resources.push(normalizedToResource(normalized, fileToUpload.name, fileToUpload.size));
                updatedStatuses[i] = { ...updatedStatuses[i], status: "done" };
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : "Upload failed.";
                updatedStatuses[i] = { ...updatedStatuses[i], status: "error", errorMessage: errMsg };
                setUploadError(errMsg);
            }

            setFileStatuses([...updatedStatuses]);
        }

        if (resources.length > 0) {
            onSelect(resources);
        }
    }, [upload, normalizedToResource, clearError, onSelect]);

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
        clearError();
    }, [clearError]);

    const hasErrors = fileStatuses.some((f) => f.status === "error");
    const isUploading = uploading;
    const displayError = uploadError || (!isUploading && hookError ? hookError.message : null);

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
                    accept="image/*,audio/*,video/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileInputChange}
                    className="hidden"
                />

                {/* Error Alert */}
                {displayError && (
                    <Alert variant="destructive" className="py-2 relative">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-xs font-semibold">Upload Failed</AlertTitle>
                        <AlertDescription className="text-xs">
                            {displayError}
                            <div className="mt-1 text-xs opacity-80">
                                Images and PDFs over 10 MB are automatically compressed. Files over 50 MB cannot be uploaded — 
                                please reduce the file size before trying again.
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
                                        <span className="font-medium truncate text-foreground">{fs.originalFile.name}</span>
                                        <span className="text-muted-foreground flex-shrink-0">{formatBytes(fs.originalFile.size)}</span>
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
                        className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-2 transition-colors ${
                            isDragging
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                                : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
                        }`}
                    >
                        {isUploading ? (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-500" />
                                <p className="text-sm text-gray-600 dark:text-gray-400">Uploading…</p>
                            </div>
                        ) : (
                            <>
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
                                <Button onClick={openFilePicker} className="h-8" disabled={isProcessing}>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Choose Files
                                </Button>
                            </>
                        )}
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
                        <li>• Documents: PDF, DOC, DOCX, TXT</li>
                        <li>• Audio: MP3, WAV, OGG</li>
                        <li>• Max size: 50 MB per file</li>
                        <li className="text-blue-500 dark:text-blue-400">• Large PDFs and images are automatically compressed</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
