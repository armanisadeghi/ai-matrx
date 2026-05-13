'use client';

/**
 * AssetUploader (podcast-specific)
 *
 * Composes the generalized `ImageAssetUploader` (cover image + asset
 * variants via `POST /assets`) with a podcast-only video-upload section
 * that posts directly to the Python backend via `useBackendApi`.
 *
 * All image handling lives in `components/official/ImageAssetUploader.tsx`
 * and `POST /assets` (cloud-files-backed) so non-podcast features can
 * share the same pipeline. Video still posts directly to Python via
 * `useBackendApi()`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Trash2, Video } from 'lucide-react';
import { useBackendApi } from '@/hooks/useBackendApi';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
    ImageAssetUploader,
    type ImageUploaderResult,
} from '@/components/official/ImageAssetUploader';
import { folderForPodcast } from '@/features/files/utils/folder-conventions';
import type { components } from '@/types/python-generated/api-types';

/**
 * Shape returned by the Python podcast-video upload endpoint
 * (`/media/podcast/upload-video`). Generated from the OpenAPI spec — the
 * regenerated type now carries an optional `asset` envelope alongside the
 * legacy URL fields.
 */
type UploadAssetsResponse = components['schemas']['PodcastMediaUploadResponse'];

export interface AssetUrls {
    image_url: string | null;
    og_image_url: string | null;
    thumbnail_url: string | null;
    tiny_url: string | null;
    video_url: string | null;
}

interface AssetUploaderProps {
    /** Called whenever URLs change (upload or removal). */
    onComplete: (urls: AssetUrls) => void;
    /** Current URLs already set (to show existing previews). */
    currentImageUrl?: string | null;
    currentVideoUrl?: string | null;
    /** Whether to show the video upload section. */
    showVideoUpload?: boolean;
    /**
     * Optional podcast id used to scope uploads under
     * `Audio/Podcasts/<id>/` via `folderForPodcast`.
     */
    podcastId?: string | null;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface SectionState {
    state: UploadState;
    error: string | null;
    fileName: string | null;
}

const ACCEPT_VIDEO = '.mp4,.mov,.webm';

export function AssetUploader({ onComplete, currentImageUrl, currentVideoUrl, showVideoUpload = true, podcastId }: AssetUploaderProps) {
    const videoInputRef = useRef<HTMLInputElement>(null);
    const api = useBackendApi();

    const [videoSection, setVideoSection] = useState<SectionState>({ state: 'idle', error: null, fileName: null });

    // Track the full set of URLs so image + video updates compose cleanly.
    const urlsRef = useRef<AssetUrls>({
        image_url: currentImageUrl ?? null,
        og_image_url: null,
        thumbnail_url: null,
        tiny_url: null,
        video_url: currentVideoUrl ?? null,
    });
    const [videoUrl, setVideoUrl] = useState<string | null>(currentVideoUrl ?? null);

    useEffect(() => {
        urlsRef.current = {
            ...urlsRef.current,
            image_url: currentImageUrl ?? urlsRef.current.image_url,
            video_url: currentVideoUrl ?? urlsRef.current.video_url,
        };
        setVideoUrl(currentVideoUrl ?? null);
        setVideoSection({ state: 'idle', error: null, fileName: null });
    }, [currentImageUrl, currentVideoUrl]);

    // ── Image handling (delegates to the general uploader) ───────────────
    const handleImageComplete = useCallback((result: ImageUploaderResult | null) => {
        if (result === null) {
            const next: AssetUrls = {
                ...urlsRef.current,
                image_url: null,
                og_image_url: null,
                thumbnail_url: null,
                tiny_url: null,
            };
            urlsRef.current = next;
            onComplete(next);
            return;
        }
        const variants = result.asset.variants;
        const next: AssetUrls = {
            ...urlsRef.current,
            image_url: result.asset.primary_url,
            og_image_url: variants.og_url?.url ?? result.og_image_url,
            thumbnail_url: variants.thumbnail_url?.url ?? result.thumbnail_url,
            tiny_url: variants.tiny_url?.url ?? result.tiny_url,
        };
        urlsRef.current = next;
        onComplete(next);
    }, [onComplete]);

    // ── Video upload — goes DIRECTLY to Python via useBackendApi ─────────
    // This respects the admin localhost/production toggle automatically.
    const uploadVideo = useCallback(async (file: File) => {
        setVideoSection({ state: 'uploading', error: null, fileName: file.name });
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.upload(ENDPOINTS.media.uploadPodcastVideo, formData);
            const data = await res.json() as UploadAssetsResponse;

            // Python may also extract a cover frame; fold those URLs back in.
            // When the response carries a full `asset` envelope, prefer its
            // variant URLs (canonical) over the legacy flat fields.
            const assetVariants = data.asset?.variants ?? {};
            const next: AssetUrls = {
                image_url: data.asset?.primary_url ?? data.image_url ?? urlsRef.current.image_url,
                og_image_url: assetVariants.og_url?.url ?? data.og_image_url ?? urlsRef.current.og_image_url,
                thumbnail_url: assetVariants.thumbnail_url?.url ?? data.thumbnail_url ?? urlsRef.current.thumbnail_url,
                tiny_url: assetVariants.tiny_url?.url ?? urlsRef.current.tiny_url,
                video_url: data.video_url ?? urlsRef.current.video_url,
            };
            urlsRef.current = next;
            setVideoUrl(next.video_url);
            onComplete(next);
            setVideoSection({ state: 'success', error: null, fileName: file.name });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setVideoSection({ state: 'error', error: message, fileName: file.name });
        }
    }, [api, onComplete]);

