/**
 * `podcast_episode` (+ child `podcast_speaker`) — the terminal deliverable of
 * the podcast pipeline (`podcast.episode.generate`): script, audio, cast,
 * supporting artwork and clips, and the composed official video.
 *
 * PYTHON-OWNED: the seeded schema is `PodcastEpisodeOutput.model_json_schema()`
 * (aidream `services/podcast`); the `KindSchema` below mirrors that model.
 *
 * MEDIA IDENTITY. The payload carries durable public CDN URLs AND, since the
 * media-identity change, the cld_files ids behind them: `audio_file_id`,
 * `official_video_file_id`, and `image_file_ids` / `video_file_ids` paired
 * POSITIONALLY with their URL lists (an entry is `""` where the id was not
 * recoverable). The bridge pairs them here so no component re-does it, and
 * prefers the id — `<InlineMediaRef>` owns every URL decision from there, so
 * the card never writes a raw `src` and a URL that stops resolving heals
 * instead of breaking.
 *
 * NOT a duplicate of the podcast studio's episode surfaces: this renders the
 * RUN OUTPUT wherever a run is displayed (chat, live-run window, workflow
 * readout). Episode management lives in `features/podcasts/`.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import {
  optionalNumber,
  optionalString,
  stringList,
  stringOrEmpty,
} from "./media-io-shared";

// ---------------------------------------------------------------------------
// Schemas — mirror of PodcastSpeaker / PodcastEpisodeOutput.
// ---------------------------------------------------------------------------

export const podcastSpeakerKindSchema: KindSchema = {
  kind: "podcast_speaker",
  fields: {
    name: { type: "string", required: true, description: "Resolved speaker display name." },
    voice: { type: "string", description: "Resolved provider voice id used for this speaker." },
    gender: { type: "string", description: "Resolved gender label used for cast and voice matching." },
  },
};

export const podcastEpisodeKindSchema: KindSchema = {
  kind: "podcast_episode",
  fields: {
    show_id: { type: "string", required: true, description: "Podcast show containing the generated episode." },
    title: { type: "string" },
    description: { type: "string" },
    script: { type: "string", description: "Final speaker-labeled episode script." },
    speakers: { type: "array", itemKinds: ["podcast_speaker"], description: "Resolved cast in speaking-priority order." },
    host_count: { type: "number" },
    audio_url: { type: "string", description: "Durable public URL of the generated episode audio." },
    audio_file_id: {
      type: "string",
      description:
        "cld_files id of the episode audio — the durable handle. Empty when the audio is not one of our files.",
    },
    image_urls: { type: "string[]", description: "Durable public URLs of supporting generated images." },
    image_file_ids: {
      type: "string[]",
      description: 'cld_files ids paired positionally with image_urls; "" where the id is not recoverable.',
    },
    video_urls: { type: "string[]", description: "Durable public URLs of supporting generated video clips." },
    video_file_ids: {
      type: "string[]",
      description: 'cld_files ids paired positionally with video_urls; "" where the id is not recoverable.',
    },
    official_video_url: { type: "string", description: "Durable public URL of the composed official episode video." },
    official_video_file_id: {
      type: "string",
      description: "cld_files id of the composed official episode video, when it is ours.",
    },
    official_video_error: { type: "string", description: "Composition error when the official video could not be produced." },
    episode_id: { type: "string", nullable: true, description: "Persisted pc_episodes id, or null if persistence did not complete." },
    episode_slug: { type: "string", nullable: true, description: "Public episode slug, or null if persistence did not complete." },
  },
};

export const PODCAST_EPISODE_KIND_SCHEMAS: KindSchema[] = [
  podcastEpisodeKindSchema,
  podcastSpeakerKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

export interface PodcastSpeakerData {
  name: string;
  voice: string;
  gender: string;
}

export interface PodcastEpisodeData {
  show_id: string;
  title: string;
  description: string;
  script: string;
  speakers: PodcastSpeakerData[];
  host_count: number | null;
  /** What `<InlineMediaRef>` resolves for the episode audio — id first. */
  audioHandle: string | null;
  /** Image handles, id-first, in the payload's order. */
  imageHandles: string[];
  /** Clip handles, id-first, in the payload's order. */
  videoHandles: string[];
  /** The composed official video's handle — id first. */
  officialVideoHandle: string | null;
  official_video_error: string;
  episode_id: string | null;
  episode_slug: string | null;
  isComplete: boolean;
}

