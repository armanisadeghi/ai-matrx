'use client';

/**
 * ImageAssetUploader
 * ─────────────────────────────────────────────────────────────────────────
 * Drag-and-drop image upload with server-rendered preset variants.
 *
 * Pipeline: client sends the raw file to `POST /assets` on the Python
 * backend, the server renders every preset variant (cover, OG, thumbnail,
 * favicon sizes, avatar sizes, etc.) as separate `cld_files` rows under
 * one logical asset, and returns the canonical {@link Asset} envelope.
 * All variants land under the caller-supplied `folder` (or the server
 * default of `Assets/<uuid>`) so they appear together in the user's
 * file tree.
 *
 * Built from the proven podcast cover-art flow so any place that needs
 * "upload an image and get back a set of public URLs" can share the
 * same pipeline — podcasts, OG images, org logos, app favicons, avatars,
 * canvas covers, etc.
 *
 * Presets (mirror the backend registry — `GET /assets/presets` is the
 * authoritative list, but for static typing we hard-code the union in
 * `features/files/types.ts::AssetPreset`):
 *   - "raw"     → original only (no derived variants)
 *   - "podcast" → cover_url (3000²), cover_sd_url (1400²), og_url, thumbnail_url, tiny_url
 *   - "social"  → og_url (1200×630), square_url, portrait_url, story_url, yt_thumbnail_url + baseline
 *   - "web"     → hero_url, og_url, card_url, touch_icon_url, pwa_icon_url, thumbnail_url + baseline
 *   - "email"   → header_url, square_url
 *   - "logo"    → logo_lg_url, logo_md_url, logo_sm_url + baseline
 *   - "avatar"  → avatar_xl/lg/md/sm/xs_url
 *   - "favicon" → favicon_android/apple_touch/32/16_url
 *
 * Back-compat shim: every existing caller still receives `image_url`,
 * `og_image_url`, `thumbnail_url`, `tiny_url`, `primary_url`, and
 * `preset` on the `ImageUploaderResult`. New code should read
 * `result.asset` / `result.variants` directly.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertCircle, CheckCircle2, Eye, ImageIcon, Link as LinkIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Asset, AssetPreset, AssetVariant, Visibility } from '@/features/files/types';
import { uploadAsset } from '@/features/files/api/assets';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { openOverlay } from '@/lib/redux/slices/overlaySlice';
import { selectActiveUploads } from '@/features/files/redux/selectors';
import { useGuardedFileUpload } from '@/features/files/hooks/useGuardedFileUpload';
import { UploadProgressList } from '@/features/files/components/core/FileUploadDropzone/UploadProgressList';
import { extractErrorMessage } from '@/utils/errors';

// ── Types exported for consumers ──────────────────────────────────────────

export type { AssetPreset } from '@/features/files/types';

/**
 * Back-compat alias. The component's `preset` prop used to be typed as
 * the legacy `ImagePreset` union (`"social" | "cover" | "avatar" | ...`).
 * The new union — {@link AssetPreset} — drops `"cover"` and `"square"` in
 * favour of the richer preset surface. New code should import `AssetPreset`.
 *
 * @deprecated Use `AssetPreset` from `@/features/files/types`.
 */
export type ImagePreset = AssetPreset;

/**
 * Legacy four-key variant shape kept so callers reading
 * `result.image_url` / `og_image_url` / `thumbnail_url` / `tiny_url`
 * still compile. Maps to the new envelope as:
 *   image_url     → asset.primary_url
 *   og_image_url  → asset.variants.og_url?.url
 *   thumbnail_url → asset.variants.thumbnail_url?.url
 *   tiny_url      → asset.variants.tiny_url?.url
 */
export interface ImageUploaderVariants {
    image_url: string | null;
    og_image_url: string | null;
    thumbnail_url: string | null;
    tiny_url: string | null;
}

/**
 * Result shape passed to `onComplete`.
 *
 * Legacy aliases (`image_url`, `og_image_url`, `thumbnail_url`,
 * `tiny_url`, `primary_url`) are populated from the new `Asset`
 * envelope for back-compat. New code should read from
 * `result.asset` / `result.variants` instead.
 */
export interface ImageUploaderResult extends ImageUploaderVariants {
    file_id: string;
    /** Mirror of `asset.primary_url`. */
    primary_url: string | null;
    preset: string | null;
    /** Full canonical envelope — use this in new code. */
    asset: Asset;
    /** Shortcut for `asset.variants`. Keyed by canonical variant key. */
    variants: Record<string, AssetVariant>;
}

