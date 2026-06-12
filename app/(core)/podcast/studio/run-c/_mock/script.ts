// app/(core)/podcast/studio/run-c/_mock/script.ts
//
// The mock event timeline for the run-c demo. Each entry is a real
// PodcastDataEvent (from the generator feature) plus the delay (ms, from start)
// at which it should fire. The whole sequence plays in ~45s and is fed through
// the REAL reduce() so the redesign binds to the genuine run-state contract.

import type { PodcastDataEvent } from "@/features/podcasts/generator/types";

export interface ScheduledEvent {
  /** ms from playback start. */
  at: number;
  event: PodcastDataEvent;
}

const TOTAL = 9; // total pipeline steps the backend "reports"

// Helper to keep the timeline readable.
function started(
  stage: string,
  label: string,
  step: number,
  at: number,
): ScheduledEvent {
  return {
    at,
    event: { type: "podcast_stage_started", stage, label, step, total: TOTAL },
  };
}
function done(
  stage: string,
  label: string,
  step: number,
  at: number,
  output?: string,
): ScheduledEvent {
  return {
    at,
    event: {
      type: "podcast_stage",
      stage,
      label,
      success: true,
      step,
      total: TOTAL,
      output,
    },
  };
}

const SOURCE_PREVIEW =
  "CRISPR-Cas9 is a precise gene-editing tool adapted from a bacterial immune defense. A guide RNA steers the Cas9 enzyme to a matching DNA sequence, where it makes a targeted cut the cell then repairs — letting researchers disable, correct, or insert genes with unprecedented accuracy.";

const SCRIPT_PREVIEW =
  "ALEX: So picture a pair of molecular scissors that you can program to cut exactly one spot in three billion letters of DNA. MORGAN: That's the part that still blows my mind — the targeting comes from a tiny strand of RNA. ALEX: Right, the guide RNA. It's basically the address label…";

// picsum gives deterministic placeholder art per seed.
const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`;

export const MOCK_TIMELINE: ScheduledEvent[] = [
  // 0 — run handshake
  { at: 300, event: { type: "podcast_run", run_id: "demo-run-c", total: TOTAL } },

  // 1 — prepare content (prepare kind)
  started("prepare_content", "Preparing content", 1, 800),
  done("prepare_content", "Preparing content", 1, 5200, SOURCE_PREVIEW),

  // 2 — research (research kind)
  started("prepare_content_researcher", "Researching the topic", 2, 5400),
  done("prepare_content_researcher", "Researching the topic", 2, 11000, SOURCE_PREVIEW),

  // 3 — script (script kind)
  started("create_script", "Writing the script", 3, 11200),
  done("create_script", "Writing the script", 3, 17000, SCRIPT_PREVIEW),

  // 4 — metadata (metadata kind) + the metadata payload mid-stage
  started("generate_metadata", "Generating title, cover & video concepts", 4, 17200),
  {
    at: 19500,
    event: {
      type: "podcast_metadata",
      title: "How CRISPR Gene Editing Actually Works",
      description:
        "A two-host deep dive into the molecular scissors rewriting biology — what CRISPR is, how the guide RNA finds its target, and why it changed medicine.",
      image_descriptions: [
        "Glowing DNA double helix with a molecular scissors motif, dark teal studio backdrop",
        "Stylized Cas9 enzyme docking onto a strand of DNA, neon accent lighting",
      ],
      video_descriptions: [
        "Animated guide-RNA steering Cas9 along a DNA strand to a cut site",
      ],
    },
  },
  done("generate_metadata", "Generating title, cover & video concepts", 4, 22000),

  // 5 — images (image kind) — two slots, landing as assets
  started("image_0", "Cover art — concept 1", 5, 22200),
  started("image_1", "Cover art — concept 2", 6, 22400),
  {
    at: 27000,
    event: {
      type: "podcast_asset",
      asset_kind: "image",
      index: 0,
      url: img("crispr-cover-a"),
      prompt: "Glowing DNA double helix with molecular scissors",
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
      prompt: "Stylized Cas9 enzyme docking onto DNA",
      success: true,
    },
  },

  // 6 — video (video kind) — one slot
  started("video_0", "Producing the cover video", 7, 29700),
  {
    at: 35000,
    event: {
      type: "podcast_asset",
      asset_kind: "video",
      index: 0,
      url: img("crispr-video-frame"),
      prompt: "Animated guide-RNA steering Cas9 along DNA",
      success: true,
    },
  },

  // 7 — audio (audio kind)
  started("create_audio", "Producing the audio", 8, 35200),
  done("create_audio", "Producing the audio", 8, 42000),

  // complete
  {
    at: 43000,
    event: {
      type: "podcast_complete",
      show_id: "s1",
      success: true,
      episode_id: "demo-episode-c",
      episode_slug: "how-crispr-gene-editing-actually-works",
      script: SCRIPT_PREVIEW,
      audio_url: "https://example.com/demo/crispr-episode.mp3",
      title: "How CRISPR Gene Editing Actually Works",
      description:
        "A two-host deep dive into the molecular scissors rewriting biology.",
      image_urls: [img("crispr-cover-a"), img("crispr-cover-b")],
      video_urls: [img("crispr-video-frame")],
    },
  },
];

/** Total runtime of the timeline in ms. */
export const MOCK_DURATION =
  MOCK_TIMELINE.reduce((max, e) => Math.max(max, e.at), 0) + 1500;
