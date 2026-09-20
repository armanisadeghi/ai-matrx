/**
 * The panel renders the control its own sentence tells you to choose.
 *
 * ## The screen this closes (cold walk 13, N7 — 2026-09-20)
 *
 * An Expert attached five files to a Rulebook that already held her interview
 * and the file-pile outcome panel said, verbatim:
 *
 *     We have already read "kept material" into this Rulebook — an earlier
 *     pass left 11 rule(s) from it … Nothing was added. Choose "Distil again
 *     and replace" to throw the earlier 11 draft(s) away and keep only the
 *     new pass.
 *
 * Every button, link and `role="button"` on that page was enumerated. There
 * was no "Distil again". The only control in the panel was "Review the
 * drafts". The server had the whole mechanism (`redistill: "replace"`, the
 * same path "Read this part again" uses) and the wire already carried
 * `can_replace` and `draft_rules` — the panel simply never drew it.
 *
 * Three assertions, one rule: a sentence that names a control is a promise,
 * and the control is the only thing that keeps it.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DumpOutcomes,
  parseDumpSummary,
  retryResourceFor,
} from "../components/detail/RulebookSourcesPanel";

/** The exact wire row the walk received, kept source and all. */
const ALREADY_READ = {
  kind: "kept_source",
  source_key: "interview:c7a89414-b909-4b9e-bac2-673631549f38",
  title: "Pressure-First Irrigation Triage for Large-Site Sprinklers",
  status: "already_distilled",
  rules_added: 0,
  duplicates: 0,
  already_distilled: {
    // The server's sentence states FACTS and names no control — see
    // `source_identity.refusal_message`. The offer is these two fields.
    message:
      "We have already read “Pressure-First Irrigation Triage for Large-Site " +
      "Sprinklers” into this Rulebook — an earlier pass left 11 rules from it. " +
      "Nothing was added. The 11 drafts that pass left are still waiting for you.",
    draft_rules: 11,
    can_replace: true,
  },
};

const SUMMARY = {
  added: 0,
  duplicates_skipped: 0,
  resources: [ALREADY_READ],
};

describe("a kept source can be rebuilt into a request at all", () => {
  it("carries the source_key the server echoes", () => {
    const parsed = parseDumpSummary(SUMMARY)!;
    expect(parsed.resources[0].sourceKey).toBe(ALREADY_READ.source_key);
    expect(parsed.resources[0].replaceableDrafts).toBe(11);
  });

  it("rebuilds a kept_source resource — RED before the fix, it returned null", () => {
    const parsed = parseDumpSummary(SUMMARY)!;
    expect(retryResourceFor(parsed.resources[0])).toEqual({
      kind: "kept_source",
      source_key: ALREADY_READ.source_key,
      title: ALREADY_READ.title,
    });
  });

  it("offers no replace when the server says one is meaningless", () => {
    const parsed = parseDumpSummary({
      ...SUMMARY,
      resources: [
        {
          ...ALREADY_READ,
          already_distilled: {
            ...ALREADY_READ.already_distilled,
            can_replace: false,
          },
        },
      ],
    })!;
    expect(parsed.resources[0].replaceableDrafts).toBeUndefined();
  });
});

describe("the control the sentence names is on the screen", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const controlLabels = () =>
    Array.from(
      container.querySelectorAll('button, a, [role="button"]'),
    ).map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());

  it("draws “Distil again and replace” beside the sentence that names it", async () => {
    const parsed = parseDumpSummary(SUMMARY)!;
    await act(async () => {
      root.render(
        <DumpOutcomes
          summary={parsed}
          onDone={() => undefined}
          onDistilAgain={() => undefined}
        />,
      );
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Distil again and replace");
    // ← RED before the fix: the enumeration held only "Review the drafts".
    expect(controlLabels()).toContain("Distil again and replace");
  });

  it("never promises a control on a surface that cannot draw one", async () => {
    // RED before the fix: the SERVER's sentence ended "Choose “Distil again
    // and replace” …", so this panel printed the promise whether or not it
    // could honour it. A sentence cannot know its surface, so it states facts
    // and the surface draws the offer.
    const parsed = parseDumpSummary(SUMMARY)!;
    await act(async () => {
      root.render(<DumpOutcomes summary={parsed} onDone={() => undefined} />);
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain("Distil again and replace");
    expect(controlLabels()).not.toContain("Distil again and replace");
    // The FACTS survive; only the promise went.
    expect(text).toContain("an earlier pass left 11 rules from it");
  });

  it("draws no replace for a source that has no drafts to replace", async () => {
    const parsed = parseDumpSummary({
      ...SUMMARY,
      resources: [
        {
          ...ALREADY_READ,
          already_distilled: {
            message:
              "We have already read “Pressure-First Irrigation Triage” into " +
              "this Rulebook — an earlier pass left 11 rules from it. 11 of " +
              "them you have already approved, and those are kept whatever " +
              "you choose.",
            draft_rules: 0,
            can_replace: false,
          },
        },
      ],
    })!;
    await act(async () => {
      root.render(
        <DumpOutcomes
          summary={parsed}
          onDone={() => undefined}
          onDistilAgain={() => undefined}
        />,
      );
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain("Distil again and replace");
    expect(controlLabels()).not.toContain("Distil again and replace");
  });
});
