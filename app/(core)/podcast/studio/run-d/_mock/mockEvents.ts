// app/(core)/podcast/studio/run-d/_mock/mockEvents.ts
//
// The mock event script for the demo run page. Each entry is a real
// PodcastDataEvent (the exact shapes the backend emits) paired with a delay
// (ms after the previous event). Fed through the real `reduce()` so the demo
// drives the genuine PodcastRunState — the presentation layer can be promoted
// unchanged.
//
// Sequence (~45s total): 7 pipeline stages covering every loader kind —
// prepare / research / script / metadata / image / video / audio — with a
// metadata burst midway and assets landing as they "render".

import type { PodcastDataEvent } from "@/features/podcasts/generator/types";

export interface MockEvent {
  /** Milliseconds to wait AFTER the previous event before firing this one. */
  delay: number;
  event: PodcastDataEvent;
}

const TOTAL = 9;

// Placeholder media (stable seeds so reruns look identical).
const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/450`;

export const MOCK_RUN_ID = "demo-run-d";

export const MOCK_EVENTS: MockEvent[] = [
  // 1 — Prepare the source content.
  {
    delay: 400,
    event: {
      type: "podcast_stage_started",
      stage: "prepare_content",
      label: "Preparing content",
      step: 1,
      total: TOTAL,
    },
  },
  {
    delay: 4200,
    event: {
      type: "podcast_stage",
      stage: "prepare_content",
      label: "Preparing content",
      success: true,
      output:
        "Gene editing with CRISPR-Cas9 lets scientists make precise cuts in DNA, guided by a short RNA sequence. The system was adapted from a bacterial immune defense and has rapidly become the most accessible tool in molecular biology.",
      step: 1,
      total: TOTAL,
    },
  },

  // 2 — Research the topic.
  {
    delay: 500,
    event: {
      type: "podcast_stage_started",
      stage: "prepare_content_researcher",
      label: "Researching the topic",
      step: 2,
      total: TOTAL,
    },
  },
  {
    delay: 5000,
    event: {
      type: "podcast_stage",
      stage: "prepare_content_researcher",
      label: "Researching the topic",
      success: true,
      step: 2,
      total: TOTAL,
    },
  },

  // 3 — Write the script.
  {
    delay: 500,
    event: {
      type: "podcast_stage_started",
      stage: "create_script",
      label: "Writing the script",
      step: 3,
      total: TOTAL,
    },
  },
  {
    delay: 5500,
    event: {
      type: "podcast_stage",
      stage: "create_script",
      label: "Writing the script",
      success: true,
      output:
        "ALEX: So when people hear \"gene editing,\" they picture something out of science fiction — but the reality is almost more incredible.\nJORDAN: Right, and the wild part is that the whole thing was borrowed from bacteria. They've been doing this for billions of years.\nALEX: Exactly. CRISPR is essentially a search-and-replace function for the genome…",
      step: 3,
      total: TOTAL,
    },
  },

  // 4 — Generate metadata (title, cover & video concepts).
  {
    delay: 500,
    event: {
      type: "podcast_stage_started",
      stage: "generate_metadata",
      label: "Generating title, cover & video concepts",
      step: 4,
      total: TOTAL,
    },
  },
  // Metadata burst — title + description + asset prompts arrive.
  {
    delay: 3200,
    event: {
      type: "podcast_metadata",
      title: "CRISPR, Explained: The Search-and-Replace for Life",
      description:
        "Two hosts unpack how a bacterial defense system became biology's most powerful editing tool — what it can do today, where it's headed, and why it matters for medicine.",
      image_descriptions: [
        "A glowing double helix being precisely cut, cinematic lighting",
        "Abstract macro of DNA strands in cool blues and teals",
      ],
      video_descriptions: ["Slow rotating 3D render of a DNA molecule unwinding"],
    },
  },
  {
    delay: 1000,
    event: {
      type: "podcast_stage",
      stage: "generate_metadata",
      label: "Generating title, cover & video concepts",
      success: true,
      step: 4,
      total: TOTAL,
    },
  },

  // 5 — Cover images (two slots, stream as they land).
  {
    delay: 400,
    event: {
      type: "podcast_stage_started",
      stage: "image_0",
      label: "Rendering cover art 1",
      step: 5,
      total: TOTAL,
    },
  },
  {
    delay: 300,
    event: {
      type: "podcast_stage_started",
      stage: "image_1",
      label: "Rendering cover art 2",
      step: 6,
      total: TOTAL,
    },
  },
  {
    delay: 4200,
    event: {
      type: "podcast_asset",
      asset_kind: "image",
      index: 0,
      url: img("crispr-cover-a"),
      prompt: "A glowing double helix being precisely cut, cinematic lighting",
      success: true,
    },
  },
  {
    delay: 2200,
    event: {
      type: "podcast_asset",
      asset_kind: "image",
      index: 1,
      url: img("crispr-cover-b"),
      prompt: "Abstract macro of DNA strands in cool blues and teals",
      success: true,
    },
  },

  // 6 — Video clip.
  {
    delay: 500,
    event: {
      type: "podcast_stage_started",
      stage: "video_0",
      label: "Producing video clip 1",
      step: 7,
      total: TOTAL,
    },
  },
  {
    delay: 5000,
    event: {
      type: "podcast_asset",
      asset_kind: "video",
      index: 0,
      url: img("crispr-video-a"),
      prompt: "Slow rotating 3D render of a DNA molecule unwinding",
      success: true,
    },
  },

  // 7 — Produce the audio.
  {
    delay: 500,
    event: {
      type: "podcast_stage_started",
      stage: "create_audio",
      label: "Producing the audio",
      step: 8,
      total: TOTAL,
    },
  },
  {
    delay: 6000,
    event: {
      type: "podcast_stage",
      stage: "create_audio",
      label: "Producing the audio",
      success: true,
      step: 8,
      total: TOTAL,
    },
  },

  // Complete.
  {
    delay: 900,
    event: {
      type: "podcast_complete",
      show_id: "show-1",
      success: true,
      episode_id: "demo-episode-a",
      episode_slug: "crispr-explained",
      script:
        "ALEX: So when people hear \"gene editing,\" they picture something out of science fiction — but the reality is almost more incredible.\nJORDAN: Right, and the wild part is that the whole thing was borrowed from bacteria. They've been doing this for billions of years.\nALEX: Exactly. CRISPR is essentially a search-and-replace function for the genome. You give it an address, and it finds that exact spot in three billion letters of DNA.\nJORDAN: Which a decade ago would have sounded impossible. Let's get into how it actually works…",
      audio_url: "https://download.samplelib.com/mp3/sample-15s.mp3",
      title: "CRISPR, Explained: The Search-and-Replace for Life",
      description:
        "Two hosts unpack how a bacterial defense system became biology's most powerful editing tool — what it can do today, where it's headed, and why it matters for medicine.",
      image_urls: [img("crispr-cover-a"), img("crispr-cover-b")],
      video_urls: [img("crispr-video-a")],
    },
  },
];
