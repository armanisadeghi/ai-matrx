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

// ─── Module-scoped TTL cache + in-flight dedup ───────────────────────────────
//
// Six surfaces mount this hook (StudioDashboard, CreateView, and the create-*
// route variants), each firing `Promise.all([fetchEpisodesByUser, fetchAll
// Shows])` on mount with no sharing. Navigating between them (or a Back/Forward)
// re-ran both queries every time. Cache the (episodes, shows) pair per user so
// co-mounts and quick revisits share one round-trip; `refresh()` forces past
// it, and register* keep the cache coherent so the next mount sees new rows.
const MY_PODCASTS_TTL_MS = 30_000;

interface MyPodcastsPayload {
  episodes: PcEpisodeWithShow[];
  shows: PcShow[];
}

const myPodcastsCache = new Map<string, { at: number; data: MyPodcastsPayload }>();
const myPodcastsInflight = new Map<string, Promise<MyPodcastsPayload>>();

function myPodcastsKey(userId: string | null): string {
  return userId ?? "<anon>";
}

async function loadMyPodcasts(
  userId: string | null,
  force: boolean,
): Promise<MyPodcastsPayload> {
  const key = myPodcastsKey(userId);
  if (!force) {
    const cached = myPodcastsCache.get(key);
    if (cached && Date.now() - cached.at < MY_PODCASTS_TTL_MS) return cached.data;
    const existing = myPodcastsInflight.get(key);
    if (existing) return existing;
  }
  const promise = (async () => {
    const [eps, allShows] = await Promise.all([
      userId ? podcastService.fetchEpisodesByUser(userId) : Promise.resolve([]),
      podcastService.fetchAllShows(),
    ]);
    const data: MyPodcastsPayload = { episodes: eps, shows: allShows };
    myPodcastsCache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => {
    if (myPodcastsInflight.get(key) === promise) myPodcastsInflight.delete(key);
  });
  myPodcastsInflight.set(key, promise);
  return promise;
}

// Keep the shared cache coherent when a caller registers a freshly-created
// show/episode locally, so the next mount that reads from cache includes it.
function patchMyPodcastsCache(
  userId: string | null,
  patch: (data: MyPodcastsPayload) => MyPodcastsPayload,
): void {
  const key = myPodcastsKey(userId);
  const cached = myPodcastsCache.get(key);
  if (cached) myPodcastsCache.set(key, { at: cached.at, data: patch(cached.data) });
}

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

  const load = useCallback(
    async (force: boolean, isMounted: () => boolean) => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadMyPodcasts(userId, force);
        if (!isMounted()) return;
        setEpisodes(data.episodes);
        setShows(data.shows);
      } catch (e) {
        if (!isMounted()) return;
        setError(e instanceof Error ? e.message : "Failed to load your podcasts");
      } finally {
        if (isMounted()) setLoading(false);
      }
    },
    [userId],
  );

  // Public refresh forces past the cache (e.g. after creating an episode
  // elsewhere); the mount load reuses the shared cache/in-flight entry.
  const refresh = useCallback(async () => {
    await load(true, () => true);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    void load(false, () => mounted);
    return () => {
      mounted = false;
    };
  }, [load]);

  const registerShow = useCallback(
    (show: PcShow) => {
      setShows((prev) =>
        prev.some((s) => s.id === show.id) ? prev : [show, ...prev],
      );
      patchMyPodcastsCache(userId, (data) =>
        data.shows.some((s) => s.id === show.id)
          ? data
          : { ...data, shows: [show, ...data.shows] },
      );
    },
    [userId],
  );

  const registerEpisode = useCallback(
    (episode: PcEpisodeWithShow) => {
      setEpisodes((prev) =>
        prev.some((e) => e.id === episode.id) ? prev : [episode, ...prev],
      );
      patchMyPodcastsCache(userId, (data) =>
        data.episodes.some((e) => e.id === episode.id)
          ? data
          : { ...data, episodes: [episode, ...data.episodes] },
      );
    },
    [userId],
  );

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
