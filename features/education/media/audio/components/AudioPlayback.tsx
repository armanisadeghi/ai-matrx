"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMediaResolution } from "@ai-matrx/media/core";
import { podcastService } from "@/features/podcasts/service";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface EpisodeAudioResolution {
  episodeId: string;
  url: string | null;
}

/**
 * Durable audio playback for a finished study. The re-mintable file id is the
 * authority; recovered runs may fall back to the episode's durable public URL.
 */
export function AudioPlayback({
  fileId,
  episodeId,
  title,
}: {
  fileId: string | null;
  episodeId: string | null;
  title?: string;
}) {
  const [episodeAudio, setEpisodeAudio] =
    useState<EpisodeAudioResolution | null>(null);

  useEffect(() => {
    if (fileId || !episodeId) return;
    let active = true;
    void podcastService
      .fetchEpisodeById(episodeId)
      .then((episode) => {
        if (active) {
          setEpisodeAudio({ episodeId, url: episode?.audio_url ?? null });
        }
      })
      .catch(() => {
        if (active) setEpisodeAudio({ episodeId, url: null });
      });
    return () => {
      active = false;
    };
  }, [fileId, episodeId]);

  const episodeUrl =
    episodeAudio?.episodeId === episodeId ? episodeAudio.url : undefined;
  // The player always resolves a durable identity first. A freshly produced
  // study has only fileId; recovered studies retain an episode URL. Both pass
  // through the media client so a stale URL can be re-minted before playback.
  const audioUrl = useMediaResolution(fileId ?? episodeUrl ?? null).resolution
    ?.src;

  if (audioUrl) {
    return <PodcastAudioPlayer audioUrl={audioUrl} title={title} />;
  }
  if (!fileId && (!episodeId || episodeUrl === null)) {
    return (
      <p className="text-xs text-destructive" role="alert">
        This audio study could not be loaded. Try again.
        <ErrorAlchemyMenu className="ml-auto" />
      </p>
    );
  }
  return (
    <div className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audio…
    </div>
  );
}
