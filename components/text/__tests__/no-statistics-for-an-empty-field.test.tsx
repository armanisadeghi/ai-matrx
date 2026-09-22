/**
 * NO STATISTICS FOR A FIELD WITH NO TEXT — EVER. A forcing function.
 *
 * Cold walk 19 and again cold walk 21 (jobs-bar-2026-09-16) read this on the
 * one screen in the product where a non-technical Expert decides to spend real
 * money — three empty boxes on the Run the Bench dialog, each carrying
 *
 *     0 chars  0 whitespace  0 words  0 lines  0 paragraphs
 *
 * fifteen zeros directly above "Expect this to cost up to about $85.90."
 *
 * Walk 20's repair deleted `enableTextStats` from ONE consumer (the ingest
 * dialog) and shipped no guard, so the class stayed open and the Bench — which
 * had opted in on 2026-09-15, commit 87ab138341 — kept printing them. The
 * Bench's own suite could not catch it either: it mocks `ProTextarea` down to a
 * bare <textarea>, so the stats bar it is asserting about never renders there.
 *
 * So the guard lives HERE, at `PlainTextMetricsBar` — the ONE primitive every
 * stats bar in the repo renders through (`ProTextFieldStatsBar` and therefore
 * every `enableTextStats` ProTextarea, the notes footer, the fullscreen
 * markdown editor). It renders the real component against the real metrics
 * computation; no consumer can reopen the class by passing the prop.
 *
 * Proven failing before the fix: all four "empty" cases printed the zeros.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PlainTextMetricsBar } from "../PlainTextMetricsBar";
import {
  ProTextFieldStatsBar,
  ProTextFieldStatsPanel,
} from "@/components/official/ProTextFieldStats";

// jsdom has no ResizeObserver; the bar measures itself to pick its density.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  TestResizeObserver;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: React.ReactElement): string {
  act(() => root.render(node));
  return host.textContent ?? "";
}

/** Every label the bar and the panel can print, in either register. */
const STAT_WORDS = [
  "chars",
  "whitespace",
  "words",
  "lines",
  "paragraphs",
  "Characters",
  "Whitespace characters",
  "Words",
  "Lines",
  "Paragraphs",
];

function expectNoStatistics(text: string) {
  for (const word of STAT_WORDS) {
    expect(text).not.toContain(word);
  }
  // The shape the walks actually read: a zero next to a unit.
  expect(text).not.toMatch(/0\s*(chars|whitespace|words|lines|paragraphs)/i);
}

describe("an empty field shows no statistics", () => {
  it("the metrics bar renders nothing at all for an empty string", () => {
    const text = render(<PlainTextMetricsBar text="" />);
    expect(text).toBe("");
    expectNoStatistics(text);
  });

  it("the ProTextarea stats bar — the Bench's three arms — prints no zeros", () => {
    // This is the exact element `ProTextarea` renders when `enableTextStats`
    // is on and the person has typed nothing: the Run the Bench dialog's
    // "The job, in one brief", "The case or input" and "The expert's real
    // answer" boxes on a freshly created Rulebook.
    const text = render(<ProTextFieldStatsBar text="" />);
    expectNoStatistics(text);
    expect(text).not.toContain("0");
  });

  it("the stats panel says the true thing instead of five zeros", () => {
    const text = render(<ProTextFieldStatsPanel text="" />);
    expect(text).toContain("Nothing typed here yet");
    expect(text).not.toMatch(/\b0\b/);
  });

  it("a field holding only a newline is still empty of text, not of counts", () => {
    // A single newline IS a character, so counting starts — the rule is about
    // nothing typed, not about whitespace-only content being unmeasurable.
    const text = render(<PlainTextMetricsBar text={"\n"} />);
    expect(text).toContain("chars");
  });
});

describe("counting still works the moment there is text", () => {
  it("the bar returns with real numbers on the first character", () => {
    const text = render(<PlainTextMetricsBar text="Recoat." />);
    expect(text).toContain("chars");
    expect(text).toContain("7");
  });

  it("the ProTextarea bar counts a real brief", () => {
    const text = render(
      <ProTextFieldStatsBar text={"Repaint or recoat?\n\nTwo coats."} />,
    );
    // jsdom reports clientWidth 0, so the bar picks its narrowest density —
    // the character count and its unit. What matters is that it is back and
    // measuring something real.
    expect(text).toContain("chars");
    expect(text).toContain("30");
  });

  it("the panel lists every metric once there is text", () => {
    const text = render(<ProTextFieldStatsPanel text="Two coats." />);
    expect(text).toContain("Characters");
    expect(text).toContain("Paragraphs");
    expect(text).not.toContain("Nothing typed here yet");
  });
});
