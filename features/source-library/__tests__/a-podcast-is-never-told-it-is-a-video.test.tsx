/**
 * N6 (jobs-bar cold-walk-13): A PODCAST'S DIALOGS CALLED ITS EPISODES "VIDEOS"
 * SEVEN TIMES — in the BODIES, under headers walk 12 had already fixed.
 *
 * What the walk measured, verbatim, on a podcast Library of 2,981 episodes:
 *
 *   "Add every selected video to a Rulebook as a Source, with sentence-level
 *    provenance back to the exact moment in the video."
 *   "3 of the 3 selected videos have no transcript yet … the free lane costs
 *    nothing for any video with captions"
 *   "0 videos, 0.0 hours of video, priced at $0.012-$0.03 per minute of video"
 *   "3 videos have not been checked for captions yet."
 *
 * Every one of those is a sentence the SERVER wrote. The headers were right
 * because they are written in the client from `vocabulary.ts`; the bodies were
 * wrong because they were printed verbatim from a global Action registry that
 * has no Library and therefore no adapter. Walk 12's fix could not have
 * reached them, and a future one would drift again — so the class fix is that
 * the server writes NOUN TOKENS and `speakMediaNouns` is the only place they
 * become words, from the SAME table the headers read.
 *
 * WHAT THIS GUARDS, and why each half matters:
 *   1. Substitution — a podcast never reads "video", a blog never reads
 *      "episode", and the neutral fallback never reads either.
 *   2. No token ever reaches a person's eyes from the dialog's own render
 *      path. A missed call site is invisible in review and obvious on screen.
 *   3. An UNKNOWN token is left intact rather than blanked, so a server ahead
 *      of this client is loud instead of quietly ungrammatical.
 *
 * RED PROOFS:
 *   - Delete the `speakMediaNouns(...)` wrapper around `action.description` in
 *     `ActionRunDialog.tsx` → "the dialog body speaks the Library's noun"
 *     fails with the raw `{item}` on screen.
 *   - In `vocabulary.ts`, make the unknown-token branch return "" instead of
 *     the token → "a token this build does not know is left intact" fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { ActionRunDialog } from "../components/ActionRunDialog";
import { sourceVocabulary, speakMediaNouns } from "../vocabulary";
import type { LibraryRow, ActionDeclaration, EstimateResult } from "../types";

const PODCAST = { adapter: "podcast_rss" } as unknown as LibraryRow;
const CHANNEL = { adapter: "youtube" } as unknown as LibraryRow;
const BLOG = { adapter: "blog_feed" } as unknown as LibraryRow;

describe("speakMediaNouns — one table, every sentence", () => {
  const SENTENCE =
    "Add every selected {item} to a Rulebook as a Source, with sentence-level " +
    "provenance back to the exact moment in the {item}. {Items} already done " +
    "are skipped, and the free lane reads {free_captions_source}.";

  test("a podcast is never told it is a video", () => {
    const said = speakMediaNouns(SENTENCE, sourceVocabulary(PODCAST));
    expect(said).not.toMatch(/video/i);
    expect(said).toContain("every selected episode");
    expect(said).toContain("the exact moment in the episode");
    expect(said).toContain("Episodes already done");
    expect(said).toContain("the show's own published transcript");
  });

  test("a channel still says video, and a blog says post", () => {
    expect(speakMediaNouns(SENTENCE, sourceVocabulary(CHANNEL))).toContain(
      "every selected video",
    );
    const blog = speakMediaNouns(SENTENCE, sourceVocabulary(BLOG));
    expect(blog).toContain("every selected post");
    expect(blog).not.toMatch(/video|episode/i);
  });

  test("a Library whose row has not arrived says neither", () => {
    const said = speakMediaNouns(SENTENCE, sourceVocabulary(null));
    expect(said).not.toMatch(/video|episode|post/i);
    expect(said).toContain("every selected item");
    // A Library with no free lane still reads as a sentence, and names no
    // provider it does not have.
    expect(said).toContain("captions it already has");
  });

  test("a token this build does not know is left intact, never blanked", () => {
    const said = speakMediaNouns(
      "Priced per minute of {item} on {some_future_thing}.",
      sourceVocabulary(PODCAST),
    );
    expect(said).toContain("per minute of episode");
    expect(said).toContain("{some_future_thing}");
  });
});

describe("the Transcribe dialog, rendered over a podcast", () => {
  let host: HTMLDivElement;
  let root: Root;

  const ACTION = {
    key: "transcribe",
    label: "Transcribe",
    description:
      "Get a timestamped transcript for every selected {item} — free from " +
      "{free_captions_source} where they exist, and by having a model watch " +
      "the {item} where they do not.",
    scope: "per_item",
    cost_class: "mixed",
    requires_estimate: true,
    requires_transcripts: false,
    params_schema: {},
    produces: ["transcript"],
    available: true,
  } as unknown as ActionDeclaration;

  const ESTIMATE = {
    action: "transcribe",
    selected_count: 3,
    already_done: 0,
    free_count: 3,
    paid_count: 0,
    skipped_count: 0,
    cost: {
      currency: "USD",
      free_cost: 0,
      paid_cost_estimate: 0,
      paid_cost_low: 0,
      paid_cost_high: 0,
      confidence: "rough",
      basis:
        "0 {items}, 0.0 hours of {item}, priced at $0.012-$0.03 per minute " +
        "of {item} for a model that watches each {item}.",
    },
    time: {
      free_seconds_estimate: 12,
      paid_seconds_estimate: 0,
      wall_seconds_estimate: 12,
      parallelism: 8,
    },
    warnings: ["3 {items} have not been checked for captions yet."],
    requires_confirmation: false,
    estimate_token: "t",
    fingerprint: "f",
  } as unknown as EstimateResult;

  beforeEach(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <ActionRunDialog
          open
          action={ACTION}
          selectionCount={3}
          selectionMode="ids"
          vocabulary={sourceVocabulary(PODCAST)}
          estimate={ESTIMATE}
          estimateLoading={false}
          estimateError={null}
          estimateRemedy={null}
          params={{}}
          onParamsChange={() => undefined}
          submitting={false}
          submitError={null}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  function onScreen(): string {
    // The dialog portals out of `host`, so the assertion reads the document.
    return document.body.textContent ?? "";
  }

  test("the dialog body speaks the Library's noun, not YouTube's", () => {
    const text = onScreen();
    expect(text).toContain("Transcribe 3 episodes");
    expect(text).toContain("every selected episode");
    expect(text).toContain("3 episodes have not been checked for captions yet");
    expect(text).not.toMatch(/video/i);
  });

  test("no noun token ever reaches the screen", () => {
    expect(onScreen()).not.toMatch(/\{(item|items|Item|Items|free_captions_source)\}/);
  });
});
