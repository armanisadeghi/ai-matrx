"use client";

/**
 * ImageAssetUploader
 * ─────────────────────────────────────────────────────────────────────────
 * Drag-and-drop image upload with server-rendered preset variants.
 *
 * **Two rendering modes controlled by `showSourceTabs`:**
 *
 * `showSourceTabs={false}` (default — back-compat):
 *   Classic single-source dropzone. Drag, click, paste, or toggle a URL
 *   input inline. Callers that don't pass `showSourceTabs` are unchanged.
 *
 * `showSourceTabs={true}` — 4-source picker:
 *   Tab bar with Upload / Library / URL / Generate sources.
 *   - Upload    drag-drop / click / paste → POST /assets
 *   - Library   pick existing cloud file → GET /files/{id}/asset →
 *               POST /assets/{id}/variants (idempotent; attaches existing,
 *               generates missing)
 *   - URL       fetch + upload for variants; CORS fallback → direct URL
 *   - Generate  AI pipeline placeholder (shown when enableGenerate={true})
 *
 * Output shape (`ImageUploaderResult`) is identical across all sources and
 * both modes, so `onComplete` handlers never need to change.
 *
 * Presets (mirror backend registry — `GET /assets/presets` is authoritative):
 *   raw / podcast / social / web / email / logo / avatar / favicon
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    AlertCircle, CheckCircle2, Eye, FolderOpen, ImageIcon,
    Link as LinkIcon, Loader2, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Asset, AssetPreset, AssetVariant, Visibility } from '@/features/files';
import {
    useFileUpload, InlineMediaRef,
    openFilePicker, getAssetForFile, addAssetVariants,
} from '@/features/files';
import { useAppDispatch } from '@/lib/redux/hooks';
import { openOverlay } from '@/lib/redux/slices/overlaySlice';
import { extractErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { AssetPreset } from "@/features/files";

type SourceTab = 'upload' | 'library' | 'url' | 'generate';

export interface ImageUploaderVariants {
  image_url: string | null;
  og_image_url: string | null;
  thumbnail_url: string | null;
  tiny_url: string | null;
}

export interface ImageUploaderResult extends ImageUploaderVariants {
    file_id: string;
    primary_url: string | null;
    preset: string | null;
    asset: Asset;
    variants: Record<string, AssetVariant>;
}

export interface ImageAssetUploaderProps {
    onComplete?: (result: ImageUploaderResult | null) => void;
    onError?: (message: string) => void;
    maxSize?: number;
    enablePaste?: boolean;
    preset?: AssetPreset;
    currentUrl?: string | null;
    currentVariants?: Partial<ImageUploaderVariants> | null;
    folder?: string;
    visibility?: Visibility;
    compact?: boolean;
    allowUrlPaste?: boolean;
    enableViewerAction?: boolean;
    label?: string;
    hideVariantBadges?: boolean;
    accept?: string | string[];
    disabled?: boolean;
    className?: string;
    /**
     * Render the 4-source tab bar (Upload / Library / URL / Generate).
     * Default false — existing callers are unaffected.
     */
    showSourceTabs?: boolean;
    /** Show the Generate tab. Only meaningful when showSourceTabs={true}. */
    enableGenerate?: boolean;
    /** Which tab to open initially. Default "upload". */
    defaultTab?: SourceTab;
}

type UploadState = "idle" | "uploading" | "success" | "error";

