'use client';

/**
 * ImageCropUploader
 * ─────────────────────────────────────────────────────────────────────────
 * Pick an image from any source → crop it inline → upload + generate
 * preset variants. Designed for avatar / logo / profile-photo use cases
 * where the caller needs a specific set of sizes and wants the user to
 * confirm framing before anything hits the server.
 *
 * Flow:
 *   1. Source selection — drop a file, pick from cloud library, or paste a URL
 *   2. Inline crop     — drag handles, aspect-ratio chips, rule-of-thirds grid
 *   3. Upload          — cropped File → POST /assets → preset variants via
 *                        POST /assets/{id}/variants
 *   4. Done            — preview strip, onComplete called with ImageUploaderResult
 *
 * The caller specifies `preset` (e.g. "avatar", "logo") — the backend
 * generates every configured size for that preset automatically.
 *
 * Presets and the sizes they produce:
 *   avatar  — 400², 200², 96², 48², 24²
 *   logo    — 512², 200², 64²
 *   social  — OG, square, portrait, story, YT thumb
 *   web     — hero, OG, card, touch-icon, PWA icon
 *   (see ImageAssetUploader for the full list)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    AlertCircle,
    FolderOpen,
    ImageIcon,
    Link as LinkIcon,
    Loader2,
    RotateCcw,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetPreset, Visibility } from '@/features/files';
import {
    useFileUpload,
    InlineMediaRef,
    openFilePicker,
    getAssetForFile,
} from '@/features/files';
import { extractErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    useInitialCropController,
    InitialCropViewport,
    InitialCropAspectBar,
} from '@/features/image-studio/components/InitialCropPanel';
import { cropFileToFile } from '@/features/image-studio/utils/crop-file';
import type { ImageUploaderResult } from '@/components/official/ImageAssetUploader';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageCropUploaderProps {
    onComplete?: (result: ImageUploaderResult | null) => void;
    onError?: (message: string) => void;
    preset?: AssetPreset;
    currentUrl?: string | null;
    folder?: string;
    visibility?: Visibility;
    label?: string;
    disabled?: boolean;
    className?: string;
    /** Aspect ratio to pre-lock on (e.g. 1 for 1:1). Default: free. */
    defaultAspect?: number;
    /** Shape of the upload preview shown while the image is being uploaded. */
    previewShape?: 'circle' | 'square';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileFromUrl(url: string): Promise<File> {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('URL does not point to an image');
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    return new File([blob], `image-${Date.now()}.${ext}`, { type: blob.type });
}

function assetToResult(asset: ReturnType<typeof Object.assign>): ImageUploaderResult {
    const v = asset.variants ?? {};
    return {
        file_id: asset.file_id,
        primary_url: asset.primary_url,
        preset: asset.preset,
        asset,
        variants: asset.variants,
        image_url: asset.primary_url ?? v.original?.url ?? null,
        og_image_url: v.og_url?.url ?? null,
        thumbnail_url: v.thumbnail_url?.url ?? null,
        tiny_url: v.tiny_url?.url ?? null,
    };
}

// ── Source acquisition ────────────────────────────────────────────────────────

type SourceMode = 'idle' | 'url';

interface SourcePickerProps {
    onFile: (file: File) => void;
    onError: (msg: string) => void;
    disabled?: boolean;
}

