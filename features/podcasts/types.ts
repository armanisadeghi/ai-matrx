import type { Database, Json } from "@/types/database.types";
import {
  readChapterList,
  type MediaChapterData,
} from "@/features/content-ir/kinds/media-chapters";

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
  /** Owner (stamped by the platform `_stamp_actor` trigger on insert).
   *  Null only on partial embeds that don't select it. */
  created_by: string | null;
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

/** One auto-generated chapter marker (podcast.chapter_marker agent output),
 *  persisted under `pc_episodes.metadata.chapters` for the player/RSS layer. */
export type PcEpisodeChapter = MediaChapterData;

export type PcEpisode = {
  id: string;
  slug: string;
  show_id: string | null;
  created_by: string | null;
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
  /** Full generated dialogue script (migration pc_episodes_script) — null on
   *  older rows / uploaded episodes. Source for transcript + article gen. */
  script: string | null;
  /** Auto-generated chapter markers (stored in metadata.chapters) — null until
   *  generated. Write via podcastService.saveEpisodeChapters, never
   *  updateEpisode (it is not a column). */
  chapters: PcEpisodeChapter[] | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

/** Per-episode companion content (migration pc_articles). One row per
 *  (episode_id, kind); regenerating replaces content in place. */
export type PcArticleKind = "blog" | "show_notes";
export type PcArticleStatus = "draft" | "published";

export type PcArticle = {
  id: string;
  show_id: string | null;
  episode_id: string;
  created_by: string | null;
  kind: PcArticleKind;
  slug: string | null;
  title: string;
  content_markdown: string;
  og_image_url: string | null;
  canonical_url: string | null;
  status: PcArticleStatus;
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
  created_by: string | null;
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
  /** Cast metadata (migration pc_episode_speakers) — null on older runs. */
  host_count: number | null;
  speakers: PcEpisodeSpeaker[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type PcEpisodeRow = Database["podcast"]["Tables"]["pc_episodes"]["Row"];
type PcShowRow = Database["podcast"]["Tables"]["pc_shows"]["Row"];

function isPcDisplayMode(v: string): v is PcDisplayMode {
  return v === "audio_only" || v === "with_metadata" || v === "with_video";
}

function parseSpeakers(raw: Json | null): PcEpisodeSpeaker[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PcEpisodeSpeaker[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name =
      "name" in item && typeof item.name === "string" ? item.name : "";
    const voice =
      "voice" in item && typeof item.voice === "string" ? item.voice : "";
    if (name || voice) out.push({ name, voice });
  }
  return out.length ? out : null;
}

/**
 * Read `{ chapters: [...] }` (episode `metadata` or an agent's
 * `media_chapters` payload) into the persisted chapter list. Thin wrapper over
 * `readChapterList` — the `media_chapters` kind bridge's reader, THE one
 * canonical chapter reader (a duplicate copy here drifted; collapsed
 * 2026-08-23). `MediaChapterData` is field-identical to `PcEpisodeChapter`.
 * Returns null (not []) when nothing usable is present, for the row mappers.
 */
export function parseChapters(raw: unknown): PcEpisodeChapter[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = readChapterList((raw as { chapters?: unknown }).chapters);
  return list.length ? list : null;
}

function parseRssSettings(raw: Json | null): PcShowRssSettings | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as PcShowRssSettings;
}

/**
 * THE SIGNED-OUT ROW SHAPE (DD-230, 2026-09-14).
 *
 * `anon` holds a COLUMN grant on the podcast tables, and the five columns it
 * never holds are always the same: `created_by`, `updated_by`,
 * `organization_id`, `version`, `metadata` (DD-186 — identity, bookkeeping and
 * metadata leave regardless). A public reader therefore hands the display
 * mappers a row that genuinely does not carry them, and a type that REQUIRES
 * them makes the only correct query un-typable — which is exactly the pressure
 * that kept `select("*")` in these routes until /podcast was telling four
 * published shows they did not exist.
 *
 * So the mappers take this shape: the table's row with those five optional.
 * Present for a signed-in reader, absent for a guest, never silently wrong.
 */
type SignedOutReadable<T> = Omit<
  T,
  "created_by" | "updated_by" | "organization_id" | "version" | "metadata"
> &
  Partial<
    Pick<
      T,
      Extract<
        keyof T,
        "created_by" | "updated_by" | "organization_id" | "version" | "metadata"
      >
    >
  >;

/** `podcast.pc_articles` as a signed-out reader sees it. */
export type PcArticleDisplayRow = SignedOutReadable<PcArticle>;

// Accepts the display-column subset (the embed `show:pc_shows(...)` selects a
// partial pick; the canonical base columns added in the podcast-schema move are
// not needed for display mapping).
//
// DD-230: `created_by` is OPTIONAL here, and that is the type system finally
// stating the signed-out bound. `anon` may not read identity columns, so every
// public reader (/podcast, /podcast/[slug], feed.xml, chapters.json, /blog)
// hands this mapper a row that genuinely does not carry one. Requiring it made
// the narrowed selects un-typable and was the last thing standing between the
// public podcast surfaces and a working `select`.
type PcShowDisplayRow = SignedOutReadable<Pick<
  PcShowRow,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "image_url"
  | "og_image_url"
  | "thumbnail_url"
  | "author"
  | "is_published"
  | "rss_settings"
  | "created_at"
  | "updated_at"
  | "created_by"
>>;

export function mapPcShowRow(row: PcShowDisplayRow): PcShow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    image_url: row.image_url,
    og_image_url: row.og_image_url,
    thumbnail_url: row.thumbnail_url,
    author: row.author,
    is_published: row.is_published,
    // Absent for a signed-out reader by design (DD-230), never a lost value.
    created_by: row.created_by ?? null,
    rss_settings: parseRssSettings(row.rss_settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The episode columns the display mapper reads. `created_by` and `metadata` are
 * OPTIONAL for the same reason as on the show above (DD-230): `anon` holds
 * neither, so a public reader's row has neither, and `chapters` — which lives
 * inside `metadata` — is therefore null for a signed-out visitor by
 * construction. `chapters.json` documents that consequence at its 404.
 */
export type PcEpisodeDisplayRow = SignedOutReadable<PcEpisodeRow>;

export function mapPcEpisodeRow(row: PcEpisodeDisplayRow): PcEpisode {
  return {
    id: row.id,
    slug: row.slug,
    show_id: row.show_id,
    created_by: row.created_by ?? null,
    title: row.title,
    description: row.description,
    audio_url: row.audio_url,
    image_url: row.image_url,
    og_image_url: row.og_image_url,
    thumbnail_url: row.thumbnail_url,
    video_url: row.video_url,
    display_mode: isPcDisplayMode(row.display_mode)
      ? row.display_mode
      : "audio_only",
    episode_number: row.episode_number,
    duration_seconds: row.duration_seconds,
    host_count: row.host_count,
    speakers: parseSpeakers(row.speakers),
    script: row.script,
    chapters: parseChapters(row.metadata ?? null),
    is_published: row.is_published,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Supabase join row — `show` may be required with a partial column pick. */
export type PcEpisodeWithShowRowInput = PcEpisodeDisplayRow & {
  show?: Partial<PcShowRow> | null;
};

export function mapPcEpisodeWithShowRow(
  row: PcEpisodeWithShowRowInput,
): PcEpisodeWithShow {
  return {
    ...mapPcEpisodeRow(row),
    show:
      row.show && row.show.id && row.show.slug && row.show.title
        ? mapPcShowRow({
            id: row.show.id,
            slug: row.show.slug,
            title: row.show.title,
            description: row.show.description ?? null,
            image_url: row.show.image_url ?? null,
            og_image_url: row.show.og_image_url ?? null,
            thumbnail_url: row.show.thumbnail_url ?? null,
            author: row.show.author ?? null,
            is_published: row.show.is_published ?? false,
            created_by: row.show.created_by ?? null,
            rss_settings: row.show.rss_settings ?? null,
            created_at: row.show.created_at ?? "",
            updated_at: row.show.updated_at ?? "",
          })
        : null,
  };
}