interface SectionState {
  state: UploadState;
  error: string | null;
  fileName: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.heic';

export const ASSET_VARIANT_LABELS: Record<string, string> = {
    original: 'Original',
    cover_url: '3000 × 3000',
    cover_sd_url: '1400 × 1400',
    og_url: '1200 × 630',
    square_url: '1080 × 1080',
    portrait_url: '1080 × 1350',
    story_url: '1080 × 1920',
    yt_thumbnail_url: '1280 × 720',
    hero_url: '1920 × 1080',
    card_url: '600 × 400',
    touch_icon_url: '180 × 180',
    pwa_icon_url: '512 × 512',
    header_url: '1200 × 400',
    logo_lg_url: '512 × 512',
    logo_md_url: '200 × 200',
    logo_sm_url: '64 × 64',
    avatar_xl_url: '400 × 400',
    avatar_lg_url: '200 × 200',
    avatar_md_url: '96 × 96',
    avatar_sm_url: '48 × 48',
    avatar_xs_url: '24 × 24',
    favicon_android_url: '192 × 192',
    favicon_apple_touch_url: '180 × 180',
    favicon_32_url: '32 × 32',
    favicon_16_url: '16 × 16',
    thumbnail_url: '400 × 400',
    tiny_url: '128 × 128',
};

const PRESET_BLURB: Record<AssetPreset, string> = {
  raw: "Single original — no derived variants",
  podcast: "Auto-generates 3000², 1400², 1200×630, plus thumbnails",
  social: "Auto-generates OG, square, portrait, story, YouTube thumb",
  web: "Auto-generates hero, OG, card, touch icon, PWA icon, thumbnail",
  email: "Auto-generates 1200×400 header + 1080² square",
  logo: "Auto-generates 512², 200², 64²",
  avatar: "Auto-generates 400², 200², 96², 48², 24²",
  favicon: "Auto-generates 192, 180, 32, 16 px favicons",
};

const TAB_DEFS: { id: SourceTab; label: string; Icon: React.ElementType }[] = [
    { id: 'upload',   label: 'Upload',   Icon: Upload },
    { id: 'library',  label: 'Library',  Icon: FolderOpen },
    { id: 'url',      label: 'URL',      Icon: LinkIcon },
    { id: 'generate', label: 'Generate', Icon: Sparkles },
];

// ── Viewer payload helpers ────────────────────────────────────────────────────

interface BuildImageAssetViewerPayloadArgs {
    variants: ImageUploaderVariants;
    label: string;
    preset: AssetPreset;
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
        images: entries.map((e) => e.url),
        alts: entries.map((e) => e.alt),
        title: label,
    };
}

