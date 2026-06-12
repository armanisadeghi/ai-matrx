"use client";
import React, { useState, useRef } from "react";
import {
    DownloadIcon,
    ClipboardCopyIcon,
    ThumbsUpIcon,
    ThumbsDownIcon,
    ShareIcon,
    Maximize2Icon,
    XIcon,
    PlayIcon,
    PauseIcon,
    Volume2Icon,
    VolumeXIcon,
} from "lucide-react";

interface VideoBlockProps {
    src: string;
    alt?: string;
}

const VideoBlock: React.FC<VideoBlockProps> = ({ src, alt = "Video" }) => {
    const [feedback, setFeedback] = useState<"none" | "like" | "dislike">("none");
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showExpandedView, setShowExpandedView] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const expandedVideoRef = useRef<HTMLVideoElement>(null);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();

        try {
            // Fetch the video first
            const response = await fetch(src);
            const blob = await response.blob();

            // Create a download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = src.split("/").pop() || "video";
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to download video:", err);
        }
    };

    const handleCopyUrl = (e: React.MouseEvent) => {
        e.preventDefault();
        navigator.clipboard
            .writeText(src)
            .then(() => {
                setShowCopySuccess(true);
                setTimeout(() => setShowCopySuccess(false), 2000);
            })
            .catch((err) => {
                console.error("Failed to copy URL:", err);
            });
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Shared Video",
                    url: src,
                });
            } catch (err) {
                console.error("Failed to share:", err);
            }
        } else {
            setShowShareModal(true);
        }
    };

    const handleFeedback = (type: "like" | "dislike") => {
        setFeedback(type);
        // Here you could send the feedback to your backend
        console.log(`User ${type}d this video`);
    };

    const openInNewTab = (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleExpand = () => {
        setShowExpandedView(true);
    };

    const handleCloseExpanded = () => {
        setShowExpandedView(false);
    };

    const togglePlay = (ref: React.RefObject<HTMLVideoElement>) => {
        if (ref.current) {
            if (ref.current.paused) {
                ref.current.play();
                setIsPlaying(true);
            } else {
                ref.current.pause();
                setIsPlaying(false);
            }
        }
    };

    const toggleMute = (ref: React.RefObject<HTMLVideoElement>) => {
        if (ref.current) {
            ref.current.muted = !ref.current.muted;
            setIsMuted(ref.current.muted);
        }
    };

    return (
        <div className="relative inline-block my-4 rounded-3xl group">
            <video 
                ref={videoRef} 
                src={src} 
                className="max-w-full pt-2 h-auto rounded-3xl"
                controls
                preload="metadata"
            >
                Your browser does not support the video tag.
            </video>

            {/* Action buttons - visible on group hover */}
            <div className="absolute top-4 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                    onClick={handleDownload}
                    className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
                    title="Download"
                >
                    <DownloadIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={handleCopyUrl}
                    className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
                    title="Copy URL"
                >
                    <ClipboardCopyIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={handleShare}
                    className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
                    title="Share"
                >
                    <ShareIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={handleExpand}
                    className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
                    title="Expand"
                >
                    <Maximize2Icon className="w-4 h-4" />
                </button>
            </div>

            {/* Feedback section - now on bottom left */}
            <div className="absolute bottom-2 left-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                    onClick={() => handleFeedback("like")}
                    className={`p-2 rounded-full transition-all duration-200 ${
                        feedback === "like" ? "bg-green-500 text-white" : "text-white bg-black/40 hover:bg-black/60"
                    }`}
                    title="Like"
                >
                    <ThumbsUpIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => handleFeedback("dislike")}
                    className={`p-2 rounded-full transition-all duration-200 ${
                        feedback === "dislike" ? "bg-red-500 text-white" : "text-white bg-black/40 hover:bg-black/60"
                    }`}
                    title="Dislike"
                >
                    <ThumbsDownIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Share modal */}
            {showShareModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShareModal(false)}>
                    <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">Share this video</h3>
                        <div className="flex flex-wrap gap-4 mb-4">
                            <button
                                onClick={() => openInNewTab(`https://twitter.com/intent/tweet?url=${encodeURIComponent(src)}`)}
                                className="bg-blue-400 text-white px-4 py-2 rounded hover:bg-blue-500"
                            >
                                Twitter
                            </button>
                            <button
                                onClick={() => openInNewTab(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(src)}`)}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                            >
                                Facebook
                            </button>
                            <button
                                onClick={() =>
                                    openInNewTab(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(src)}`)
                                }
                                className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-900"
                            >
                                LinkedIn
                            </button>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                            <input 
                                type="text" 
                                value={src} 
                                readOnly 
                                className="flex-1 border p-2 rounded mr-2 dark:bg-zinc-700 dark:border-zinc-600" 
                            />
                            <button onClick={handleCopyUrl} className="bg-gray-200 dark:bg-zinc-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-zinc-600">
                                {showCopySuccess ? "Copied!" : "Copy"}
                            </button>
                        </div>
                        <button
                            onClick={() => setShowShareModal(false)}
                            className="mt-4 w-full bg-gray-200 dark:bg-zinc-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-zinc-600"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Expanded view modal */}
            {showExpandedView && (
                <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-auto">
                        {/* Video container */}
                        <div className="relative overflow-auto max-w-full max-h-full w-full h-full flex items-center justify-center">
                            <video
                                ref={expandedVideoRef}
                                src={src}
                                controls
                                className="max-h-[90dvh] max-w-[90vw]"
                            >
                                Your browser does not support the video tag.
                            </video>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={handleCloseExpanded}
                            className="fixed top-4 right-4 text-white bg-black/60 hover:bg-black/80 p-2 rounded-full transition-all duration-200"
                            title="Close"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Copy success toast notification */}
            {showCopySuccess && (
                <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg">Copied to clipboard!</div>
            )}
        </div>
    );
};

export default VideoBlock;

