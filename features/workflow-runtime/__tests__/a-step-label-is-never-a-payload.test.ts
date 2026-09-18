/**
 * A STEP LABEL IS NEVER A PAYLOAD.
 *
 * 🚨 THE DEFECT (cold walk 5, finding 5b, 2026-09-16). On the finished run page
 * of a Masterwork, the right-hand "THE PLAN" rail rendered the five completed
 * sub-items of "Checking your General rules · 5 of 5 done" as raw, truncated
 * JSON key/value fragments — reproduced live on 2026-09-17 on a brand-new run,
 * character for character:
 *
 *     #1  dence": "", "fix_hint": "" } ], "content_id": "v1", "violation_count": 0 }
 *     #2  ence": "", "fix_hint": "" } ], "content_id": "v2", "violation_count": 0 }
 *
 * THE ROOT CAUSE: the lane preferred the node's raw stream TAIL over the
 * `progress.message` the engine declares for exactly this purpose, so every
 * structured-output step in the platform put its own serialization on screen
 * in front of an Expert. THE CLASS: a label that is SCRAPED instead of
 * DECLARED. The fix is `laneDetail()` — declared first, and a payload fragment
 * refused outright rather than truncated into something that looks like text.
 *
 * THE FORCING FUNCTION: the real payload tails captured from that live run.
 *
 * RED against the pre-fix expression
 * (`error ?? (tail || progress?.message) ?? duration`): every one of these
 * returns the JSON fragment.
 */

import {
  laneDetail,
  looksLikeMachineFrame,
  proseTail,
} from "../components/run/laneDetail";

/** Verbatim from the live run page, 2026-09-17. */
const LEAKED_TAILS = [
  'dence": "", "fix_hint": "" } ], "content_id": "v1", "violation_count": 0 }',
  'ence": "", "fix_hint": "" } ], "content_id": "v2", "violation_count": 0 }',
  'ue harvesting/margin analysis." } ], "content_id": "v2", "violation_count": 1 }',
  'for disposition clarification." } ], "content_id": "v3", "violation_count": 1 }',
];

describe("a step label is never a payload", () => {
  it.each(LEAKED_TAILS)("refuses the fragment %#", (tail) => {
    expect(looksLikeMachineFrame(tail)).toBe(true);
    expect(proseTail(tail)).toBeNull();
    expect(
      laneDetail({
        phase: "settled",
        error: null,
        progress: null,
        textTail: tail,
        durationMs: 1234,
      }),
    ).toBe("1234 ms");
  });

  it("prefers the step's own declared progress line over any tail", () => {
    expect(
      laneDetail({
        phase: "settled",
        error: null,
        progress: { message: "Checked draft 1 against your General rules" },
        textTail: LEAKED_TAILS[0],
        durationMs: 900,
      }),
    ).toBe("Checked draft 1 against your General rules");
  });

  it("an error still outranks everything — a failure is never hidden", () => {
    expect(
      laneDetail({
        phase: "failed",
        error: { message: "The model refused this draft." },
        progress: { message: "Checking draft 4" },
        textTail: "anything at all",
        durationMs: 10,
      }),
    ).toBe("The model refused this draft.");
  });

  it("still shows a real sentence a step streamed, cut on a word", () => {
    const prose =
      "Reading the third draft and comparing it against the rule about missing wipe certificates on government pallets";
    const shown = proseTail(prose);
    expect(shown).not.toBeNull();
    expect(shown!.startsWith("…")).toBe(true);
    // never mid-word
    expect(shown).not.toMatch(/^…[a-z]+ing\b.*certificates/);
    expect(prose.endsWith(shown!.replace(/^…/, ""))).toBe(true);
  });

  it("a short prose tail is shown whole, with no ellipsis", () => {
    expect(proseTail("Comparing the drafts")).toBe("Comparing the drafts");
  });

  it("protocol frames are machine frames too", () => {
    expect(looksLikeMachineFrame("<reasoning>")).toBe(true);
    expect(looksLikeMachineFrame("</tool_call>")).toBe(true);
  });

  it("nothing honest to say beats saying something machine-shaped", () => {
    expect(
      laneDetail({
        phase: "running",
        error: null,
        progress: null,
        textTail: '{"content_id": "v9"}',
        durationMs: null,
      }),
    ).toBeNull();
  });
});