export interface ImageAssetUploaderProps {
    /**
     * Upload pipeline. "asset" routes through the `/assets` server pipeline
     * (server renders preset variants). "cloud" uses the Cloud Files upload
     * pipeline with this uploader's image-first UI (no variant rendering).
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
     * pasted clipboard images through `/assets`.
     */
    pasteCaptureMode?: 'auto' | 'off' | 'cloud' | 'asset';
    /** Enable paste from clipboard in cloud mode. Defaults true. Prefer `pasteCaptureMode` for new code. */
    enablePaste?: boolean;
    /** Allow multiple files in cloud mode. Asset mode always uses the first file. */
    multiple?: boolean;
    /** Preset dictating the variant set. Default: `"social"`. */
    preset?: AssetPreset;
    /** Primary image URL already set (shows as existing preview). */
    currentUrl?: string | null;
    /** Optional pre-computed legacy variants to seed the preview (from a prior upload). */
    currentVariants?: Partial<ImageUploaderVariants> | null;
    /**
     * Logical folder path under which every variant lands (e.g.
     * "Shared Assets/orgs/<id>" or "App Assets/prompt-apps/favicons").
     * Defaults to the preset's catch-all (`Assets/<uuid>`) when omitted,
     * but every real caller should pass an explicit folder so files are
     * discoverable in the user's file tree.
     */
    folder?: string;
    /**
     * Visibility for the uploaded variants. Default: `"public"` — every
     * preset is meant to be rendered on a public surface so the response
     * carries CDN URLs and pages render without `/share/{token}`
     * redirects. Pass `"private"` for personal-use images (e.g. a recipe
     * photo the user wants kept private).
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

/**
 * Human-readable labels for every canonical variant key the new asset
 * pipeline emits. Used by:
 *   - {@link buildImageAssetViewerPayload} (alt-text generation)
 *   - the variant-chip row at the bottom of the drop zone
 *
 * Keys are the wire-format variant keys returned in `asset.variants`.
 * Format: dimension string (e.g. "3000 × 3000") for size-fixed
 * variants, or a short descriptor for shape-named ones.
 *
 * Backend source of truth: the preset registry (`GET /assets/presets`)
 * returns every variant's width/height/format. Hardcoded here for the
 * static label-row UI; in a future iteration this can fetch the
 * registry on mount.
 */
export const ASSET_VARIANT_LABELS: Record<string, string> = {
    // Master.
    original: 'Original',

    // Podcast.
    cover_url: '3000 × 3000',
    cover_sd_url: '1400 × 1400',

    // Social.
    og_url: '1200 × 630',
    square_url: '1080 × 1080',
    portrait_url: '1080 × 1350',
    story_url: '1080 × 1920',
    yt_thumbnail_url: '1280 × 720',

    // Web.
    hero_url: '1920 × 1080',
    card_url: '600 × 400',
    touch_icon_url: '180 × 180',
    pwa_icon_url: '512 × 512',

    // Email.
    header_url: '1200 × 400',

    // Logo.
    logo_lg_url: '512 × 512',
    logo_md_url: '200 × 200',
    logo_sm_url: '64 × 64',

    // Avatar.
    avatar_xl_url: '400 × 400',
    avatar_lg_url: '200 × 200',
    avatar_md_url: '96 × 96',
    avatar_sm_url: '48 × 48',
    avatar_xs_url: '24 × 24',

    // Favicon.
    favicon_android_url: '192 × 192',
    favicon_apple_touch_url: '180 × 180',
    favicon_32_url: '32 × 32',
    favicon_16_url: '16 × 16',

    // Shared baseline.
    thumbnail_url: '400 × 400',
    tiny_url: '128 × 128',
};

/**
 * Preset → short blurb describing what the server will render. Drives
 * the helper text under the drop zone. Keep in sync with the backend
 * preset registry; this is for UX only (no behavioural impact).
 */
const PRESET_BLURB: Record<AssetPreset, string> = {
    raw: 'Single original — no derived variants',
    podcast: 'Auto-generates 3000², 1400², 1200×630, plus thumbnails',
    social: 'Auto-generates OG, square, portrait, story, YouTube thumb',
    web: 'Auto-generates hero, OG, card, touch icon, PWA icon, thumbnail',
    email: 'Auto-generates 1200×400 header + 1080² square',
    logo: 'Auto-generates 512², 200², 64²',
    avatar: 'Auto-generates 400², 200², 96², 48², 24²',
    favicon: 'Auto-generates 192, 180, 32, 16 px favicons',
};

interface BuildImageAssetViewerPayloadArgs {
    /** Legacy variants — flat four-key shape kept for back-compat. */
    variants: ImageUploaderVariants;
    label: string;
    /**
     * The preset that produced these variants. The argument is accepted
     * but currently unused by the legacy four-key shape — every entry
     * with a populated URL is included regardless of preset. Kept on
     * the signature so callers don't have to change.
     */
    preset: AssetPreset;
}

export interface ImageAssetViewerPayload {
    images: string[];
    initialIndex?: number;
    alts?: string[];
    title?: string;
}

/**
 * Build a viewer payload from the legacy four-key variant shape. Only
 * URLs that are actually populated are included; alt text uses the
 * variant key's dimension label.
 */
export function buildImageAssetViewerPayload({
    variants,
    label,
}: BuildImageAssetViewerPayloadArgs): ImageAssetViewerPayload | null {
    const legacyKeyToCanonical: Record<keyof ImageUploaderVariants, string> = {
        image_url: 'original',
        og_image_url: 'og_url',
        thumbnail_url: 'thumbnail_url',
        tiny_url: 'tiny_url',
    };
    const entries = (Object.keys(variants) as Array<keyof ImageUploaderVariants>)
        .map((key) => {
            const url = variants[key];
            if (!url) return null;
            const canonical = legacyKeyToCanonical[key];
            const dim = ASSET_VARIANT_LABELS[canonical] ?? '';
            const altDim = dim ? ` ${dim.replace(/×/g, 'x').replace(/\s/g, '')}` : '';
            return { url, alt: `${label}${altDim}` };
        })
        .filter((entry): entry is { url: string; alt: string } => entry !== null);

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

// ── Helpers: map the new Asset envelope to the legacy four-key shape ──

function mapAssetToLegacyVariants(asset: Asset): ImageUploaderVariants {
    const v = asset.variants;
    return {
        image_url: asset.primary_url ?? v.original?.url ?? null,
        og_image_url: v.og_url?.url ?? null,
        thumbnail_url: v.thumbnail_url?.url ?? null,
        tiny_url: v.tiny_url?.url ?? null,
    };
}

function assetToUploaderResult(asset: Asset): ImageUploaderResult {
    const legacy = mapAssetToLegacyVariants(asset);
    return {
        ...legacy,
        file_id: asset.file_id,
        primary_url: asset.primary_url,
        preset: asset.preset,
        asset,
        variants: asset.variants,
    };
}

// ── Component ────────────────────────────────────────────────────────────

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
    const { upload } = useGuardedFileUpload({ parentFolderId, visibility });
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
            const { data: asset } = await uploadAsset({
                file,
                preset,
                folder,
                visibility,
            });
            setVariants(mapAssetToLegacyVariants(asset));
            onComplete?.(assetToUploaderResult(asset));
            setSection({ state: 'success', error: null, fileName: file.name });
        } catch (err) {
            const message = extractErrorMessage(err) || 'Upload failed';
            setSection({ state: 'error', error: message, fileName: file.name });
            onError?.(message);
        }
    }, [disabled, preset, folder, visibility, onComplete, onError]);

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
        // Pasted URLs are NOT uploaded server-side — they're a local
        // override. We synthesize a minimal Asset envelope so callers
        // that read `result.asset` still get a consistent shape.
        const next: ImageUploaderVariants = {
            image_url: trimmed,
            og_image_url: null,
            thumbnail_url: null,
            tiny_url: null,
        };
        setVariants(next);
        const synthAsset: Asset = {
            file_id: '',
            visibility: visibility,
            folder: folder ?? '',
            preset: preset,
            primary_key: 'original',
            primary_url: trimmed,
            variants: {
                original: {
                    key: 'original',
                    file_id: '',
                    file_path: '',
                    width: null,
                    height: null,
                    mime_type: null,
                    file_size: null,
                    url: trimmed,
                    cdn_url: null,
                    signed_url: null,
                    download_url: null,
                    metadata: {},
                },
            },
            metadata: { _source: 'pasted-url' },
        };
        onComplete?.({
            ...next,
            file_id: '',
            primary_url: trimmed,
            preset,
            asset: synthAsset,
            variants: synthAsset.variants,
        });
        setSection({ state: 'idle', error: null, fileName: null });
        setShowUrlInput(false);
        setUrlDraft('');
    }, [urlDraft, onComplete, preset, folder, visibility]);

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

    // Variant chips: when we have a populated four-key snapshot, render
    // a chip per populated entry plus any unpopulated ones the preset
    // is expected to fill. Built lazily — if the upload hasn't returned
    // a populated set yet we hide the row entirely (matches the legacy
    // behaviour).
    const populatedLegacyEntries = useMemo(() => {
        const order: Array<{ key: keyof ImageUploaderVariants; label: string }> = [
            { key: 'image_url', label: ASSET_VARIANT_LABELS.original ?? 'Primary' },
            { key: 'og_image_url', label: ASSET_VARIANT_LABELS.og_url ?? 'OG' },
            { key: 'thumbnail_url', label: ASSET_VARIANT_LABELS.thumbnail_url ?? 'Thumbnail' },
            { key: 'tiny_url', label: ASSET_VARIANT_LABELS.tiny_url ?? 'Tiny' },
        ];
        return order.filter(({ key }) => Boolean(variants[key]));
    }, [variants]);

    const blurb = PRESET_BLURB[preset] ?? '';
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

            {variants.image_url && !hideVariantBadges && populatedLegacyEntries.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    {populatedLegacyEntries.map(({ key, label: vLabel }) => (
                        <span
                            key={key}
                            className="text-xs px-2 py-0.5 rounded-full border border-success/40 text-success bg-success/5"
                            title={vLabel}
                        >
                            {vLabel} ✓
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ImageAssetUploader;
