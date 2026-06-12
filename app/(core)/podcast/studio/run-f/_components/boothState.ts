// app/(core)/podcast/studio/run-f/_components/boothState.ts
//
// Render-ready state for the production booth + a pure reducer that folds one
// PodcastDataEvent into it. Modeled on the real PodcastRunState but trimmed to
// exactly what the booth presents, and organized around the five human "acts"
// rather than raw stage rows.

import { actForStage, type ActId } from "./acts";
import type { PodcastDataEvent } from "../_mock/events";

export type ActState = "pending" | "running" | "done";

export interface MediaSlot {
  index: number;
  kind: "image" | "video";
  prompt: string;
  url: string | null;
  status: "pending" | "running" | "done";
}

export interface BoothState {
  status: "running" | "done" | "error";
  /** Per-act lifecycle. Drives the act rail + the central stage. */
  acts: Record<ActId, ActState>;
  /** The act currently on stage (last one to go running, or last done). */
  activeAct: ActId;
  /** 0–100, honest: done-act-weight + in-progress. */
  progress: number;
  title: string;
  description: string;
  /** Plain-English source synopsis pulled from the prepare stage output. */
  sourcePreview: string;
  /** Real ~3-line script peek from the script stage output. */
  scriptPreview: string;
  images: MediaSlot[];
  videos: MediaSlot[];
  audioUrl: string | null;
  script: string;
  episodeSlug: string | null;
  error: string | null;
}

const ACT_ORDER: ActId[] = ["source", "script", "art", "voice", "publish"];

export const INITIAL_BOOTH_STATE: BoothState = {
  status: "running",
  acts: { source: "pending", script: "pending", art: "pending", voice: "pending", publish: "pending" },
  activeAct: "source",
  progress: 0,
  title: "",
  description: "",
  sourcePreview: "",
  scriptPreview: "",
  images: [],
  videos: [],
  audioUrl: null,
  script: "",
  episodeSlug: null,
  error: null,
};

/** Honest progress: each completed act contributes 1/5; the running act adds a
 *  small partial so the bar always moves. Capped below 100 until complete. */
function computeProgress(acts: Record<ActId, ActState>): number {
  const done = ACT_ORDER.filter((a) => acts[a] === "done").length;
  const running = ACT_ORDER.some((a) => acts[a] === "running") ? 0.5 : 0;
  return Math.min(96, Math.round(((done + running) / ACT_ORDER.length) * 100));
}

export function reduce(state: BoothState, ev: PodcastDataEvent): BoothState {
  switch (ev.type) {
    case "podcast_stage_started": {
      const act = actForStage(ev.stage);
      const acts = { ...state.acts };
      // Earlier acts implicitly complete once a later one begins.
      const idx = ACT_ORDER.indexOf(act);
      ACT_ORDER.forEach((a, i) => {
        if (i < idx && acts[a] !== "done") acts[a] = "done";
      });
      if (acts[act] !== "done") acts[act] = "running";
      const next = { ...state, acts, activeAct: act };
      next.progress = computeProgress(acts);
      // Seed media slots when the art act's image/video stages start.
      if (ev.stage.startsWith("image")) {
        const index = Number(ev.stage.split("_")[1] ?? 0);
        if (!next.images.some((s) => s.index === index)) {
          next.images = [
            ...next.images,
            { index, kind: "image", prompt: "", url: null, status: "running" },
          ].sort((a, b) => a.index - b.index);
        }
      }
      if (ev.stage.startsWith("video")) {
        const index = Number(ev.stage.split("_")[1] ?? 0);
        if (!next.videos.some((s) => s.index === index)) {
          next.videos = [
            ...next.videos,
            { index, kind: "video", prompt: "", url: null, status: "running" },
          ];
        }
      }
      return next;
    }

    case "podcast_stage": {
      const act = actForStage(ev.stage);
      const acts = { ...state.acts };
      if (ev.success) acts[act] = "done";
      const next = { ...state, acts };
      next.progress = computeProgress(acts);
      if (ev.stage === "prepare_content" && ev.output) next.sourcePreview = ev.output;
      if (ev.stage === "create_script" && ev.output) next.scriptPreview = ev.output;
      return next;
    }

    case "podcast_metadata": {
      return {
        ...state,
        title: ev.title,
        description: ev.description,
      };
    }

    case "podcast_asset": {
      if (ev.asset_kind === "image") {
        const images = state.images.map((s) =>
          s.index === ev.index
            ? { ...s, url: ev.url, prompt: ev.prompt, status: "done" as const }
            : s,
        );
        return { ...state, images };
      }
      const videos = state.videos.map((s) =>
        s.index === ev.index
          ? { ...s, url: ev.url, prompt: ev.prompt, status: "done" as const }
          : s,
      );
      return { ...state, videos };
    }

    case "podcast_complete": {
      const acts: Record<ActId, ActState> = {
        source: "done",
        script: "done",
        art: "done",
        voice: "done",
        publish: "done",
      };
      return {
        ...state,
        status: ev.success ? "done" : "error",
        acts,
        activeAct: "publish",
        progress: 100,
        title: ev.title || state.title,
        description: ev.description || state.description,
        script: ev.script,
        audioUrl: ev.audio_url,
        episodeSlug: ev.episode_slug,
        images: ev.image_urls.map((url, index) => ({
          index,
          kind: "image" as const,
          prompt: state.images[index]?.prompt ?? "",
          url,
          status: "done" as const,
        })),
        videos: ev.video_urls.map((url, index) => ({
          index,
          kind: "video" as const,
          prompt: state.videos[index]?.prompt ?? "",
          url,
          status: "done" as const,
        })),
        error: ev.error ?? null,
      };
    }

    default:
      return state;
  }
}