function SourcePicker({ onFile, onError, disabled }: SourcePickerProps) {
    const [mode, setMode] = useState<SourceMode>('idle');
    const [url, setUrl] = useState('');
    const [fetching, setFetching] = useState(false);
    const [libraryBusy, setLibraryBusy] = useState(false);
    const [pasteFlash, setPasteFlash] = useState(false);

    useEffect(() => {
        if (disabled || typeof window === 'undefined') return;
        const handler = (e: ClipboardEvent) => {
            if (!e.clipboardData?.items) return;
            for (const item of Array.from(e.clipboardData.items)) {
                if (!item.type.startsWith('image/')) continue;
                const blob = item.getAsFile();
                if (!blob) continue;
                e.preventDefault();
                setPasteFlash(true);
                setTimeout(() => setPasteFlash(false), 400);
                const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
                onFile(new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type }));
                return;
            }
        };
        window.addEventListener('paste', handler);
        return () => window.removeEventListener('paste', handler);
    }, [disabled, onFile]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif'] },
        maxFiles: 1,
        disabled: disabled || fetching || libraryBusy,
        onDropAccepted: (files) => { if (files[0]) onFile(files[0]); },
        onDropRejected: () => onError('File type not supported'),
    });

    const handleLibrary = useCallback(async () => {
        const selected = await openFilePicker({
            title: 'Choose Image',
            allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif'],
        });
        if (!selected?.length) return;
        setLibraryBusy(true);
        try {
            const asset = await getAssetForFile(selected[0]);
            const url = asset.primary_url ?? asset.variants?.original?.url;
            if (!url) throw new Error('No renderable URL for this file');
            const file = await fileFromUrl(url);
            onFile(file);
        } catch (err) {
            onError(extractErrorMessage(err));
        } finally {
            setLibraryBusy(false);
        }
    }, [onFile, onError]);

    const handleUrl = useCallback(async () => {
        const trimmed = url.trim();
        if (!trimmed) return;
        setFetching(true);
        try {
            const file = await fileFromUrl(trimmed);
            onFile(file);
            setUrl('');
            setMode('idle');
        } catch (err) {
            onError(extractErrorMessage(err));
        } finally {
            setFetching(false);
        }
    }, [url, onFile, onError]);

    return (
        <div className="flex flex-col gap-2">
            {/* Dropzone */}
            <div
                {...getRootProps()}
                className={cn(
                    'flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer',
                    isDragActive || pasteFlash
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30',
                    (disabled || fetching || libraryBusy) && 'opacity-60 pointer-events-none',
                )}
            >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                        {isDragActive ? 'Drop to select' : 'Drop an image or click to upload'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        JPG, PNG, WebP, GIF, HEIC · Paste with Ctrl/⌘V
                    </p>
                </div>
            </div>

            {/* Secondary sources */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void handleLibrary()}
                    disabled={disabled || libraryBusy || fetching}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                    {libraryBusy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FolderOpen className="h-3.5 w-3.5" />}
                    Browse library
                </button>

                <button
                    type="button"
                    onClick={() => setMode((m) => m === 'url' ? 'idle' : 'url')}
                    disabled={disabled || fetching || libraryBusy}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs transition-colors disabled:opacity-50 disabled:pointer-events-none',
                        mode === 'url'
                            ? 'border-primary/50 bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                >
                    <LinkIcon className="h-3.5 w-3.5" />
                    Paste URL
                </button>
            </div>

            {/* URL input */}
            {mode === 'url' && (
                <div className="flex items-center gap-2">
                    <Input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleUrl(); } }}
                        placeholder="https://example.com/image.jpg"
                        disabled={fetching}
                        className="flex-1 h-8 text-xs font-mono"
                        style={{ fontSize: '16px' }}
                        autoFocus
                    />
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleUrl()}
                        disabled={!url.trim() || fetching}
                        className="h-8 px-3 text-xs shrink-0"
                    >
                        {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Use'}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ── Inline crop step ──────────────────────────────────────────────────────────

interface CropStepProps {
    file: File;
    defaultAspect?: number;
    onConfirm: (cropped: File) => void;
    onCancel: () => void;
}

function CropStep({ file, defaultAspect, onConfirm, onCancel }: CropStepProps) {
    const ctrl = useInitialCropController({
        files: [file],
        onComplete: (results) => { if (results[0]) onConfirm(results[0]); },
        onCancel,
    });

    // Pre-lock the aspect if the caller specified one.
    const didInit = useRef(false);
    if (!didInit.current && ctrl.naturalSize && defaultAspect !== undefined) {
        ctrl.setAspect(defaultAspect);
        didInit.current = true;
    }

    return (
        <div className="flex flex-col rounded-xl overflow-hidden border border-border bg-zinc-950">
            <InitialCropViewport controller={ctrl} className="h-64" />
            <InitialCropAspectBar controller={ctrl} className="bg-card border-t border-border" />
            <div className="flex items-center justify-between gap-2 p-3 bg-card border-t border-border">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <X className="h-3.5 w-3.5" /> Cancel
                </button>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => void ctrl.applyCurrent()}
                    disabled={ctrl.isProcessing}
                    className="h-8 px-4 text-xs"
                >
                    {ctrl.isProcessing
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Cropping…</>
                        : 'Apply crop'}
                </Button>
            </div>
        </div>
    );
}

// ── Preview strip ─────────────────────────────────────────────────────────────

interface PreviewStripProps {
    imageUrl: string;
    label: string;
    onClear: () => void;
    onChangePending: () => void;
    disabled?: boolean;
}

