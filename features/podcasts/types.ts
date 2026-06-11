export type PcDisplayMode = "audio_only" | "with_metadata" | "with_video";

/**
 * Owner-authored RSS / podcast-directory distribution config for a show.
 * Persisted to `pc_shows.rss_settings` (JSONB — migration
 * `migrations/pc_shows_rss_settings.sql`). Every field is optional; the
 * settings UI and the feed builder supply defaults, and reads guard with
 * `?? {}` so a null/absent column is safe before the migration is applied.
 */
export type PcShowRssSettings = {
  /** Apple Podcasts top-level category text (see PC_APPLE_CATEGORIES). */
  category?: string;
  /** Podcast owner display name (required by Apple before submission). */
  owner_name?: string;
  /** Podcast owner email (required by Apple; used for directory contact). */
  owner_email?: string;
  /** Feed language code, e.g. "en-us". */
  language?: string;
  /** iTunes explicit flag. */
  explicit?: boolean;
};

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
  /**
   * RSS distribution settings. Nullable + may be absent until the
   * `pc_shows_rss_settings` migration is applied — always read with `?? {}`.
   */
  rss_settings: PcShowRssSettings | null;
  created_at: string;
  updated_at: string;
};

/** One cast member as persisted on the episode — name + provider voice
 *  (Gemini voice name for 1–2 hosts, ElevenLabs voice_id for 3+). */
export type PcEpisodeSpeaker = {
  name: string;
  voice: string;
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
  /** Cast metadata (migration pc_episode_speakers) — null on older rows. */
  host_count: number | null;
  speakers: PcEpisodeSpeaker[] | null;
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
  /** The backend's checkpoint run id (from the podcast_run event) — for resume. */
  backend_run_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
