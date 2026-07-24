"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { EpisodeForm } from "./PodcastForm";
import { podcastService } from "../../service";
import type { PcShow, PcEpisodeWithShow } from "../../types";

interface EpisodeDetailClientProps {
  showId: string;
  /** Pass 'new' to create, or episode UUID to edit */
  episodeId: string;
}

export function EpisodeDetailClient({
  showId,
  episodeId,
}: EpisodeDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isNew = episodeId === "new";

  const [show, setShow] = useState<PcShow | null>(null);
  const [allShows, setAllShows] = useState<PcShow[]>([]);
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [shows, ep] = await Promise.all([
          podcastService.fetchAllShows(),
          isNew
            ? Promise.resolve(null)
            : podcastService.fetchEpisodeById(episodeId),
        ]);
        setAllShows(shows);
        const foundShow = shows.find((s) => s.id === showId) ?? null;
        setShow(foundShow);
        setEpisode(ep);
      } catch (e) {
        console.error("Failed to load episode", e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [showId, episodeId, isNew]);

  const back = () =>
    startTransition(() =>
      router.push(`/administration/knowledge/podcasts/shows/${showId}?panel=episodes`),
    );

  const handleSaved = (saved: PcEpisodeWithShow) => {
    // After creating a new episode, navigate to its real edit route
    if (isNew) {
      startTransition(() =>
        router.replace(
          `/administration/knowledge/podcasts/shows/${showId}/episodes/${saved.id}`,
        ),
      );
    } else {
      setEpisode(saved);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <button
          onClick={back}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Back to episodes"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-sm truncate">
            {isNew ? "New Episode" : (episode?.title ?? "Loading…")}
          </h1>
          {show && (
            <p className="text-xs text-muted-foreground truncate">
              {show.title}
              {episode?.slug && ` · /podcast/${episode.slug}`}
            </p>
          )}
        </div>
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="p-4 max-w-2xl">
            <EpisodeForm
              episode={episode}
              isNew={isNew}
              shows={allShows}
              defaultShowId={showId}
              onSaved={handleSaved}
              onCancel={back}
            />
          </div>
        )}
      </div>
    </div>
  );
}
