export type PcDisplayMode = "audio_only" | "with_metadata" | "with_video";

export type PcShow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  og_image_url: string | null;
  thumbnail_url: string | null;
  author: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type PcEpisode = {
  id: string;
  slug: string;
  show_id: string | null;
  user_id: string | null;
  title: string;
  description: string | null;
  audio_url: string;
  image_url: string | null;
  og_image_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  display_mode: PcDisplayMode;
  episode_number: number | null;
  duration_seconds: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type PcEpisodeWithShow = PcEpisode & {
  show: PcShow | null;
};

export type PcShowFormData = {
  slug: string;
  title: string;
  description: string;
  image_url: string;
  og_image_url: string;
  thumbnail_url: string;
  author: string;
  is_published: boolean;
};

export type PcEpisodeFormData = {
  slug: string;
  show_id: string;
  title: string;
  description: string;
  audio_url: string;
  image_url: string;
  og_image_url: string;
  thumbnail_url: string;
  video_url: string;
  display_mode: PcDisplayMode;
  episode_number: string;
  duration_seconds: string;
  is_published: boolean;
};

export type PcSlugLookupResult =
  | { type: "episode"; data: PcEpisodeWithShow }
  | { type: "show"; data: PcShow }
  | null;

// ── Studio runs (pc_studio_runs) ────────────────────────────────────────────
// A persisted record of one podcast generation — the request plus the full
// streamed result (title, transcript, ALL cover/video options, prompts) and a
// link to the resulting episode. Makes a creation returnable + gives a history.

export type PcStudioRunStatus = "running" | "completed" | "failed";

export type PcStudioRun = {
  id: string;
  user_id: string | null;
  status: PcStudioRunStatus;
  input_data_type: string | null;
  podcast_type: string | null;
  /** The PodcastGenerateRequest that produced this run. */
  request: Record<string, unknown>;
  title: string;
  description: string | null;
  script: string | null;
  audio_url: string | null;
  image_urls: string[];
  video_urls: string[];
  image_prompts: string[];
  video_prompts: string[];
  selected_cover_url: string | null;
  show_id: string | null;
  episode_id: string | null;
  episode_slug: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
