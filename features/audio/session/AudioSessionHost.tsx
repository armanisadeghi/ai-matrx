/**
 * AudioSessionHost — bridges the framework-free `audioSessionRegistry` into
 * Redux and projects the playback QUEUE into the registry.
 *
 * Mounted once at app root (app/Providers.tsx), beside GlobalRecordingProvider
 * (audio IN), AudioOutputHost (streaming read-aloud) and AudioPlaybackHost (the
 * queue's own Redux mirror + auto-open). This host is intentionally
 * lightweight and SDK-FREE: it imports only the registry's + queue's subscribe
 * APIs, so no TTS SDK lands in the app shell. Adapters still load lazily inside
 * the queue on the first `speak`.
 *
 * Two subscriptions:
 *   1. registry → Redux: every registry change mirrors into `audioSessions` so
 *      the Audio panel renders the unified, serializable timeline.
 *   2. queue → registry: each queue snapshot is projected as `source: "queue"`
 *      sessions (declarative `syncSource`) with per-item controls wired to the
 *      queue functions — so Speaker-button / notes TTS shows up in the same
 *      timeline as the streaming read-aloud and recordings.
 */

"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { audioSessionsSnapshotUpdated } from "@/lib/redux/slices/audioSessionsSlice";
import {
  subscribeAudioSessions,
  syncSource,
  setSessionControls,
} from "./audioSessionRegistry";
import type { AudioSession, AudioSessionStatus } from "./types";
import { subscribePlayback } from "@/features/audio/playback/playbackQueue";
import {
  pausePlayback,
  resumePlayback,
  skipPlayback,
  playPlaybackItem,
  removePlaybackItem,
} from "@/features/audio/playback/playbackQueue";
import type { PlaybackItem } from "@/features/audio/playback/types";

const QUEUE_SOURCE = "queue" as const;

/** Map a queue item status into the registry's shared vocabulary. */
function toSessionStatus(status: PlaybackItem["status"]): AudioSessionStatus {
  return status === "playing" ? "active" : status;
}

function queueItemLabel(item: PlaybackItem): string {
  if (item.label && item.label.trim()) return item.label;
  const text = (item.text ?? "").trim();
  if (!text) return "Audio";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function AudioSessionHost() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // 1) registry → Redux
    const unsubRegistry = subscribeAudioSessions((snapshot) => {
      dispatch(audioSessionsSnapshotUpdated({ sessions: snapshot.sessions }));
    });

    // 2) queue → registry
    const unsubQueue = subscribePlayback((snapshot) => {
      const sessions: AudioSession[] = snapshot.items.map((item) => ({
        id: `queue:${item.id}`,
        direction: "playback",
        source: QUEUE_SOURCE,
        label: queueItemLabel(item),
        text: item.text,
        status: toSessionStatus(item.status),
        error: item.error,
        createdAtMs: item.enqueuedAtMs,
        canReplay: true,
      }));
      syncSource(QUEUE_SOURCE, sessions);
      // Per-item controls (functions live outside Redux). The panel chooses
      // which to render by status; queue transport acts on the active item.
      for (const item of snapshot.items) {
        setSessionControls(`queue:${item.id}`, {
          pause: () => pausePlayback(),
          resume: () => resumePlayback(),
          stop: () => skipPlayback(),
          playNow: () => playPlaybackItem(item.id),
          replay: () => playPlaybackItem(item.id),
          remove: () => removePlaybackItem(item.id),
        });
      }
    });

    return () => {
      unsubRegistry();
      unsubQueue();
    };
  }, [dispatch]);

  return null;
}
