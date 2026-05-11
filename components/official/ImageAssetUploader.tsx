'use client';

/**
 * ImageAssetUploader
 * ─────────────────────────────────────────────────────────────────────────
 * Drag-and-drop image upload with Sharp-processed variants on the server.
 *
 * Pipeline: client sends the raw file to `/api/images/upload`, the server
 * resizes and writes every configured variant to cloud-files (one file per
 * variant under `Images/<folder>/<uuid>/`), and returns persistent share
 * URLs. All variants come from the same original image, so they stay in
 * lock-step and all appear together in the user's Files tree.
 *
 * Built from the proven podcast cover-art flow so any place that needs
 * "upload an image and get back a set of public URLs" can share the same
 * pipeline — podcasts, OG images, org logos, app favicons, avatars, etc.
 *
 * Presets:
 *   - "social"   1400² cover, 1200×630 OG, 400² thumb     (default)
 *   - "cover"    1200×630 only
 *   - "avatar"   400 / 128 / 48
 *   - "logo"     512 / 200 / 64
 *   - "favicon"  192 / 64
 *   - "square"   1024²
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertCircle, CheckCircle2, Eye, ImageIcon, Link as LinkIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImagePreset, ImageUploadResponse } from '@/app/api/images/upload/route';
import type { Visibility } from '@/features/files/types';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { openOverlay } from '@/lib/redux/slices/overlaySlice';
import { selectActiveUploads } from '@/features/files/redux/selectors';
import { useFileUpload } from '@/features/files/hooks/useFileUpload';
import { UploadProgressList } from '@/features/files/components/core/FileUploadDropzone/UploadProgressList';
import { extractErrorMessage } from '@/utils/errors';

// ── Types exported for consumers ──────────────────────────────────────────

export type { ImagePreset } from '@/app/api/images/upload/route';

export interface ImageUploaderVariants {
    image_url: string | null;
    og_image_url: string | null;
    thumbnail_url: string | null;
    tiny_url: string | null;
}

export interface ImageUploaderResult extends ImageUploaderVariants {
    /** Primary URL — always equal to `image_url` when set. Convenience for single-URL callers. */
    primary_url: string;
    preset: string;
}

