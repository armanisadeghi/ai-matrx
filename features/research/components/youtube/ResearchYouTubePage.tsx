"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Library,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { YouTubeDiscovery } from "@/features/marketing/discovery/youtube/YouTubeDiscovery";
import { YouTubeResearchActions } from "@/features/marketing/discovery/youtube/YouTubeResearchActions";
import {
  getTopicYouTubeVideos,
  processTopicYouTubeVideos,
} from "@/features/marketing/discovery/youtube/service";
import type { YouTubeVideoLibraryRecord } from "@/features/marketing/discovery/youtube/types";
import { useTopicId } from "../../context/ResearchContext";

export default function ResearchYouTubePage() {
  const topicId = useTopicId();
  const [view, setView] = useState<"discover" | "library">("discover");
  const [videos, setVideos] = useState<YouTubeVideoLibraryRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      setVideos(await getTopicYouTubeVideos(topicId));
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "The YouTube library could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== "library") return;
    let active = true;
    getTopicYouTubeVideos(topicId)
      .then((result) => {
        if (active) setVideos(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        toast.error(
          caught instanceof Error
            ? caught.message
            : "The YouTube library could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, topicId]);

  const toggle = (videoId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const processSelected = async () => {
    if (selected.size === 0) return;
    setProcessing(true);
    try {
      const result = await processTopicYouTubeVideos(topicId, [...selected]);
      const queued = result.queued ?? [];
      toast.success(
        queued.length > 0
          ? `Started ${queued.length} video ${queued.length === 1 ? "analysis" : "analyses"}.`
          : "Every selected video was already complete or processing.",
      );
      setSelected(new Set());
      await loadLibrary();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Analysis could not start.",
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl border border-border bg-muted/30 p-1">
            <Button
              type="button"
              size="sm"
              variant={view === "discover" ? "default" : "ghost"}
              onClick={() => setView("discover")}
              className="rounded-lg"
            >
              <Search className="mr-2 h-4 w-4" />
              Discover
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "library" ? "default" : "ghost"}
              onClick={() => {
                setLoading(true);
                setView("library");
              }}
              className="rounded-lg"
            >
              <Library className="mr-2 h-4 w-4" />
              Topic library
              {videos.length > 0 && (
                <span className="ml-2 rounded-full bg-background/70 px-2 py-0.5 text-[10px]">
                  {videos.length}
                </span>
              )}
            </Button>
          </div>
          {view === "library" && selected.size > 0 && (
            <Button
              type="button"
              onClick={() => void processSelected()}
              disabled={processing}
              className="rounded-xl bg-red-500 text-white hover:bg-red-400"
            >
              {processing ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              Analyze {selected.size} selected
            </Button>
          )}
        </div>
      </div>

      {view === "discover" ? (
        <YouTubeDiscovery topicId={topicId} />
      ) : (
        <section className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-7">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Permanent topic sources
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              YouTube research library
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Each video is linked to this topic, while its metadata, comments,
              transcript, and Gemini research are stored once and reused
              everywhere.
            </p>
          </div>

          {loading ? (
            <div className="grid min-h-64 place-items-center text-muted-foreground">
              <LoaderCircle className="h-6 w-6 animate-spin" />
            </div>
          ) : videos.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-12 text-center">
              <Library className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">No topic videos yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Use Discover to search YouTube and add the strongest results.
              </p>
              <Button
                type="button"
                onClick={() => setView("discover")}
                className="mt-5 rounded-xl"
              >
                Discover videos
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {videos.map((video) => (
                <article
                  key={video.youtube_video_id}
                  className="overflow-hidden rounded-3xl border border-border bg-card dark:border-white/10"
                >
                  <div className="grid sm:grid-cols-[15rem_1fr]">
                    <Link
                      href={marketingRoutes.youtubeVideo(
                        video.youtube_video_id,
                      )}
                      className="relative block min-h-44 overflow-hidden bg-muted"
                    >
                      {video.thumbnail_url && (
                        <Image
                          src={video.thumbnail_url}
                          alt=""
                          fill
                          sizes="240px"
                          className="object-cover transition hover:scale-[1.02]"
                        />
                      )}
                    </Link>
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selected.has(video.youtube_video_id)}
                          onCheckedChange={() => toggle(video.youtube_video_id)}
                          aria-label={`Select ${video.title ?? "video"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-red-600 dark:text-red-400">
                            {video.channel_title ?? "YouTube creator"}
                          </p>
                          <Link
                            href={marketingRoutes.youtubeVideo(
                              video.youtube_video_id,
                            )}
                            className="mt-1 line-clamp-2 block font-semibold hover:underline"
                          >
                            {video.title ?? "Untitled video"}
                          </Link>
                        </div>
                        {video.processing_status === "completed" && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                        )}
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {video.description || "No description supplied."}
                      </p>
                      <YouTubeResearchActions
                        videoId={video.youtube_video_id}
                        initialStatus={video.processing_status}
                        showAnalysis={false}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
