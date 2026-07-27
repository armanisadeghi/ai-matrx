"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { getYouTubeVideo } from "./service";
import type { YouTubeVideoCandidate } from "./types";
import { YouTubeVideoPreviewSurface } from "./YouTubeVideoPreview";

export function YouTubeVideoPreviewPage({ videoId }: { videoId: string }) {
  const [video, setVideo] = useState<YouTubeVideoCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getYouTubeVideo(videoId)
      .then((result) => {
        if (active) setVideo(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "This YouTube video could not be loaded.",
        );
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground dark:bg-[#07090d] dark:text-zinc-100">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-7 text-center text-red-700 dark:text-red-200">
          {error}
        </div>
      </main>
    );
  }

  if (!video) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-muted-foreground dark:bg-[#07090d] dark:text-zinc-400">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Loading video preview…
        </div>
      </main>
    );
  }

  return <YouTubeVideoPreviewSurface video={video} />;
}
