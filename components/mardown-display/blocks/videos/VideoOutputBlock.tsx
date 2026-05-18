"use client";
import React, { useState } from "react";
import { VideoIcon, Download, Link, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VideoOutputBlockProps {
  url: string;
  mimeType?: string;
  /**
   * Poster image shown by the browser before playback (Phase 1c —
   * populated server-side for matrx-owned videos via
   * `Asset.variants["poster_url"]`). When null the `<video>` element
   * displays a black square instead of a real frame.
   */
  posterUrl?: string;
}

const VideoOutputBlock: React.FC<VideoOutputBlockProps> = ({
  url,
  mimeType,
  posterUrl,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const ext = mimeType?.split("/")[1] ?? url.split(".").pop() ?? "mp4";

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `video-output.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // silent
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch {
      // silent
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 my-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <VideoIcon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-medium text-foreground">Video Output</span>
        {mimeType && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
            {mimeType}
          </span>
        )}
      </div>

      <video
        controls
        src={url}
        poster={posterUrl}
        className="w-full rounded"
        preload="metadata"
      >
        Your browser does not support video playback.
      </video>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
          className="h-6 gap-1 px-2 text-xs text-primary hover:text-primary"
        >
          <Download className="w-3 h-3" />
          {isDownloading ? "Downloading…" : "Download"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyLink}
          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {isLinkCopied ? (
            <Check className="w-3 h-3" />
          ) : (
            <Link className="w-3 h-3" />
          )}
          {isLinkCopied ? "Copied!" : "Copy link"}
        </Button>
      </div>
    </div>
  );
};

export default VideoOutputBlock;
