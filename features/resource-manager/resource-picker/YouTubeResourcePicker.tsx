"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
    const trimmed = url.trim();

    // Try URL parsing first (handles all query param formats robustly)
    try {
        // Normalize: prepend https:// if no protocol
        const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const urlObj = new URL(normalized);

        if (urlObj.hostname.includes('youtu.be')) {
            // youtu.be/VIDEO_ID?si=... — strip everything after the ID
            return urlObj.pathname.slice(1).split('/')[0] || null;
        }

        if (urlObj.hostname.includes('youtube.com')) {
            const v = urlObj.searchParams.get('v');
            if (v) return v;

            if (urlObj.pathname.startsWith('/embed/')) {
                return urlObj.pathname.split('/embed/')[1].split('?')[0] || null;
            }
            if (urlObj.pathname.startsWith('/shorts/')) {
                return urlObj.pathname.split('/shorts/')[1].split('?')[0] || null;
            }
        }
    } catch {
        // Fall through to regex fallback
    }

    // Regex fallback for edge cases
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }

    return null;
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
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input on mount (preventScroll to avoid auto-scroll)
    useEffect(() => {
        inputRef.current?.focus({ preventScroll: true });
    }, []);

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
            setError("Please enter a YouTube URL");
            return;
        }

        const videoId = extractVideoId(url.trim());

        if (!videoId) {
            setError("Invalid YouTube URL. Please enter a valid YouTube video link.");
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
            setError("Could not fetch video information. The video might be private or unavailable.");
        } finally {
            setIsValidating(false);
        }
    };

    const handleSelect = () => {
        if (videoPreview) {
            onSelect(videoPreview);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isValidating) {
            handleValidate();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData('text');
        setUrl(pastedText);

        // Validate using pastedText directly to avoid stale closure on url state
        setTimeout(() => {
            setError(null);
            setVideoPreview(null);

            const videoId = extractVideoId(pastedText.trim());
            if (!videoId) {
                setError("Invalid YouTube URL. Please enter a valid YouTube video link.");
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
                setError("Could not fetch video information. The video might be private or unavailable.");
            }).finally(() => {
                setIsValidating(false);
            });
        }, 50);
    };

    return (
        <div className="flex flex-col max-h-[min(460px,70dvh)]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={onBack}
                >
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <Youtube className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">YouTube Video</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Input
                            ref={inputRef}
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyPress={handleKeyPress}
                            onPaste={handlePaste}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="flex-1 text-xs h-8"
                            disabled={isValidating}
                        />
                        <Button
                            size="sm"
                            onClick={handleValidate}
                            disabled={isValidating || !url.trim()}
                            className="h-8 w-8 p-0"
                            variant="ghost"
                        >
                            {isValidating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        Paste a YouTube video URL or video ID
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Video Preview - Compact version */}
                {videoPreview && (
                    <div className="border-border rounded-lg overflow-hidden">
                        {/* Thumbnail - Smaller */}
                        <div className="relative h-32 bg-gray-100 dark:bg-gray-900">
                            <img
                                src={videoPreview.thumbnail}
                                alt={videoPreview.title}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center opacity-90">
                                    <Youtube className="w-6 h-6 text-white ml-0.5" />
                                </div>
                            </div>
                        </div>

                        {/* Info - Compact */}
                        <div className="p-2 space-y-1 bg-white dark:bg-zinc-900">
                            <h3 className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                                {videoPreview.title}
                            </h3>
                            {videoPreview.channelName && (
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {videoPreview.channelName}
                                </p>
                            )}
                            <a
                                href={videoPreview.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                                Watch on YouTube
                                <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                        </div>
                    </div>
                )}

                {/* Help Text */}
                {!videoPreview && !error && (
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                            <strong>Supported formats:</strong>
                        </p>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-0.5 ml-3">
                            <li>• youtube.com/watch?v=VIDEO_ID</li>
                            <li>• youtu.be/VIDEO_ID</li>
                            <li>• youtube.com/embed/VIDEO_ID</li>
                            <li>• Direct video ID</li>
                        </ul>
                    </div>
                )}
            </div>

            {/* Footer with Add Button - Fixed at bottom */}
            {videoPreview && (
                <div className="border-t border-border p-3">
                    <Button
                        onClick={handleSelect}
                        className="w-full"
                        size="sm"
                    >
                        <Youtube className="w-4 h-4 mr-2" />
                        Add Video
                    </Button>
                </div>
            )}
        </div>
    );
}

