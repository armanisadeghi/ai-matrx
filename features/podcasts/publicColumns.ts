/**
 * THE COLUMNS THE SIGNED-OUT PODCAST SURFACES READ — one list, every public
 * podcast reader.
 *
 * WHY THIS FILE EXISTS (DD-230, 2026-09-14). Every public podcast route
 * (`/podcast`, `/podcast/[slug]`, its `feed.xml`, its `chapters.json`, its
 * `/blog`) reads through `utils/supabase/server`. A signed-out visitor carries
 * no cookie, so that client runs as `anon` — and `anon` holds a COLUMN grant on
 * these tables, not a table grant. PostgREST expands `select("*")` to every
 * column, so `*` asks for `organization_id`, `created_by`, `updated_by`,
 * `version` and `metadata` too, and the whole request comes back
 * **401 / 42501 permission denied** — not a narrowed row.
 *
 * That is not theoretical. Measured on production 2026-09-14 before this file
 * existed: `/podcast` rendered "No shows published yet. Be the first — create
 * one in the Studio." with four published shows in the table, and
 * `/podcast/<slug>/feed.xml` answered **404 "Podcast not found"** — because
 * every one of those routes asked for `*` and every one was refused. The
 * loaders swallowed the error and rendered their empty state, so the screen
 * lied and nothing anywhere said why (Supabase `edge_logs`, 24 h: seven
 * `pc_shows?select=*` and five `pc_episodes?select=*` 401s with no JWT).
 *
 * So: name the columns. These lists are EXACTLY the `anon` column grants in
 * `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE`, and
 * `features/podcasts/publicColumns.test.ts` fails if the two ever drift —
 * adding a column to the table can therefore never silently re-break the feed,
 * and revoking one can never silently 401 it.
 *
 * A public podcast reader must use these constants. Never `*`.
 */

/** `podcast.pc_shows` — the 14 columns `anon` may read. */
export const PC_SHOW_PUBLIC_COLUMNS = [
  "id",
  "slug",
  "title",
  "description",
  "image_url",
  "author",
  "is_published",
  "created_at",
  "updated_at",
  "og_image_url",
  "thumbnail_url",
  "rss_settings",
  "deleted_at",
  "visibility",
] as const;

/** `podcast.pc_episodes` — the 21 columns `anon` may read. */
export const PC_EPISODE_PUBLIC_COLUMNS = [
  "id",
  "slug",
  "show_id",
  "title",
  "description",
  "audio_url",
  "image_url",
  "video_url",
  "display_mode",
  "episode_number",
  "duration_seconds",
  "is_published",
  "created_at",
  "updated_at",
  "og_image_url",
  "thumbnail_url",
  "host_count",
  "speakers",
  "script",
  "deleted_at",
  "visibility",
] as const;

/** `podcast.pc_articles` — the 14 columns `anon` may read. */
export const PC_ARTICLE_PUBLIC_COLUMNS = [
  "id",
  "show_id",
  "episode_id",
  "kind",
  "slug",
  "title",
  "content_markdown",
  "og_image_url",
  "canonical_url",
  "status",
  "created_at",
  "updated_at",
  "deleted_at",
  "visibility",
] as const;

/**
 * The same three lists as PostgREST `select` strings. Written out as literals
 * (not `join(",")`) so supabase-js can infer the row type at compile time — the
 * same reason `features/education/publishing/publicColumns.ts` does.
 */
export const PC_SHOW_PUBLIC_SELECT =
  "id,slug,title,description,image_url,author,is_published,created_at,updated_at,og_image_url,thumbnail_url,rss_settings,deleted_at,visibility";

export const PC_EPISODE_PUBLIC_SELECT =
  "id,slug,show_id,title,description,audio_url,image_url,video_url,display_mode,episode_number,duration_seconds,is_published,created_at,updated_at,og_image_url,thumbnail_url,host_count,speakers,script,deleted_at,visibility";

export const PC_ARTICLE_PUBLIC_SELECT =
  "id,show_id,episode_id,kind,slug,title,content_markdown,og_image_url,canonical_url,status,created_at,updated_at,deleted_at,visibility";

/**
 * An episode joined to its show, for the public episode page and the blog
 * route. The embedded show columns are a subset of `PC_SHOW_PUBLIC_COLUMNS`
 * (an embed is refused for exactly the same reason a top-level `*` is).
 */
export const PC_EPISODE_WITH_SHOW_PUBLIC_SELECT =
  `${PC_EPISODE_PUBLIC_SELECT},show:pc_shows(id,slug,title,description,image_url,og_image_url,thumbnail_url,author,is_published,created_at,updated_at)`;