export function buildPastedImageFileName(mimeType: string, timestamp = Date.now()) {
    const subtype = mimeType.split('/')[1]?.toLowerCase();
    const ext = subtype === 'jpeg' ? 'jpg' : subtype || 'png';
    return `pasted-${timestamp}.${ext}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
    return {
        ...mapAssetToLegacyVariants(asset),
        file_id: asset.file_id,
        primary_url: asset.primary_url,
        preset: asset.preset,
        asset,
        variants: asset.variants,
    };
}

function buildSyntheticResult(
    url: string,
    preset: AssetPreset,
    folder: string | undefined,
    visibility: Visibility,
): ImageUploaderResult {
    const synthAsset: Asset = {
        file_id: '',
        visibility,
        folder: folder ?? '',
        preset,
        primary_key: 'original',
        primary_url: url,
        variants: {
            original: {
                key: 'original', file_id: '', file_path: '',
                width: null, height: null, mime_type: null, file_size: null,
                url, cdn_url: null, signed_url: null, download_url: null, metadata: {},
            },
        },
        metadata: { _source: 'pasted-url' },
    };
    return {
        file_id: '', primary_url: url, preset, asset: synthAsset,
        variants: synthAsset.variants,
        image_url: url, og_image_url: null, thumbnail_url: null, tiny_url: null,
    };
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatusIcon({ state }: { state: UploadState }) {
    if (state === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (state === 'success')  return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (state === 'error')    return <AlertCircle className="h-4 w-4 text-destructive" />;
    return null;
}

interface TabBarProps {
    active: SourceTab;
    onChange: (tab: SourceTab) => void;
    showGenerate: boolean;
}

function TabBar({ active, onChange, showGenerate }: TabBarProps) {
    const tabs = showGenerate ? TAB_DEFS : TAB_DEFS.filter((t) => t.id !== 'generate');
    return (
        <div className="flex gap-1 rounded-lg bg-muted/40 p-0.5 border border-border/50">
            {tabs.map(({ id, label, Icon }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                        active === id
                            ? 'bg-background shadow-sm text-foreground border border-border/50'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                    )}
                >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                </button>
            ))}
        </div>
    );
}

interface PreviewBarProps {
    imageUrl: string;
    label: string;
    onClear: () => void;
    onOpenViewer?: () => void;
    enableViewerAction?: boolean;
}

function PreviewBar({ imageUrl, label, onClear, onOpenViewer, enableViewerAction }: PreviewBarProps) {
    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-card">
            <div className="w-14 h-14 rounded-lg overflow-hidden border border-border/50 shrink-0 bg-muted flex items-center justify-center">
                <InlineMediaRef
                    ref={imageUrl}
                    size={{ width: 56, height: 56 }}
                    fit="cover"
                    rounded="none"
                    alt={label}
                    onError={(e) => { (e.currentTarget as HTMLElement).style.visibility = 'hidden'; }}
                />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Image set</p>
                <p className="text-[10px] text-muted-foreground truncate">{imageUrl}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Use the tabs below to change</p>
            </div>
            <div className="shrink-0 flex items-center gap-1">
                {enableViewerAction && onOpenViewer && (
                    <button
                        type="button"
                        onClick={onOpenViewer}
                        title="Open image panel"
                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClear}
                    title="Remove image"
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

// ── Library tab content ───────────────────────────────────────────────────────

interface LibraryTabContentProps {
    preset: AssetPreset;
    onResult: (result: ImageUploaderResult) => void;
    onError?: (msg: string) => void;
}

function LibraryTabContent({ preset, onResult, onError }: LibraryTabContentProps) {
    const [state, setState] = useState<'idle' | 'resolving' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleBrowse = useCallback(async () => {
        const selected = await openFilePicker({
            title: 'Choose Image',
            allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif'],
        });
        if (!selected?.length) return;
        const fileId = selected[0];
        setState('resolving');
        setErrorMsg(null);
        try {
            await getAssetForFile(fileId);
            const { data: ensured } = await addAssetVariants(fileId, { preset });
            onResult(assetToUploaderResult(ensured));
            setState('idle');
        } catch (err) {
            const msg = extractErrorMessage(err);
            setErrorMsg(msg);
            setState('error');
            onError?.(msg);
        }
    }, [preset, onResult, onError]);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={handleBrowse}
                disabled={state === 'resolving'}
                className={cn(
                    'flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors',
                    state === 'resolving'
                        ? 'border-border opacity-60 cursor-not-allowed'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer',
                )}
            >
                {state === 'resolving'
                    ? <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    : <FolderOpen className="h-8 w-8 text-muted-foreground" />}
                <div className="text-center px-3">
                    <p className="text-sm font-medium text-foreground">
                        {state === 'resolving' ? 'Attaching variants…' : 'Browse your library'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {state === 'resolving'
                            ? 'Detecting existing variants, generating any that are missing'
                            : 'Pick an existing cloud file — missing variants are auto-generated'}
                    </p>
                </div>
            </button>
            {state === 'error' && errorMsg && (
                <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg}
                </p>
            )}
        </div>
    );
}

// ── URL tab content ───────────────────────────────────────────────────────────

interface UrlTabContentProps {
    preset: AssetPreset;
    folder?: string;
    visibility: Visibility;
    onResult: (result: ImageUploaderResult) => void;
    onError?: (msg: string) => void;
}

function UrlTabContent({ preset, folder, visibility, onResult, onError }: UrlTabContentProps) {
    const { upload } = useFileUpload();
    const [url, setUrl] = useState('');
    const [state, setState] = useState<'idle' | 'processing' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = useCallback(async () => {
        const trimmed = url.trim();
        if (!trimmed) return;
        setState('processing');
        setErrorMsg(null);
        try {
            const response = await fetch(trimmed, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) throw new Error('URL does not point to an image');
            const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
            const file = new File([blob], `url-import-${Date.now()}.${ext}`, { type: blob.type });
            const normalized = await upload({ kind: 'file', file }, { preset, folderPath: folder, visibility });
            if (!normalized.asset) throw new Error('No asset returned');
            onResult(assetToUploaderResult(normalized.asset));
            setUrl('');
            setState('idle');
        } catch (err) {
            if (err instanceof TypeError) {
                // CORS block — use the URL directly (no variants).
                onResult(buildSyntheticResult(trimmed, preset, folder, visibility));
                setUrl('');
                setState('idle');
            } else {
                const msg = extractErrorMessage(err);
                setErrorMsg(msg);
                setState('error');
                onError?.(msg);
            }
        }
    }, [url, upload, preset, folder, visibility, onResult, onError]);

    return (
        <div className="flex flex-col gap-2 py-2">
            <p className="text-xs text-muted-foreground px-0.5">
                Paste any public image URL. If accessible, variants will be auto-generated; otherwise the URL is used directly.
            </p>
            <div className="flex items-center gap-2">
                <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit(); } }}
                    placeholder="https://example.com/image.jpg"
                    disabled={state === 'processing'}
                    className="flex-1 h-8 text-xs font-mono"
                    style={{ fontSize: '16px' }}
                    aria-label="Image URL"
                />
                <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!url.trim() || state === 'processing'}
                    className="h-8 px-3 text-xs shrink-0"
                >
                    {state === 'processing'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : 'Use URL'}
                </Button>
            </div>
            {state === 'error' && errorMsg && (
                <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg}
                </p>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImageAssetUploader({
    onComplete,
    onError,
    maxSize,
    enablePaste = true,
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
    showSourceTabs = false,
    enableGenerate = false,
    defaultTab = 'upload',
}: ImageAssetUploaderProps) {
    const dispatch = useAppDispatch();
    const { upload } = useFileUpload();

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
    const [activeTab, setActiveTab] = useState<SourceTab>(defaultTab);

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
            const normalized = await upload({ kind: 'file', file }, { preset, folderPath: folder, visibility });
            const asset = normalized.asset;
            if (!asset) throw new Error('Upload succeeded but no asset envelope was returned');
            setVariants(mapAssetToLegacyVariants(asset));
            onComplete?.(assetToUploaderResult(asset));
            setSection({ state: 'success', error: null, fileName: file.name });
        } catch (err) {
            const message = extractErrorMessage(err) || 'Upload failed';
            setSection({ state: 'error', error: message, fileName: file.name });
            onError?.(message);
        }
    }, [disabled, preset, folder, visibility, upload, onComplete, onError]);

    const remove = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setVariants({ image_url: null, og_image_url: null, thumbnail_url: null, tiny_url: null });
        onComplete?.(null);
        setSection({ state: 'idle', error: null, fileName: null });
    }, [onComplete]);

    const applyPastedUrl = useCallback(() => {
        const trimmed = urlDraft.trim();
        if (!trimmed) return;
        const next: ImageUploaderVariants = { image_url: trimmed, og_image_url: null, thumbnail_url: null, tiny_url: null };
        setVariants(next);
        onComplete?.(buildSyntheticResult(trimmed, preset, folder, visibility));
        setSection({ state: 'idle', error: null, fileName: null });
        setShowUrlInput(false);
        setUrlDraft('');
    }, [urlDraft, onComplete, preset, folder, visibility]);

    const handleFiles = useCallback((files: File[]) => {
        const file = files[0];
        if (file?.type.startsWith('image/')) void uploadFile(file);
    }, [uploadFile]);

    const acceptValues = useMemo(
        () => Array.isArray(accept) ? accept : accept.split(',').map((v) => v.trim()).filter(Boolean),
        [accept],
    );

    const acceptMap = useMemo<Record<string, string[]> | undefined>(() => {
        const mimePatterns = acceptValues.filter((p) => p.includes('/'));
        if (!mimePatterns.length) return undefined;
        return mimePatterns.reduce<Record<string, string[]>>((map, p) => { map[p] = []; return map; }, {});
    }, [acceptValues]);

    const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
        onDrop: (acceptedFiles) => handleFiles(acceptedFiles),
        noClick: true,
        noKeyboard: true,
        accept: acceptMap,
        maxSize,
        multiple: false,
        disabled,
    });

    useEffect(() => {
        if (!enablePaste || typeof window === 'undefined') return;
        const handler = (event: ClipboardEvent) => {
            if (!event.clipboardData?.items) return;
            for (const item of Array.from(event.clipboardData.items)) {
                if (!item.type.startsWith('image/')) continue;
                const blob = item.getAsFile();
                if (!blob) continue;
                event.preventDefault();
                setPasteHighlight(true);
                setTimeout(() => setPasteHighlight(false), 400);
                void uploadFile(new File([blob], buildPastedImageFileName(blob.type), { type: blob.type }));
                return;
            }
        };
        window.addEventListener('paste', handler);
        return () => window.removeEventListener('paste', handler);
    }, [enablePaste, uploadFile]);

    const populatedLegacyEntries = useMemo(() => {
        const order: Array<{ key: keyof ImageUploaderVariants; label: string }> = [
            { key: 'image_url',     label: ASSET_VARIANT_LABELS.original      ?? 'Primary' },
            { key: 'og_image_url',  label: ASSET_VARIANT_LABELS.og_url        ?? 'OG' },
            { key: 'thumbnail_url', label: ASSET_VARIANT_LABELS.thumbnail_url ?? 'Thumbnail' },
            { key: 'tiny_url',      label: ASSET_VARIANT_LABELS.tiny_url      ?? 'Tiny' },
        ];
        return order.filter(({ key }) => Boolean(variants[key]));
    }, [variants]);

    const blurb = PRESET_BLURB[preset] ?? '';
    const highlighted = isDragActive || pasteHighlight;
    const dropZoneHeight = compact ? 'py-4' : 'py-6';
    const iconSize = compact ? 'h-6 w-6' : 'h-8 w-8';
    const viewerPayload = buildImageAssetViewerPayload({ variants, label, preset });

    const openViewer = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!viewerPayload) return;
        dispatch(openOverlay({
            overlayId: 'imageViewer',
            instanceId: 'default',
            data: { ...viewerPayload, initialIndex: viewerPayload.initialIndex ?? 0 },
        }));
    }, [dispatch, viewerPayload]);

    // Shared handler so Library/URL tabs can set variants + fire onComplete.
    const handleTabResult = useCallback((result: ImageUploaderResult) => {
        setVariants(mapAssetToLegacyVariants(result.asset));
        onComplete?.(result);
        setSection({ state: 'idle', error: null, fileName: null });
    }, [onComplete]);

    // ── Dropzone JSX (reused by both modes) ──────────────────────────────
    const dropzoneContent = (
        <div
            {...getRootProps()}
            onClick={() => { if (disabled || section.state === 'uploading') return; openPicker(); }}
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
            <input {...getInputProps({ accept: Array.isArray(accept) ? accept.join(',') : accept })} />

            {variants.image_url && !showSourceTabs ? (
                <div className="flex items-center gap-3 p-3">
                    <InlineMediaRef
                        ref={variants.thumbnail_url ?? variants.tiny_url ?? variants.image_url}
                        size={{ width: 56, height: 56 }}
                        fit="cover"
                        rounded="lg"
                        border="subtle"
                        alt={label}
                        className="shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1 text-sm">
                        {section.state === 'success' && <p className="text-success text-xs font-medium">Processed successfully</p>}
                        {section.state === 'idle'    && <p className="text-xs text-muted-foreground font-medium">Image set</p>}
                        <p className="text-muted-foreground text-xs truncate">{section.fileName ?? 'Previously uploaded'}</p>
                        {!disabled && <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>}
                    </div>
                    {!disabled && (
                        <div className="shrink-0 flex items-center gap-1">
                            {enableViewerAction && viewerPayload && (
                                <button type="button" onClick={openViewer} title="Open image panel" aria-label="Open image panel"
                                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                                    <Eye className="h-4 w-4" />
                                </button>
                            )}
                            <button type="button" onClick={remove} title="Remove image"
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className={cn('flex flex-col items-center justify-center gap-2', dropZoneHeight)}>
                    {section.state === 'uploading'
                        ? <Loader2 className={cn(iconSize, 'animate-spin text-primary')} />
                        : <Upload className={cn(iconSize, 'text-muted-foreground')} />}
                    <div className="text-center px-3">
                        <p className="text-sm font-medium text-foreground">
                            {section.state === 'uploading' ? 'Processing…' : highlighted ? 'Drop to upload' : 'Drop image or click to upload'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {enablePaste ? `JPG, PNG, WebP · ${blurb} · Paste with Ctrl/⌘V` : `JPG, PNG, WebP · ${blurb}`}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );

    // ── Tab mode render ───────────────────────────────────────────────────
    if (showSourceTabs) {
        return (
            <div className={cn('flex flex-col gap-2', className)}>
                {variants.image_url && (
                    <PreviewBar
                        imageUrl={variants.image_url}
                        label={label}
                        onClear={remove}
                        onOpenViewer={openViewer}
                        enableViewerAction={enableViewerAction && !!viewerPayload}
                    />
                )}
                {!disabled && (
                    <>
                        <TabBar active={activeTab} onChange={setActiveTab} showGenerate={enableGenerate} />
                        {activeTab === 'upload'   && dropzoneContent}
                        {activeTab === 'library'  && (
                            <LibraryTabContent preset={preset} onResult={handleTabResult} onError={onError} />
                        )}
                        {activeTab === 'url' && (
                            <UrlTabContent preset={preset} folder={folder} visibility={visibility} onResult={handleTabResult} onError={onError} />
                        )}
                        {activeTab === 'generate' && enableGenerate && (
                            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                <Sparkles className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm font-medium text-foreground">Generate with AI</p>
                                <p className="text-xs text-muted-foreground max-w-[220px]">
                                    AI image generation is available — connect a pipeline from the Generate tab in the Image Manager.
                                </p>
                            </div>
                        )}
                    </>
                )}
                {section.error && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {section.error}
                    </p>
                )}
            </div>
        );
    }

    // ── Legacy single-source render ───────────────────────────────────────
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    {label}
                </p>
                <div className="flex items-center gap-2">
                    <StatusIcon state={section.state} />
                    {allowUrlPaste && !disabled && (
                        <button type="button" onClick={() => setShowUrlInput((v) => !v)}
                            title="Paste a public image URL instead"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" />
                            {showUrlInput ? 'Hide URL' : 'Use URL'}
                        </button>
                    )}
                </div>
            </div>

            {showUrlInput && allowUrlPaste && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-2">
                    <input type="url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPastedUrl(); } }}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={applyPastedUrl} disabled={!urlDraft.trim()}
                        className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                        Use URL
                    </button>
                    <button type="button" onClick={() => { setShowUrlInput(false); setUrlDraft(''); }}
                        className="text-xs px-1.5 py-1 rounded-md hover:bg-accent" title="Cancel">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            {dropzoneContent}

  const confirmCrop = useCallback(async () => {
    if (!cropAreaPixels || !cropSrc || !pendingFile) return;
    setIsCropping(true);
    try {
      const blob = await buildCroppedBlob(cropSrc, cropAreaPixels);
      const ext = pendingFile.name.match(/\.[^.]+$/)?.[0] ?? ".jpg";
      const croppedFile = new File(
        [blob],
        `cropped-${pendingFile.name.replace(/\.[^.]+$/, "")}${ext}`,
        { type: blob.type },
      );
      closeCropDialog();
      await uploadFile(croppedFile);
    } catch (err) {
      const message = extractErrorMessage(err) || "Crop failed";
      setSection({
        state: "error",
        error: message,
        fileName: pendingFile?.name ?? null,
      });
      onError?.(message);
    } finally {
      setIsCropping(false);
    }
  }, [
    cropAreaPixels,
    cropSrc,
    pendingFile,
    closeCropDialog,
    uploadFile,
    onError,
  ]);

            {variants.image_url && !hideVariantBadges && populatedLegacyEntries.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    {populatedLegacyEntries.map(({ key, label: vLabel }) => (
                        <span key={key}
                            className="text-xs px-2 py-0.5 rounded-full border border-success/40 text-success bg-success/5"
                            title={vLabel}>
                            {vLabel} ✓
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
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
    multiple: false,
    disabled,
  });

  // Paste capture — first image item on the clipboard is uploaded through
  // the asset pipeline. Disable with `enablePaste={false}` when this
  // uploader is rendered inside a surface that already owns paste
  // (chat inputs, etc.).
  useEffect(() => {
    if (!enablePaste || typeof window === "undefined") return;
    const handler = (event: ClipboardEvent) => {
      if (!event.clipboardData?.items) return;
      for (const item of Array.from(event.clipboardData.items)) {
        if (!item.type.startsWith("image/")) continue;
        const blob = item.getAsFile();
        if (!blob) continue;
        event.preventDefault();
        setPasteHighlight(true);
        setTimeout(() => setPasteHighlight(false), 400);
        void uploadFile(
          new File([blob], buildPastedImageFileName(blob.type), {
            type: blob.type,
          }),
        );
        return;
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [enablePaste, uploadFile]);

  // Revoke the crop object URL when the component unmounts
  useEffect(() => revokeCropObjectUrl, [revokeCropObjectUrl]);

  // Variant chips: when we have a populated four-key snapshot, render
  // a chip per populated entry plus any unpopulated ones the preset
  // is expected to fill. Built lazily — if the upload hasn't returned
  // a populated set yet we hide the row entirely (matches the legacy
  // behaviour).
  const populatedLegacyEntries = useMemo(() => {
    const order: Array<{ key: keyof ImageUploaderVariants; label: string }> = [
      { key: "image_url", label: ASSET_VARIANT_LABELS.original ?? "Primary" },
      { key: "og_image_url", label: ASSET_VARIANT_LABELS.og_url ?? "OG" },
      {
        key: "thumbnail_url",
        label: ASSET_VARIANT_LABELS.thumbnail_url ?? "Thumbnail",
      },
      { key: "tiny_url", label: ASSET_VARIANT_LABELS.tiny_url ?? "Tiny" },
    ];
    return order.filter(({ key }) => Boolean(variants[key]));
  }, [variants]);

  const blurb = PRESET_BLURB[preset] ?? "";
  const highlighted = isDragActive || pasteHighlight;
  const dropZoneHeight = compact ? "py-4" : "py-6";
  const iconSize = compact ? "h-6 w-6" : "h-8 w-8";
  const viewerPayload = buildImageAssetViewerPayload({
    variants,
    label,
    preset,
  });

  const openViewer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!viewerPayload) return;
      dispatch(
        openOverlay({
          overlayId: "imageViewer",
          instanceId: "default",
          data: {
            ...viewerPayload,
            initialIndex: viewerPayload.initialIndex ?? 0,
          },
        }),
      );
    },
    [dispatch, viewerPayload],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
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
              {showUrlInput ? "Hide URL" : "Use URL"}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyPastedUrl();
              }
            }}
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
            onClick={() => {
              setShowUrlInput(false);
              setUrlDraft("");
            }}
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
          if (disabled || section.state === "uploading") return;
          openPicker();
        }}
        className={cn(
          "relative border-2 border-dashed rounded-xl transition-colors",
          disabled
            ? "border-border bg-muted/30 cursor-not-allowed opacity-60"
            : section.state === "uploading"
              ? "border-primary/40 bg-primary/5 cursor-not-allowed"
              : highlighted
                ? "border-primary bg-primary/5 cursor-pointer"
                : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer",
        )}
      >
        <input
          {...getInputProps({
            accept: Array.isArray(accept) ? accept.join(",") : accept,
          })}
        />

        {variants.image_url ? (
          <div className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                variants.thumbnail_url ??
                variants.tiny_url ??
                variants.image_url
              }
              alt={label}
              className="w-14 h-14 rounded-lg object-cover border shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="min-w-0 flex-1 text-sm">
              {section.state === "success" && (
                <p className="text-success text-xs font-medium">
                  Processed successfully
                </p>
              )}
              {section.state === "idle" && (
                <p className="text-xs text-muted-foreground font-medium">
                  Image set
                </p>
              )}
              <p className="text-muted-foreground text-xs truncate">
                {section.fileName ?? "Previously uploaded"}
              </p>
              {!disabled && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to replace
                </p>
              )}
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
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2",
              dropZoneHeight,
            )}
          >
            {section.state === "uploading" ? (
              <Loader2 className={cn(iconSize, "animate-spin text-primary")} />
            ) : (
              <Upload className={cn(iconSize, "text-muted-foreground")} />
            )}
            <div className="text-center px-3">
              <p className="text-sm font-medium text-foreground">
                {section.state === "uploading"
                  ? "Processing…"
                  : highlighted
                    ? "Drop to upload"
                    : "Drop image or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enablePaste
                  ? `JPG, PNG, WebP · ${blurb} · Paste with Ctrl/⌘V`
                  : `JPG, PNG, WebP · ${blurb}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {section.error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {section.error}
        </p>
      )}

      {variants.image_url &&
        !hideVariantBadges &&
        populatedLegacyEntries.length > 1 && (
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

      {/* Crop dialog — only mounted when enableCrop is true and a file is pending */}
      {enableCrop && (
        <Dialog
          open={cropDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeCropDialog();
          }}
        >
          <DialogContent className="sm:max-w-md md:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crop className="h-4 w-4" />
                Crop Image
              </DialogTitle>
            </DialogHeader>

            {cropSrc && (
              <div className="relative h-80 w-full bg-muted rounded-md overflow-hidden">
                <Cropper
                  image={cropSrc}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={cropAspect ?? undefined}
                  onCropChange={setCropPosition}
                  onZoomChange={setCropZoom}
                  onCropComplete={(_area, pixels) =>
                    setCropAreaPixels(pixels as CropArea)
                  }
                  classes={{
                    containerClassName: "bg-muted",
                    mediaClassName: "bg-muted",
                  }}
                />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Zoom</Label>
                  <span className="text-xs text-muted-foreground">
                    {cropZoom.toFixed(1)}×
                  </span>
                </div>
                <Slider
                  value={[cropZoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={([v]) => setCropZoom(v)}
                />
              </div>

              {cropAspectRatios.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Aspect Ratio</Label>
                  <div className="flex flex-wrap gap-2">
                    {cropAspectRatios.map((ratio) => (
                      <Button
                        key={ratio.label}
                        type="button"
                        size="sm"
                        variant={
                          cropAspect === ratio.value ? "default" : "outline"
                        }
                        onClick={() => setCropAspect(ratio.value)}
                        className="h-7 px-2.5 text-xs"
                      >
                        {ratio.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={closeCropDialog}
                disabled={isCropping}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmCrop}
                disabled={isCropping || !cropAreaPixels}
              >
                {isCropping ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{" "}
                    Cropping…
                  </>
                ) : (
                  "Crop & Upload"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default ImageAssetUploader;