    const removeVideo = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const next: AssetUrls = { ...urlsRef.current, video_url: null };
        urlsRef.current = next;
        setVideoUrl(null);
        onComplete(next);
        setVideoSection({ state: 'idle', error: null, fileName: null });
        if (videoInputRef.current) videoInputRef.current.value = '';
    }, [onComplete]);

    const handleVideoDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('video/')) uploadVideo(file);
    }, [uploadVideo]);

    const VideoStatusIcon = () => {
        if (videoSection.state === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
        if (videoSection.state === 'success') return <CheckCircle2 className="h-4 w-4 text-success" />;
        if (videoSection.state === 'error') return <AlertCircle className="h-4 w-4 text-destructive" />;
        return null;
    };

    return (
        <div className="flex flex-col gap-4">

            {/* ── Cover image (shared pipeline) ───────────────────────────── */}
            <ImageAssetUploader
                onComplete={handleImageComplete}
                preset="podcast"
                folder={podcastId ? folderForPodcast(podcastId) : undefined}
                currentUrl={currentImageUrl ?? null}
                label="Cover Image"
                allowUrlPaste={false}
            />

            {/* ── Video upload (podcast-specific) ─────────────────────────── */}
            {showVideoUpload && (
                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            Background Video
                            <span className="text-xs text-muted-foreground font-normal">(for "with_video" mode)</span>
                        </p>
                        <VideoStatusIcon />
                    </div>

                    <div
                        onDrop={handleVideoDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => videoSection.state !== 'uploading' && videoInputRef.current?.click()}
                        className={`
                            relative border-2 border-dashed rounded-xl transition-colors
                            ${videoSection.state === 'uploading'
                                ? 'border-primary/40 bg-primary/5 cursor-not-allowed'
                                : 'border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer'}
                        `}
                    >
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept={ACCEPT_VIDEO}
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); }}
                        />

                        {videoUrl ? (
                            <div className="flex items-center gap-3 p-3">
                                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border shrink-0">
                                    <Video className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1 text-sm">
                                    {videoSection.state === 'success' && (
                                        <p className="text-success text-xs font-medium">Uploaded successfully</p>
                                    )}
                                    {videoSection.state === 'idle' && (
                                        <p className="text-xs text-muted-foreground font-medium">Video set</p>
                                    )}
                                    <p className="text-muted-foreground text-xs truncate">{videoSection.fileName ?? 'Previously uploaded'}</p>
                                    {videoSection.state === 'success' && urlsRef.current.image_url && (
                                        <p className="text-xs text-success mt-0.5">Cover image extracted from video</p>
                                    )}
                                    {videoSection.state === 'success' && !urlsRef.current.image_url && (
                                        <p className="text-xs text-warning mt-0.5">Upload a cover image separately</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>
                                </div>
                                <button
                                    onClick={removeVideo}
                                    title="Remove video"
                                    className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-2 py-6">
                                {videoSection.state === 'uploading' ? (
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                ) : (
                                    <Video className="h-8 w-8 text-muted-foreground" />
                                )}
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">
                                        {videoSection.state === 'uploading' ? 'Uploading & processing…' : 'Drop video or click to upload'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        MP4, MOV, WebM · Portrait (1080×1920) recommended
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {videoSection.error && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {videoSection.error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
