/**
 * A SUMMARY NEVER CONTRADICTS THE STEPS RENDERED UNDER IT — a forcing function.
 *
 * Cold walk, 2026-09-16, finding #2: the Masterwork Quick Build dialog showed,
 * at the same moment on the same screen:
 *
 *   header : "Still building after 2 minutes — longer than usual. Nothing has
 *             failed, and it keeps going without you."
 *   step 2 : "Failed", in red, directly below it.
 *
 * The reassurance was computed from elapsed time alone and never consulted the
 * step states the very same dialog was rendering. A screen is absent or
 * honest, never lying (law #4).
 *
 * What this holds down, for EVERY consumer of the canonical progress surface:
 *
 *   1. When a rendered step is failed, the summary does not claim nothing has
 *      failed — no matter what the caller passed as a description.
 *   2. The summary names the step that failed, so the Expert knows WHERE.
 *   3. It says what the Expert can do about it — a stand-in that announces
 *      itself without a remedy is still a dead end.
 *   4. A run with no failed step keeps the caller's own sentence untouched.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LiveRunProgress,
  type LiveRunProgressState,
} from "@/features/agents/components/live-run/LiveRunProgress";

const textOf = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * The summary paragraph ALONE — the sentence the person reads above the rows.
 * Asserting on whole-page text would let a step row's own words satisfy a
 * claim about the summary, which is the exact confusion this guard exists to
 * prevent.
 */
const summaryOf = (progress: LiveRunProgressState) => {
  const markup = renderToStaticMarkup(<LiveRunProgress progress={progress} />);
  const match = markup.match(
    /<p class="mt-1 text-sm[^"]*">([\s\S]*?)<\/p>/,
  );
  if (!match) throw new Error("the progress surface rendered no summary at all");
  return textOf(match[1]);
};

/** The exact screen from the cold walk: the reassurance beside a failed row. */
const QUICK_BUILD_WITH_A_FAILED_STEP: LiveRunProgressState = {
  title: "Quick Build",
  // Ordered milestones — a Build's step 3 really does need step 2.
  shape: "sequence",
  description:
    "Still building after 2 minutes — longer than usual. Nothing has failed, and it keeps going without you.",
  items: [
    {
      id: "rules",
      label: "Reading the rules you approved",
      status: "completed",
    },
    {
      id: "parts",
      label: "Building the parts that do the work, and checking they fit",
      status: "failed",
    },
    { id: "saved", label: "Saving it to your library", status: "waiting" },
  ],
};

describe("the progress summary and the steps under it are one truth", () => {
  const summary = () => summaryOf(QUICK_BUILD_WITH_A_FAILED_STEP);

  it("renders the failed step, so the contradiction is real", () => {
    const page = textOf(
      renderToStaticMarkup(
        <LiveRunProgress progress={QUICK_BUILD_WITH_A_FAILED_STEP} />,
      ),
    );
    expect(page).toContain("failed");
  });

  it("never claims nothing failed while a step on screen reads Failed", () => {
    expect(summary()).not.toMatch(/nothing (has )?failed/i);
  });

  it("names the step that failed, so the Expert knows where it stopped", () => {
    expect(summary()).toContain(
      "Building the parts that do the work, and checking they fit",
    );
  });

  it("says what the Expert can do about it", () => {
    expect(summary()).toMatch(/try (it )?again/i);
  });

  it("leaves an honest run's own sentence alone", () => {
    const healthy: LiveRunProgressState = {
      ...QUICK_BUILD_WITH_A_FAILED_STEP,
      items: QUICK_BUILD_WITH_A_FAILED_STEP.items.map((item) =>
        item.status === "failed" ? { ...item, status: "running" } : item,
      ),
    };
    expect(summaryOf(healthy)).toBe(
      QUICK_BUILD_WITH_A_FAILED_STEP.description,
    );
  });
});

/**
 * The census: the Build was not the only surface whose summary was computed
 * beside its rows rather than from them. `toProgressState` (flashcard
 * illustration) and `initialProgress` (the AI-visibility report) both hand a
 * cheerful, fixed sentence to the same renderer while individual rows can go
 * red. Fixing this in the renderer is what makes them inherit it.
 */
describe("every consumer of the canonical renderer inherits the honesty", () => {
  it("corrects a cheerful process sentence when one row has failed", () => {
    const illustration: LiveRunProgressState = {
      title: "Illustrating Photosynthesis",
      // A pile of CARDS, each sourced independently.
      shape: "fan_out",
      description:
        "An agent searches the open web for each card's front, judges the source, and attaches only what clears the bar.",
      items: [
        { id: "a", label: "Chloroplast", status: "completed" },
        { id: "b", label: "Light reaction", status: "failed" },
      ],
    };
    const summary = summaryOf(illustration);
    expect(summary).not.toContain("attaches only what clears the bar");
    expect(summary).toContain("Light reaction");
    expect(summary).toMatch(/try it again/i);
  });

  it("corrects the visibility report's waiting sentence when an engine fails", () => {
    const report: LiveRunProgressState = {
      title: "Checking AI recommendations",
      // A pile of ENGINES, each asked independently.
      shape: "fan_out",
      description:
        "Each engine updates here as its response and analysis complete.",
      items: [
        { id: "chat_gpt", label: "ChatGPT", status: "completed" },
        { id: "claude", label: "Claude", status: "failed" },
        { id: "gemini", label: "Gemini", status: "running" },
      ],
    };
    expect(summaryOf(report)).toContain("Claude");
    expect(summaryOf(report)).not.toContain(
      "Each engine updates here as its response and analysis complete.",
    );
  });

  it("derives the sentence in the renderer, so no consumer can opt out", () => {
    const source = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "features/agents/components/live-run/LiveRunProgress.tsx",
      ),
      "utf8",
    );
    // The renderer must not print the caller's description straight through.
    expect(source).toContain("honestProgressSummary");
    expect(source).not.toContain("{progress.description}");
  });
});
