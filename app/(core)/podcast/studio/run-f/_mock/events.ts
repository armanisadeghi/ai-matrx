// app/(core)/podcast/studio/run-f/_mock/events.ts
//
// Self-contained copy of the backend's podcast stream event shapes. Mirrors
// features/podcasts/generator/types.ts exactly so the run-f demo replays the
// real event contract without importing (or depending on) the live feature.

export interface PodcastStageStartedEvent {
  type: "podcast_stage_started";
  stage: string;
  label: string;
  step: number;
  total: number;
}

export interface PodcastStageEvent {
  type: "podcast_stage";
  stage: string;
  label: string;
  success: boolean;
  output?: string;
  error?: string | null;
  step: number;
  total: number;
}

export interface PodcastMetadataEvent {
  type: "podcast_metadata";
  title: string;
  description: string;
  image_descriptions: string[];
  video_descriptions: string[];
}

export interface PodcastAssetEvent {
  type: "podcast_asset";
  asset_kind: "image" | "video";
  index: number;
  url: string;
  prompt: string;
  success: boolean;
  error?: string | null;
}

export interface PodcastCompleteEvent {
  type: "podcast_complete";
  show_id: string | null;
  success: boolean;
  episode_id: string | null;
  episode_slug: string | null;
  script: string;
  audio_url: string | null;
  title: string;
  description: string;
  image_urls: string[];
  video_urls: string[];
  error?: string | null;
}

export type PodcastDataEvent =
  | PodcastStageStartedEvent
  | PodcastStageEvent
  | PodcastMetadataEvent
  | PodcastAssetEvent
  | PodcastCompleteEvent;
