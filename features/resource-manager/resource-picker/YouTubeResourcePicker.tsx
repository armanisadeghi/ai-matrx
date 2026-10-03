"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import {
    PickerSearchField,
    PickerView,
    PickerViewBody,
    ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { youtubeId } from "@/lib/media/youtube";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface YouTubeResourcePickerProps {
    onBack: () => void;
    onSelect: (video: YouTubeVideo) => void;
    initialUrl?: string;
}

type YouTubeVideo = {
    url: string;
    videoId: string;
    title?: string;
    thumbnail?: string;
    duration?: string;
    channelName?: string;
};

// Extract YouTube video ID — the ONE canonical parser owns the URL shapes
// (`lib/media/youtube.ts`, whose header says not to re-implement this). The
// local copy this replaced accepted a channel page's first path segment as a
// video id and diverged from every other door's idea of a YouTube link.
function extractVideoId(url: string): string | null {
    const trimmed = url.trim();
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = youtubeId(normalized);
    if (parsed) return parsed;
    // A bare video id pasted on its own is still a thing people do.
    return /^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

// Validate YouTube URL
function isValidYouTubeUrl(url: string): boolean {
    return extractVideoId(url) !== null;
}

// Get YouTube thumbnail URL
function getThumbnailUrl(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// Fetch basic video info using oEmbed API (no API key required)
async function fetchVideoInfo(videoId: string): Promise<{ title?: string; channelName?: string }> {
    try {
        const response = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch video info');
        }

        const data = await response.json();
        return {
            title: data.title,
            channelName: data.author_name
        };
    } catch (error) {
        console.error('Error fetching YouTube video info:', error);
        return {};
    }
}

export function YouTubeResourcePicker({ onBack, onSelect, initialUrl }: YouTubeResourcePickerProps) {
    const [url, setUrl] = useState(initialUrl || "");
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [videoPreview, setVideoPreview] = useState<YouTubeVideo | null>(null);
    const inputRef = usePickerInputFocus();

    // Auto-validate if initialUrl is provided
    useEffect(() => {
        if (initialUrl && initialUrl.trim()) {
            handleValidate();
        }
    }, [initialUrl]);

    const handleValidate = async () => {
        setError(null);
        setVideoPreview(null);

        if (!url.trim()) {
            setError("Paste a YouTube link.");
            return;
        }

        const videoId = extractVideoId(url.trim());

        if (!videoId) {
            setError("That is not a YouTube video link.");
            return;
        }

        setIsValidating(true);

        try {
            // Fetch video info
            const info = await fetchVideoInfo(videoId);

            const video: YouTubeVideo = {
                url: `https://www.youtube.com/watch?v=${videoId}`,
                videoId,
                title: info.title || 'YouTube Video',
                thumbnail: getThumbnailUrl(videoId),
                channelName: info.channelName
            };

            setVideoPreview(video);
        } catch (err) {
            setError("That video is private or unavailable.");
        } finally {
            setIsValidating(false);
        }
    };

    const handleSelect = () => {
        if (videoPreview) {
            onSelect(videoPreview);
        }
    };

    // Enter belongs to this field — same rule as "Add a link" (PB-04 run 2).
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!isValidating) handleValidate();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const pastedText = e.clipboardData.getData('text');
        setUrl(pastedText);

        // Validate using pastedText directly to avoid stale closure on url state
        setTimeout(() => {
            setError(null);
            setVideoPreview(null);

            const videoId = extractVideoId(pastedText.trim());
            if (!videoId) {
                setError("That is not a YouTube video link.");
                return;
            }

            setIsValidating(true);
            fetchVideoInfo(videoId).then((info) => {
                const video: YouTubeVideo = {
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId,
                    title: info.title || 'YouTube Video',
                    thumbnail: getThumbnailUrl(videoId),
                    channelName: info.channelName,
                };
                setVideoPreview(video);
            }).catch(() => {
                setError("That video is private or unavailable.");
            }).finally(() => {
                setIsValidating(false);
            });
        }, 50);
    };

    return (
        <PickerView>
            <ResourcePickerSubViewHeader
                onBack={onBack}
                search={
                    <div onPaste={handlePaste}>
                        <PickerSearchField
                            ref={inputRef}
                            type="url"
                            value={url}
                            onChange={setUrl}
                            onKeyDown={handleKeyDown}
                            loading={isValidating}
                            placeholder="https://www.youtube.com/watch?v=..."
                        />
                    </div>
                }
                actions={
                    <button
                        type="button"
                        onClick={handleValidate}
                        disabled={isValidating || !url.trim()}
                        aria-label="Preview"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
                    >
                        {isValidating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ArrowRight className="h-4 w-4" />
                        )}
                    </button>
                }
            />

            <PickerViewBody className="space-y-2">
                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
                        <ErrorAlchemyMenu error={error} />
                    </div>
                )}

                {videoPreview && (
                    <div className="overflow-hidden rounded-lg border border-border">
                        <div className="relative aspect-video w-full bg-muted">
                            <img
                                src={videoPreview.thumbnail}
                                alt={videoPreview.title}
                                className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 opacity-90">
                                    <Youtube className="ml-0.5 h-6 w-6 text-white" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1 bg-background p-2.5">
                            <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                                {videoPreview.title}
                            </h3>
                            {videoPreview.channelName && (
                                <p className="text-xs text-muted-foreground">
                                    {videoPreview.channelName}
                                </p>
                            )}
                            <a
                                href={videoPreview.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                                Watch on YouTube
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    </div>
                )}
            </PickerViewBody>

            {videoPreview && (
                <div className="shrink-0 border-t border-border p-1.5">
                    <Button
                        onClick={handleSelect}
                        className="h-9 w-full text-sm pointer-coarse:h-11"
                        size="sm"
                    >
                        <Youtube className="mr-2 h-4 w-4" />
                        Add video
                    </Button>
                </div>
            )}
        </PickerView>
    );
}