function PreviewStrip({ imageUrl, label, onClear, onChangePending, disabled }: PreviewStripProps) {
    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-card">
            <div className="w-14 h-14 rounded-lg overflow-hidden border border-border/50 shrink-0 bg-muted">
                <InlineMediaRef
                    ref={imageUrl}
                    size={{ width: 56, height: 56 }}
                    fit="cover"
                    rounded="none"
                    alt={label}
                />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Image set</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{imageUrl}</p>
            </div>
            {!disabled && (
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={onChangePending}
                        className="h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        Change
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        title="Remove image"
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type Stage = 'pick' | 'crop' | 'uploading' | 'error';

export function ImageCropUploader({
    onComplete,
    onError,
    preset = 'avatar',
    currentUrl,
    folder,
    visibility = 'public',
    label = 'Image',
    disabled = false,
    className,
    defaultAspect,
    previewShape = 'square',
}: ImageCropUploaderProps) {
    const { upload } = useFileUpload();
    const [stage, setStage] = useState<Stage>('pick');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showPicker, setShowPicker] = useState(!currentUrl);

    // Clean up the preview object URL when the uploading state exits.
    useEffect(() => {
        return () => { if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl); };
    }, [uploadPreviewUrl]);

    const handleError = useCallback((msg: string) => {
        setErrorMsg(msg);
        setStage('error');
        onError?.(msg);
    }, [onError]);

    const handleSourceFile = useCallback((file: File) => {
        setPendingFile(file);
        setStage('crop');
        setErrorMsg(null);
    }, []);

    const handleCropConfirm = useCallback(async (cropped: File) => {
        const previewUrl = URL.createObjectURL(cropped);
        setUploadPreviewUrl(previewUrl);
        setStage('uploading');
        try {
            // upload() with preset routes through POST /assets which already
            // generates all preset variants server-side — addAssetVariants is
            // a redundant round-trip and its response can have primary_url:null
            // if the backend processes variants async, which would clear the photo.
            const normalized = await upload(
                { kind: 'file', file: cropped },
                { preset, folderPath: folder, visibility },
            );
            if (!normalized.asset) throw new Error('No asset returned');
            const result = assetToResult(normalized.asset);
            onComplete?.({
                ...result,
                primary_url: result.primary_url ?? normalized.url ?? null,
                image_url: result.image_url ?? normalized.url ?? null,
            });
            setPendingFile(null);
            setUploadPreviewUrl(null);
            setStage('pick');
            setShowPicker(false);
        } catch (err) {
            setUploadPreviewUrl(null);
            handleError(extractErrorMessage(err));
        }
    }, [upload, preset, folder, visibility, onComplete, handleError]);

    const handleCropCancel = useCallback(() => {
        setPendingFile(null);
        setStage('pick');
        setErrorMsg(null);
    }, []);

    const handleClear = useCallback(() => {
        onComplete?.(null);
        setShowPicker(true);
    }, [onComplete]);

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    {label}
                </p>
            </div>

            {/* Preview — shown when image is set and picker is hidden */}
            {currentUrl && !showPicker && (
                <PreviewStrip
                    imageUrl={currentUrl}
                    label={label}
                    onClear={handleClear}
                    onChangePending={() => setShowPicker(true)}
                    disabled={disabled}
                />
            )}

            {/* Source picker — shown when no image or user clicked Change */}
            {!disabled && (showPicker || !currentUrl) && stage === 'pick' && (
                <>
                    <SourcePicker
                        onFile={handleSourceFile}
                        onError={handleError}
                        disabled={disabled}
                    />
                    {currentUrl && (
                        <button
                            type="button"
                            onClick={() => setShowPicker(false)}
                            className="text-xs text-muted-foreground hover:text-foreground self-end"
                        >
                            Cancel
                        </button>
                    )}
                </>
            )}

            {/* Crop step */}
            {stage === 'crop' && pendingFile && (
                <CropStep
                    file={pendingFile}
                    defaultAspect={defaultAspect}
                    onConfirm={(f) => void handleCropConfirm(f)}
                    onCancel={handleCropCancel}
                />
            )}

            {/* Uploading — show the cropped image shaped to match the final display */}
            {stage === 'uploading' && (
                <div className="flex flex-col items-center gap-3 py-5">
                    {uploadPreviewUrl ? (
                        <div className="relative shrink-0">
                            <img
                                src={uploadPreviewUrl}
                                alt="Uploading preview"
                                className={cn(
                                    'object-cover opacity-50 pointer-events-none select-none',
                                    previewShape === 'circle'
                                        ? 'h-24 w-24 rounded-full'
                                        : 'h-24 w-24 rounded-xl',
                                )}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className={cn(
                                    'animate-spin text-primary drop-shadow-md',
                                    'h-8 w-8',
                                )} />
                            </div>
                        </div>
                    ) : (
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    )}
                    <p className="text-xs text-muted-foreground">Uploading & generating variants…</p>
                </div>
            )}

            {/* Error */}
            {stage === 'error' && errorMsg && (
                <div className="flex items-center gap-2">
                    <p className="text-xs text-destructive flex items-center gap-1 flex-1">
                        <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg}
                    </p>
                    <button
                        type="button"
                        onClick={() => { setStage('pick'); setErrorMsg(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                </div>
            )}
        </div>
    );
}

export default ImageCropUploader;