export interface ImageAssetUploaderProps {
    /**
     * Upload pipeline. "asset" preserves the Sharp variant flow. "cloud"
     * uses the Cloud Files upload pipeline with this uploader's image-first UI.
     */
    mode?: 'asset' | 'cloud';
    /** Fires whenever URLs change (successful upload or removal). */
    onComplete?: (result: ImageUploaderResult | null) => void;
    /** Fires after cloud-mode uploads complete with new cloud file ids. */
    onUploaded?: (fileIds: string[]) => void;
    /** Fires when cloud-mode upload fails or an asset-mode upload errors. */
    onError?: (message: string) => void;
    /** Parent folder for cloud-mode uploads. null = root. */
    parentFolderId?: string | null;
    /** Max size per cloud-mode file in bytes (UI-only; server enforces its own cap). */
    maxSize?: number;
    /**
     * Clipboard paste capture. Defaults to "auto": enabled for cloud mode,
     * disabled for asset mode. Use "asset" to let a variant uploader process
     * pasted clipboard images through `/api/images/upload`.
     */
    pasteCaptureMode?: 'auto' | 'off' | 'cloud' | 'asset';
    /** Enable paste from clipboard in cloud mode. Defaults true. Prefer `pasteCaptureMode` for new code. */
    enablePaste?: boolean;
    /** Allow multiple files in cloud mode. Asset mode always uses the first file. */
    multiple?: boolean;
    /** Preset dictating the variant dimensions. Default: "social". */
    preset?: ImagePreset;
    /** Primary image URL already set (shows as existing preview). */
    currentUrl?: string | null;
    /** Optional pre-computed variants to seed the preview (from a prior upload). */
    currentVariants?: Partial<ImageUploaderVariants> | null;
    /**
     * @deprecated Ignored since the cloud-files migration. Kept for back-compat.
     * All variants now land in `Images/<folder>/<uuid>/` regardless of this value.
     */
    bucket?: string;
    /** Optional folder prefix under `Images/` (e.g. "logos" → `Images/logos/{uuid}/`). */
    folder?: string;
    /**
     * Visibility for the uploaded variants. Default: `"public"` — every
     * preset (avatar/logo/og/cover/social/favicon/square) is meant to be
     * rendered on a public surface, so the response carries CDN URLs and
     * pages render without `/share/{token}` redirects. Pass `"private"` for
     * personal-use images (e.g. a recipe photo the user wants kept private).
     */
    visibility?: Visibility;
    /** Compact mode — smaller drop zone, one-line status. */
    compact?: boolean;
    /** Show "or paste image URL" toggle. Default: true. */
    allowUrlPaste?: boolean;
    /** Show an action that opens the uploaded variants in the shared image viewer panel. */
    enableViewerAction?: boolean;
    /** Label shown above the drop zone. */
    label?: string;
    /** Hide the variant chips row even when URLs exist. */
    hideVariantBadges?: boolean;
    /** Accept attribute / dropzone patterns for the file input. */
    accept?: string | string[];
    /** Disable the whole uploader. */
    disabled?: boolean;
    /** Extra classes on the outer wrapper. */
    className?: string;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface SectionState {
    state: UploadState;
    error: string | null;
    fileName: string | null;
}

const DEFAULT_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.heic';

// Labels shown in the variant badge row for each preset. Kept in sync with
// `IMAGE_PRESETS` in app/api/images/upload/route.ts.
const PRESET_VARIANT_LABELS: Record<ImagePreset, Array<{ key: keyof ImageUploaderVariants; label: string; title: string }>> = {
    social: [
        { key: 'image_url',     label: '1400×1400', title: 'Cover art' },
        { key: 'og_image_url',  label: '1200×630',  title: 'OG / Social' },
        { key: 'thumbnail_url', label: '400×400',   title: 'Thumbnail' },
        { key: 'tiny_url',      label: '128×128',   title: 'Tiny icon' },
    ],
    cover: [
        { key: 'image_url',     label: '1200×630', title: 'Cover' },
        { key: 'thumbnail_url', label: '600×315',  title: 'Thumbnail' },
        { key: 'tiny_url',      label: '200×105',  title: 'Tiny' },
    ],
    avatar: [
        { key: 'image_url',     label: '400×400', title: 'Avatar' },
        { key: 'thumbnail_url', label: '128×128', title: 'Thumb' },
        { key: 'tiny_url',      label: '48×48',   title: 'Tiny' },
    ],
    logo: [
        { key: 'image_url',     label: '512×512', title: 'Logo' },
        { key: 'thumbnail_url', label: '200×200', title: 'Medium' },
        { key: 'tiny_url',      label: '64×64',   title: 'Small' },
    ],
    favicon: [
        { key: 'image_url', label: '192×192', title: 'Favicon' },
        { key: 'tiny_url',  label: '64×64',   title: 'Small' },
    ],
    square: [
        { key: 'image_url', label: '1024×1024', title: 'Square' },
    ],
};

const PRESET_BLURB: Record<ImagePreset, string> = {
    social: 'Auto-generates 1400×1400, 1200×630, 400×400, 128×128',
    cover: 'Auto-generates 1200×630, 600×315, 200×105',
    avatar: 'Generates 400×400, 128×128, 48×48',
    logo: 'Generates 512×512, 200×200, 64×64',
    favicon: 'Generates 192×192, 64×64',
    square: 'Generates 1024×1024',
};

interface BuildImageAssetViewerPayloadArgs {
    variants: ImageUploaderVariants;
    label: string;
    preset: ImagePreset;
}

export interface ImageAssetViewerPayload {
    images: string[];
    initialIndex?: number;
    alts?: string[];
    title?: string;
}

export function buildImageAssetViewerPayload({
    variants,
    label,
    preset,
}: BuildImageAssetViewerPayloadArgs): ImageAssetViewerPayload | null {
    const presetLabels = PRESET_VARIANT_LABELS[preset];
    const entries = presetLabels
        .map(({ key, label: variantLabel }) => ({
            url: variants[key],
            alt: `${label} ${variantLabel.replace(/×/g, 'x')}`,
        }))
        .filter((entry): entry is { url: string; alt: string } => Boolean(entry.url));

    if (!entries.length) return null;

    return {
        images: entries.map((entry) => entry.url),
        alts: entries.map((entry) => entry.alt),
        title: label,
    };
}

function StatusIcon({ state }: { state: UploadState }) {
    if (state === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (state === 'success') return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (state === 'error') return <AlertCircle className="h-4 w-4 text-destructive" />;
    return null;
}

export function formatCloudUploadFailures(
    failed: Array<{ name: string; error: string }>,
) {
    return failed.map((f) => `${f.name}: ${f.error}`).join('; ');
}

export function buildPastedImageFileName(mimeType: string, timestamp = Date.now()) {
    const subtype = mimeType.split('/')[1]?.toLowerCase();
    const ext = subtype === 'jpeg' ? 'jpg' : subtype || 'png';
    return `pasted-${timestamp}.${ext}`;
}

export function ImageAssetUploader({
    mode = 'asset',
    onComplete,
    onUploaded,
    onError,
    parentFolderId = null,
    maxSize,
    pasteCaptureMode = 'auto',
    enablePaste = true,
    multiple = false,
    preset = 'social',
    currentUrl,
    currentVariants,
    bucket,
    folder,
    visibility = 'public',
    compact = false,
    allowUrlPaste = true,
    enableViewerAction = false,
    label = 'Image',
    hideVariantBadges = false,
    accept = DEFAULT_ACCEPT,
    disabled = false,
    className,
}: ImageAssetUploaderProps) {
    const dispatch = useAppDispatch();
    const activeUploads = useAppSelector(selectActiveUploads);
    const { upload } = useFileUpload({ parentFolderId, visibility });
    const [section, setSection] = useState<SectionState>({ state: 'idle', error: null, fileName: null });
    const [pasteHighlight, setPasteHighlight] = useState(false);
    const [variants, setVariants] = useState<ImageUploaderVariants>({
        image_url: currentUrl ?? currentVariants?.image_url ?? null,
        og_image_url: currentVariants?.og_image_url ?? null,
        thumbnail_url: currentVariants?.thumbnail_url ?? null,
        tiny_url: currentVariants?.tiny_url ?? null,
    });
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlDraft, setUrlDraft] = useState('');

    // Sync previews when parent switches to a different entity
    useEffect(() => {
        setVariants({
            image_url: currentUrl ?? currentVariants?.image_url ?? null,
            og_image_url: currentVariants?.og_image_url ?? null,
            thumbnail_url: currentVariants?.thumbnail_url ?? null,
            tiny_url: currentVariants?.tiny_url ?? null,
        });
        setSection({ state: 'idle', error: null, fileName: null });
    }, [currentUrl, currentVariants?.image_url, currentVariants?.og_image_url, currentVariants?.thumbnail_url, currentVariants?.tiny_url]);

    const uploadFile = useCallback(async (file: File) => {
        if (disabled) return;
        setSection({ state: 'uploading', error: null, fileName: file.name });
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('preset', preset);
            formData.append('visibility', visibility);
            if (bucket) formData.append('bucket', bucket);
            if (folder) formData.append('folder', folder);

            const res = await fetch('/api/images/upload', { method: 'POST', body: formData });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
            }
            const data = (await res.json()) as ImageUploadResponse;
            const next: ImageUploaderVariants = {
                image_url: data.image_url,
                og_image_url: data.og_image_url,
                thumbnail_url: data.thumbnail_url,
                tiny_url: data.tiny_url,
            };
            setVariants(next);
            onComplete?.({ ...next, primary_url: data.primary_url, preset: data.preset });
            setSection({ state: 'success', error: null, fileName: file.name });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setSection({ state: 'error', error: message, fileName: file.name });
            onError?.(message);
        }
    }, [disabled, preset, bucket, folder, visibility, onComplete]);

    const uploadCloudFiles = useCallback(async (files: File[]) => {
        if (disabled || !files.length) return;
        const uploadFiles = multiple ? files : files.slice(0, 1);
        setSection({
            state: 'uploading',
            error: null,
            fileName: uploadFiles.length === 1 ? uploadFiles[0].name : `${uploadFiles.length} files`,
        });
        try {
            const { uploaded, failed, cancelled } = await upload(uploadFiles, {
                parentFolderId,
                visibility,
            });
            if (uploaded.length) {
                onUploaded?.(uploaded);
                setSection({
                    state: 'success',
                    error: null,
                    fileName: uploadFiles.length === 1 ? uploadFiles[0].name : `${uploaded.length} files`,
                });
            } else if (cancelled) {
                setSection({ state: 'idle', error: null, fileName: null });
            }
            if (failed.length) {
                const message = formatCloudUploadFailures(failed);
                setSection({
                    state: 'error',
                    error: message,
                    fileName: uploadFiles.length === 1 ? uploadFiles[0].name : `${failed.length} failed`,
                });
                onError?.(message);
            }
        } catch (err) {
            const message = extractErrorMessage(err);
            setSection({
                state: 'error',
                error: message,
                fileName: uploadFiles.length === 1 ? uploadFiles[0].name : `${uploadFiles.length} files`,
            });
            onError?.(message);
        }
    }, [disabled, multiple, upload, parentFolderId, visibility, onUploaded, onError]);

    const remove = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        const cleared: ImageUploaderVariants = { image_url: null, og_image_url: null, thumbnail_url: null, tiny_url: null };
        setVariants(cleared);
        onComplete?.(null);
        setSection({ state: 'idle', error: null, fileName: null });
    }, [onComplete]);

    const applyPastedUrl = useCallback(() => {
        const trimmed = urlDraft.trim();
        if (!trimmed) return;
        const next: ImageUploaderVariants = {
            image_url: trimmed,
            og_image_url: null,
            thumbnail_url: null,
            tiny_url: null,
        };
        setVariants(next);
        onComplete?.({ ...next, primary_url: trimmed, preset });
        setSection({ state: 'idle', error: null, fileName: null });
        setShowUrlInput(false);
        setUrlDraft('');
    }, [urlDraft, onComplete, preset]);

    const handleFiles = useCallback((files: File[]) => {
        if (mode === 'cloud') {
            void uploadCloudFiles(files);
            return;
        }
        const file = files[0];
        if (file?.type.startsWith('image/')) void uploadFile(file);
    }, [mode, uploadCloudFiles, uploadFile]);

    const acceptValues = useMemo(
        () => Array.isArray(accept) ? accept : accept.split(',').map((value) => value.trim()).filter(Boolean),
        [accept],
    );

    const acceptMap = useMemo<Record<string, string[]> | undefined>(() => {
        const mimePatterns = acceptValues.filter((pattern) => pattern.includes('/'));
        if (!mimePatterns.length) return undefined;
        return mimePatterns.reduce<Record<string, string[]>>((map, pattern) => {
            map[pattern] = [];
            return map;
        }, {});
    }, [acceptValues]);

    const {
        getRootProps,
        getInputProps,
        isDragActive,
        open: openPicker,
    } = useDropzone({
        onDrop: (acceptedFiles) => handleFiles(acceptedFiles),
        noClick: true,
        noKeyboard: true,
        accept: acceptMap,
        maxSize,
        multiple: mode === 'cloud' ? multiple : false,
        disabled,
    });

    const resolvedPasteCaptureMode = pasteCaptureMode === 'auto'
        ? mode === 'cloud' && enablePaste ? 'cloud' : 'off'
        : pasteCaptureMode;

    useEffect(() => {
        if (resolvedPasteCaptureMode === 'off' || typeof window === 'undefined') return;
        const handler = (event: ClipboardEvent) => {
            if (!event.clipboardData?.items) return;
            const images: File[] = [];
            for (const item of Array.from(event.clipboardData.items)) {
                if (!item.type.startsWith('image/')) continue;
                const blob = item.getAsFile();
                if (!blob) continue;
                images.push(new File([blob], buildPastedImageFileName(blob.type), { type: blob.type }));
            }
            if (!images.length) return;
            event.preventDefault();
            setPasteHighlight(true);
            setTimeout(() => setPasteHighlight(false), 400);
            if (resolvedPasteCaptureMode === 'cloud') {
                void uploadCloudFiles(images);
                return;
            }
            void uploadFile(images[0]);
        };
        window.addEventListener('paste', handler);
        return () => window.removeEventListener('paste', handler);
    }, [resolvedPasteCaptureMode, uploadCloudFiles, uploadFile]);

    const presetLabels = PRESET_VARIANT_LABELS[preset];
    const blurb = PRESET_BLURB[preset];
    const highlighted = isDragActive || pasteHighlight;
    const dropZoneHeight = compact ? 'py-4' : 'py-6';
    const iconSize = compact ? 'h-6 w-6' : 'h-8 w-8';
    const viewerPayload = buildImageAssetViewerPayload({ variants, label, preset });

    const openViewer = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!viewerPayload) return;
        dispatch(
            openOverlay({
                overlayId: 'imageViewer',
                instanceId: 'default',
                data: {
                    ...viewerPayload,
                    initialIndex: viewerPayload.initialIndex ?? 0,
                },
            }),
        );
    }, [dispatch, viewerPayload]);

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {/* Header row: label + status + URL toggle */}
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    {label}
                </p>
                <div className="flex items-center gap-2">
                    <StatusIcon state={section.state} />
                    {allowUrlPaste && !disabled && (
                        <button
                            type="button"
                            onClick={() => setShowUrlInput((v) => !v)}
                            title="Paste a public image URL instead"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                            <LinkIcon className="h-3 w-3" />
                            {showUrlInput ? 'Hide URL' : 'Use URL'}
                        </button>
                    )}
                </div>
            </div>

            {/* URL paste row */}
            {showUrlInput && allowUrlPaste && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-2">
                    <input
                        type="url"
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPastedUrl(); } }}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                        type="button"
                        onClick={applyPastedUrl}
                        disabled={!urlDraft.trim()}
                        className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Use URL
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowUrlInput(false); setUrlDraft(''); }}
                        className="text-xs px-1.5 py-1 rounded-md hover:bg-accent"
                        title="Cancel"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            {/* Drop zone */}
            <div
                {...getRootProps()}
                onClick={() => {
                    if (disabled || section.state === 'uploading') return;
                    openPicker();
                }}
                className={cn(
                    'relative border-2 border-dashed rounded-xl transition-colors',
                    disabled
                        ? 'border-border bg-muted/30 cursor-not-allowed opacity-60'
                    : section.state === 'uploading'
                        ? 'border-primary/40 bg-primary/5 cursor-not-allowed'
                    : highlighted
                        ? 'border-primary bg-primary/5 cursor-pointer'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer',
                )}
            >
                <input
                    {...getInputProps({
                        accept: Array.isArray(accept) ? accept.join(',') : accept,
                    })}
                />

                {variants.image_url ? (
                    <div className="flex items-center gap-3 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={variants.thumbnail_url ?? variants.tiny_url ?? variants.image_url}
                            alt={label}
                            className="w-14 h-14 rounded-lg object-cover border shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="min-w-0 flex-1 text-sm">
                            {section.state === 'success' && (
                                <p className="text-success text-xs font-medium">Processed successfully</p>
                            )}
                            {section.state === 'idle' && (
                                <p className="text-xs text-muted-foreground font-medium">Image set</p>
                            )}
                            <p className="text-muted-foreground text-xs truncate">{section.fileName ?? 'Previously uploaded'}</p>
                            {!disabled && <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>}
                        </div>
                        {!disabled && (
                            <div className="shrink-0 flex items-center gap-1">
                                {enableViewerAction && viewerPayload ? (
                                    <button
                                        type="button"
                                        onClick={openViewer}
                                        title="Open image panel"
                                        aria-label="Open image panel"
                                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={remove}
                                    title="Remove image"
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={cn('flex flex-col items-center justify-center gap-2', dropZoneHeight)}>
                        {section.state === 'uploading' ? (
                            <Loader2 className={cn(iconSize, 'animate-spin text-primary')} />
                        ) : (
                            <Upload className={cn(iconSize, 'text-muted-foreground')} />
                        )}
                        <div className="text-center px-3">
                            <p className="text-sm font-medium text-foreground">
                                {section.state === 'uploading'
                                    ? mode === 'cloud' ? 'Uploading…' : 'Processing…'
                                    : highlighted ? 'Drop to upload' : 'Drop image or click to upload'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {mode === 'cloud'
                                    ? resolvedPasteCaptureMode === 'cloud' ? 'JPG, PNG, WebP · Paste with Ctrl/⌘V' : 'JPG, PNG, WebP'
                                    : resolvedPasteCaptureMode === 'asset'
                                        ? `JPG, PNG, WebP · ${blurb} · Paste with Ctrl/⌘V`
                                        : `JPG, PNG, WebP · ${blurb}`}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {mode === 'cloud' && activeUploads.length > 0 ? (
                <UploadProgressList uploads={activeUploads} />
            ) : null}

            {section.error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {section.error}
                </p>
            )}

            {variants.image_url && !hideVariantBadges && presetLabels.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    {presetLabels.map(({ key, label: vLabel, title }) => (
                        <span
                            key={key}
                            className={cn(
                                'text-xs px-2 py-0.5 rounded-full border',
                                variants[key]
                                    ? 'border-success/40 text-success bg-success/5'
                                    : 'border-muted text-muted-foreground',
                            )}
                            title={title}
                        >
                            {vLabel} {variants[key] ? '✓' : '—'}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ImageAssetUploader;
