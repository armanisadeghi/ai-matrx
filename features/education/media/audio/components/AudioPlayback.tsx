"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { podcastService } from "@/features/podcasts/service";
import { SessionAudio } from "@/features/education/study/components/SessionAudio";
import { SessionMediaElement } from "@/features/audio/session/SessionMediaElement";

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
}: {
  fileId: string | null;
  episodeId: string | null;
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

  if (fileId) return <SessionAudio fileId={fileId} className="h-10 w-full" />;

  const resolvedUrl =
    episodeAudio?.episodeId === episodeId ? episodeAudio.url : undefined;
  if (resolvedUrl) {
    return (
      <SessionMediaElement
        as="audio"
        src={resolvedUrl}
        controls
        preload="none"
        className="h-10 w-full"
        sessionSource="podcast"
        sessionLabel="Education audio study"
        trackKey={resolvedUrl}
      />
    );
  }
  if (!episodeId || resolvedUrl === null) {
    return (
      <p className="text-xs text-destructive" role="alert">
        This audio study could not be loaded. Try again.
      </p>
    );
  }
  return (
    <div className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audio…
    </div>
  );
}
