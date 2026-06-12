"use client";

// features/podcasts/hooks/useMyPodcasts.ts
//
// Loads the signed-in user's podcast library: the episodes they've created
// (stamped via pc_episodes.user_id) plus the shows available to host new
// episodes. Used by the Studio dashboard and the generator's show picker.

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { podcastService } from "@/features/podcasts/service";
import type { PcShow, PcEpisodeWithShow } from "@/features/podcasts/types";

export interface UseMyPodcasts {
  episodes: PcEpisodeWithShow[];
  shows: PcShow[];
  /** Shows the user has at least one episode in, newest first. */
  myShows: PcShow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Add a freshly-created show to the local list without a round-trip. */
  registerShow: (show: PcShow) => void;
  /** Prepend a freshly-created episode to the library without a round-trip. */
  registerEpisode: (episode: PcEpisodeWithShow) => void;
}

export function useMyPodcasts(): UseMyPodcasts {
  const userId = useAppSelector(selectUserId);
  const [episodes, setEpisodes] = useState<PcEpisodeWithShow[]>([]);
  const [shows, setShows] = useState<PcShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eps, allShows] = await Promise.all([
        userId ? podcastService.fetchEpisodesByUser(userId) : Promise.resolve([]),
        podcastService.fetchAllShows(),
      ]);
      setEpisodes(eps);
      setShows(allShows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your podcasts");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const registerShow = useCallback((show: PcShow) => {
    setShows((prev) =>
      prev.some((s) => s.id === show.id) ? prev : [show, ...prev],
    );
  }, []);

  const registerEpisode = useCallback((episode: PcEpisodeWithShow) => {
    setEpisodes((prev) =>
      prev.some((e) => e.id === episode.id) ? prev : [episode, ...prev],
    );
  }, []);

  // Shows that host at least one of the user's episodes, newest episode first.
  const showIdsWithMyEpisodes = new Set(
    episodes.map((e) => e.show_id).filter((id): id is string => Boolean(id)),
  );
  const myShows = shows.filter((s) => showIdsWithMyEpisodes.has(s.id));

  return {
    episodes,
    shows,
    myShows,
    loading,
    error,
    refresh,
    registerShow,
    registerEpisode,
  };
}
