/**
 * Surface manifest — Podcasts hub (`matrx-user/podcast`).
 *
 * Drives `/podcast` — the feature's LIST-view front door: the signed-in user's
 * own shows (including unpublished drafts) and episode library, plus the
 * platform's published catalog. Server-rendered published shows
 * (`app/(core)/podcast/page.tsx`) + the client library from
 * `features/podcasts/hooks/useMyPodcasts.ts`.
 *
 * MEDIA DOCTRINE: this surface emits NO media URLs. Cover art, audio, and video
 * on `pc_shows` / `pc_episodes` are render-time refs resolved through
 * `<InlineMediaRef>`; a signed S3 URL expires and must never enter agent
 * context or be persisted (see `features/surfaces/manifests/files.manifest.ts`
 * `durablePublicUrl` and root `FOUND_DEFECTS.md` D1). Agents that need artwork
 * resolve it from the show/episode id.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "my_library",
    label: "My library",
    sortOrder: 100,
    description:
      "The signed-in user's own shows and episodes, including unpublished drafts only they can see.",
  },
  {
    key: "platform_catalog",
    label: "Platform catalog",
    sortOrder: 200,
    description:
      "Published shows anyone on the platform can listen to (the user's own are listed separately).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── My library ────────────────────────────────────────────────────────
  {
    name: "my_shows",
    label: "My shows",
    description:
      "Shows the user owns (created_by) or hosts an episode in, as listed under 'Your podcasts': per show its id, slug, title, description, author, and is_published. Empty array when the user has created none, or while the library is still loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 300,
    group: "my_library",
  },
  {
    name: "my_show_count",
    label: "My show count",
    description:
      "Number of shows in the user's own library. Zero when they have created none; always present once the page renders (0 while loading).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "my_library",
  },
  {
    name: "my_episodes",
    label: "My episodes",
    description:
      "Every episode the user has created (pc_episodes.user_id), newest first: per episode its id, slug, title, show_id, episode_number, duration_seconds, host_count, and is_published. Empty array when they have none. Bindable-only — the list grows unbounded with the user's library.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 320,
    group: "my_library",
  },
  {
    name: "my_episode_count",
    label: "My episode count",
    description:
      "Number of episodes the user has created. Zero when they have none; always present once the page renders (0 while loading).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "my_library",
  },
  {
    name: "library_loading",
    label: "Library loading",
    description:
      "True while the user's own shows/episodes are still being fetched — the counts and lists are provisional until it is false. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "my_library",
  },
  {
    name: "library_error",
    label: "Library error",
    description:
      "Error message from the user's library fetch, when it failed. Empty when the load succeeded (the published catalog still renders in that case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 350,
    group: "my_library",
  },

  // ── Platform catalog ──────────────────────────────────────────────────
  {
    name: "published_shows",
    label: "Published shows",
    description:
      "The published catalog rendered under 'On the platform' (the user's own shows removed): per show its id, slug, title, description, and author. Empty array when nothing is published platform-wide. Bindable-only — the catalog grows unbounded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 400,
    group: "platform_catalog",
  },
  {
    name: "published_show_count",
    label: "Published show count",
    description:
      "Number of published shows listed under 'On the platform' after the user's own are filtered out. Always present once the page renders.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "platform_catalog",
  },
];

export const podcastManifest: SurfaceManifest = {
  surfaceName: "matrx-user/podcast",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter (PodcastIndexClient) are wired and complete against what the page loads. Not yet DB-synced, not yet in route-to-surface.ts, and no agent roles are bound — promote to verified after the sync + a live binding test.",
  label: "Podcasts",
  urlPattern: "/podcast",
  intro: `<surface_intro>
You are on the Podcasts hub — the front door of the podcast system, a LIST view, not a single record.
Two distinct collections live here: my_shows / my_episodes are the signed-in user's OWN library (including unpublished drafts nobody else can see), and published_shows is the platform's public catalog with the user's own shows removed. Never conflate the two: "my podcasts" means the first, "what's on the platform" means the second.
Nothing here is a media file. This surface deliberately emits no cover, audio, or video URLs — those expire. Work from ids and titles, and let the UI resolve artwork.
From here the user creates a new episode in the Studio (/podcast/studio/create) or opens a show. If asked to make something, point at the Studio rather than inventing a generation path.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One show entry as emitted in `my_shows` / `published_shows`. */
export interface PodcastHubShowEntry {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  is_published: boolean;
}

/** One episode entry as emitted in `my_episodes`. */
export interface PodcastHubEpisodeEntry {
  id: string;
  slug: string;
  title: string;
  show_id: string | null;
  episode_number: number | null;
  duration_seconds: number | null;
  host_count: number | null;
  is_published: boolean;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createPodcastScope(values: {
  my_show_count: number;
  my_episode_count: number;
  library_loading: boolean;
  published_show_count: number;
  my_shows?: PodcastHubShowEntry[];
  my_episodes?: PodcastHubEpisodeEntry[];
  library_error?: string;
  published_shows?: PodcastHubShowEntry[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