/**
 * Pair a URL list with its positionally-matched file-id list, preferring the
 * id. The producer writes `""` where an id was not recoverable, and the id
 * list can be shorter (or absent) on an older payload — both resolve to the
 * URL rather than dropping the item.
 */
export function pairHandles(urls: unknown, fileIds: unknown): string[] {
  const urlList = stringList(urls);
  const idList = Array.isArray(fileIds) ? fileIds : [];
  return urlList.map((url, index) => {
    const id = idList[index];
    return typeof id === "string" && id.trim() !== "" ? id : url;
  });
}

export function readPodcastSpeakerList(value: unknown): PodcastSpeakerData[] {
  if (!Array.isArray(value)) return [];
  const out: PodcastSpeakerData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = stringOrEmpty(entry.name);
    // Mid-stream a speaker object opens before `name` closes — a nameless
    // entry is dropped rather than rendered as a blank chip.
    if (!name) continue;
    out.push({ name, voice: stringOrEmpty(entry.voice), gender: stringOrEmpty(entry.gender) });
  }
  return out;
}

export function readPodcastEpisode(value: Record<string, unknown>): Omit<PodcastEpisodeData, "isComplete"> {
  return {
    show_id: stringOrEmpty(value.show_id),
    title: stringOrEmpty(value.title),
    description: stringOrEmpty(value.description),
    script: stringOrEmpty(value.script),
    speakers: readPodcastSpeakerList(value.speakers),
    host_count: optionalNumber(value.host_count),
    audioHandle: optionalString(value.audio_file_id) ?? optionalString(value.audio_url),
    imageHandles: pairHandles(value.image_urls, value.image_file_ids),
    videoHandles: pairHandles(value.video_urls, value.video_file_ids),
    officialVideoHandle:
      optionalString(value.official_video_file_id) ??
      optionalString(value.official_video_url),
    official_video_error: stringOrEmpty(value.official_video_error),
    episode_id: optionalString(value.episode_id),
    episode_slug: optionalString(value.episode_slug),
  };
}

export function podcastEpisodeServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PodcastEpisodeData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "podcast_episode") return undefined;
  return {
    ...readPodcastEpisode(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "show_id",
  "title",
  "description",
  "script",
  "speakers",
  "host_count",
  "audio_url",
  "audio_file_id",
  "image_urls",
  "image_file_ids",
  "video_urls",
  "video_file_ids",
  "official_video_url",
  "official_video_file_id",
  "official_video_error",
  "episode_id",
  "episode_slug",
];

export function podcastEpisodeMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const episode = readPodcastEpisode(value);
  const cast = episode.speakers.map((s) => s.name).join(", ");

  return joinBlocks([
    `# ${episode.title || "Podcast episode"}`,
    episode.description || null,
    cast ? `**Cast:** ${cast}` : null,
    optionalString(value.audio_url) ? `[Listen](${optionalString(value.audio_url)})` : null,
    optionalString(value.official_video_url)
      ? `[Official video](${optionalString(value.official_video_url)})`
      : null,
    episode.official_video_error ? `> Official video failed: ${episode.official_video_error}` : null,
    episode.script ? joinBlocks(["## Script", episode.script]) : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions.
// ---------------------------------------------------------------------------

export const PODCAST_EPISODE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "podcast_episode",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "podcast_episode",
    toLegacyServerData: podcastEpisodeServerDataFromEnvelope,
    toMarkdown: podcastEpisodeMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "media",
    schema: podcastEpisodeKindSchema,
  },
  {
    kind: "podcast_speaker",
    schemaSource: "system",
    tier: "eager",
    schema: podcastSpeakerKindSchema,
  },
];
