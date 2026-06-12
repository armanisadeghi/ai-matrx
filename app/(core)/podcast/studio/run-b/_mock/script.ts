// run-b — the mock event script.
//
// A realistic, time-ordered sequence of the REAL podcast stream events
// (PodcastDataEvent shapes from generator/types.ts). The player (useMockRun)
// fires each one on its `at` offset, feeding it through the REAL reduce() so the
// whole production state machine is exercised — only the event SOURCE is mocked.
//
// Compressed to ~45s so the animation can be watched start-to-finish on demand.

import type { PodcastDataEvent } from "@/features/podcasts/generator/types";

const TOTAL = 7;

const PLACEHOLDER_AUDIO =
  "https://download.samplelib.com/mp3/sample-15s.mp3";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`;

export interface ScriptedEvent {
  /** Milliseconds after replay start. */
  at: number;
  event: PodcastDataEvent;
}

const SCRIPT_PREVIEW =
  "HOST A: So CRISPR — everyone's heard the name, but what is it actually " +
  "doing inside a cell?  HOST B: Right, and the wild part is it's borrowed " +
  "straight from bacteria. They've been using it as an immune system for a " +
  "billion years…";

const SOURCE_PREVIEW =
  "Gene editing with CRISPR-Cas9 lets researchers make precise cuts in DNA at " +
  "a chosen location. A guide RNA matches the target sequence; the Cas9 enzyme " +
  "makes the cut; the cell's repair machinery does the rest.";

// step numbers are 1-based to match the backend.
export const MOCK_SCRIPT: ScriptedEvent[] = [
  // Run handshake.
  { at: 200, event: { type: "podcast_run", run_id: "demo-run-b", total: TOTAL } },

  // 1 — prepare content.
  {
    at: 600,
    event: {
      type: "podcast_stage_started",
      stage: "prepare_content",
      label: "Preparing content",
      step: 1,
      total: TOTAL,
    },
  },
  {
    at: 5200,
    event: {
      type: "podcast_stage",
      stage: "prepare_content",
      label: "Preparing content",
      success: true,
      output: SOURCE_PREVIEW,
      step: 1,
      total: TOTAL,
    },
  },

  // 2 — researcher.
  {
    at: 5400,
    event: {
      type: "podcast_stage_started",
      stage: "prepare_content_researcher",
      label: "Researching the topic",
      step: 2,
      total: TOTAL,
    },
  },
  {
    at: 11000,
    event: {
      type: "podcast_stage",
      stage: "prepare_content_researcher",
      label: "Researching the topic",
      success: true,
      step: 2,
      total: TOTAL,
    },
  },

  // 3 — script.
  {
    at: 11200,
    event: {
      type: "podcast_stage_started",
      stage: "create_script",
      label: "Writing the script",
      step: 3,
      total: TOTAL,
    },
  },
  {
    at: 17000,
    event: {
      type: "podcast_stage",
      stage: "create_script",
      label: "Writing the script",
      success: true,
      output: SCRIPT_PREVIEW,
      step: 3,
      total: TOTAL,
    },
  },

  // 4 — metadata stage + the metadata payload (title/desc/asset concepts).
  {
    at: 17200,
    event: {
      type: "podcast_stage_started",
      stage: "generate_metadata",
      label: "Generating title, cover & video concepts",
      step: 4,
      total: TOTAL,
    },
  },
  {
    at: 21000,
    event: {
      type: "podcast_metadata",
      title: "CRISPR, Decoded: The Tiny Scissors Rewriting Life",
      description:
        "How a bacterial immune system became the most precise gene-editing " +
        "tool ever built — and what it means for medicine, food, and ethics.",
      image_descriptions: [
        "A glowing DNA double helix being precisely cut by molecular scissors",
        "Abstract bacteria defending against a virus, neon biotech palette",
      ],
      video_descriptions: ["Animated walkthrough of a Cas9 cut, cinematic"],
    },
  },
  {
    at: 22000,
    event: {
      type: "podcast_stage",
      stage: "generate_metadata",
      label: "Generating title, cover & video concepts",
      success: true,
      step: 4,
      total: TOTAL,
    },
  },

  // 5 — images (two slots, stream as they land).
  {
    at: 22200,
    event: {
      type: "podcast_stage_started",
      stage: "image_0",
      label: "Rendering cover art 1",
      step: 5,
      total: TOTAL,
    },
  },
  {
    at: 22400,
    event: {
      type: "podcast_stage_started",
      stage: "image_1",
      label: "Rendering cover art 2",
      step: 5,
      total: TOTAL,
    },
  },
  {
    at: 27000,
    event: {
      type: "podcast_asset",
      asset_kind: "image",
      index: 0,
      url: img("crispr-cover-a"),
      prompt: "A glowing DNA double helix being precisely cut",
      success: true,
    },
  },
  {
    at: 29500,
    event: {
      type: "podcast_asset",
      asset_kind: "image",
      index: 1,
      url: img("crispr-cover-b"),
      prompt: "Abstract bacteria defending against a virus",
      success: true,
    },
  },

  // 6 — video.
  {
    at: 29700,
    event: {
      type: "podcast_stage_started",
      stage: "video_0",
      label: "Producing the trailer video",
      step: 6,
      total: TOTAL,
    },
  },
  {
    at: 35000,
    event: {
      type: "podcast_asset",
      asset_kind: "video",
      index: 0,
      url: img("crispr-video"),
      prompt: "Animated walkthrough of a Cas9 cut",
      success: true,
    },
  },

  // 7 — audio.
  {
    at: 35200,
    event: {
      type: "podcast_stage_started",
      stage: "create_audio",
      label: "Producing the audio",
      step: 7,
      total: TOTAL,
    },
  },
  {
    at: 42000,
    event: {
      type: "podcast_stage",
      stage: "create_audio",
      label: "Producing the audio",
      success: true,
      step: 7,
      total: TOTAL,
    },
  },

  // Complete.
  {
    at: 43000,
    event: {
      type: "podcast_complete",
      show_id: null,
      success: true,
      episode_id: "demo-episode-b",
      episode_slug: "crispr-decoded",
      script:
        SCRIPT_PREVIEW +
        "\n\nHOST A: Let's break down exactly how the guide RNA finds its " +
        "target…\n\nHOST B: And why the off-target problem is the whole ball " +
        "game for safety.",
      audio_url: PLACEHOLDER_AUDIO,
      title: "CRISPR, Decoded: The Tiny Scissors Rewriting Life",
      description:
        "How a bacterial immune system became the most precise gene-editing " +
        "tool ever built — and what it means for medicine, food, and ethics.",
      image_urls: [img("crispr-cover-a"), img("crispr-cover-b")],
      video_urls: [img("crispr-video")],
    },
  },
];

export const MOCK_RUN_DURATION = 44000;
