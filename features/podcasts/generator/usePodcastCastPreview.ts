"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import type { PodcastSpeaker } from "./types";
import type { VoiceProvider } from "./voiceCatalog";

type PodcastCastPreviewWire = components["schemas"]["PodcastCastPreview"];

export interface PodcastCastPreview {
  hostCount: number;
  provider: VoiceProvider;
  speakers: PodcastSpeaker[];
}

function normalizePreview(wire: PodcastCastPreviewWire): PodcastCastPreview {
  return {
    hostCount: wire.host_count,
    provider: wire.provider,
    speakers: wire.speakers.map((speaker, index) => {
      if (!speaker.voice) {
        throw new Error(`Podcast cast speaker ${index + 1} has no voice.`);
      }
      if (
        speaker.gender !== "male" &&
        speaker.gender !== "female" &&
        speaker.gender !== "neutral"
      ) {
        throw new Error(`Podcast cast speaker ${index + 1} has an invalid gender.`);
      }
      return {
        name: speaker.name,
        voice: speaker.voice,
        gender: speaker.gender,
      };
    }),
  };
}

export function usePodcastCastPreview(
  hostCount: number,
  showId: string | null,
) {
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${hostCount}:${showId ?? ""}:${reloadKey}`;
  const [result, setResult] = useState<{
    key: string;
    preview: PodcastCastPreview | null;
    error: string | null;
  }>({ key: "", preview: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    void apiGet("/podcast/cast-preview", {
      signal: controller.signal,
      query: { host_count: hostCount, show_id: showId },
    })
      .then(({ data }) =>
        setResult({ key: requestKey, preview: normalizePreview(data), error: null }),
      )
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          preview: null,
          error:
            cause instanceof Error
              ? cause.message
              : "Couldn't load the server's cast policy.",
        });
      });

    return () => controller.abort();
  }, [hostCount, requestKey, showId]);

  const current = result.key === requestKey ? result : null;

  return {
    preview: current?.preview ?? null,
    loading: current === null,
    error: current?.error ?? null,
    reload: () => setReloadKey((key) => key + 1),
  };
}
