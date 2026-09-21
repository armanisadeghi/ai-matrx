/**
 * THE GUARD: "Your words" prints no role token, and its word count is hers.
 *
 * WHAT WENT WRONG (sixteenth cold walk, 2026-09-21, defect B — on production,
 * driven as a residential HVAC contractor who had just finished a five-turn
 * interview). The panel headed "Everything you've told us while building
 * walk16-HVAC Repair or Replace Verdict — oldest first, nothing left out."
 * rendered, verbatim:
 *
 *     user: The rule that comes before every other rule in my shop: nobody
 *     quotes a replacement until two numbers are written on the ticket. …
 *     assistant: Got it — I'll capture rules as we go, and you'll review and
 *     approve each one before it's final.
 *
 * `user:` ×5 and `assistant:` ×8 — thirteen raw role labels on the one screen
 * whose entire purpose is showing the Expert her own words. And the header
 * said "6 things you contributed · 1 interview · 1,550 words" against the 595
 * words she actually typed, while the Rulebook's own Interviews block three
 * inches away said "570 words" — because the count was the SIZE OF THE CORPUS,
 * interviewer included, divided by 5.5 in a second copy of `wordCount`.
 *
 * WHY THIS TEST IS NOT SELF-CONGRATULATION:
 *  - It renders the REAL `ExpertRecordPage` against the real `getExpertCorpus`
 *    wire shape the server now sends, not a hand-made prop bag.
 *  - It asserts on what is ON SCREEN — it scans the whole rendered document for
 *    a role token rather than checking a field we happen to remember.
 *  - The count assertion is arithmetic the walk itself could have done: her
 *    two turns, through the SAME `wordCount` the interview summary's
 *    "N things you said · M words" line uses. A page that passed by using a
 *    different-but-also-right formula would still fail.
 *  - Proven failing against the shipped render (flat `c.text` +
 *    `Math.round(corpus.totalChars / 5.5)`) before the fix, passing after.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { wordCount } from "../format";

// The walk's own HVAC interview, in the turns the capture lane stores.
const EXPERT_TURN_1 =
  "The rule that comes before every other rule in my shop: nobody quotes a " +
  "replacement until two numbers are written on the ticket. The refrigerant " +
  "charge and the total external static pressure.";
const SCOUT_TURN_1 =
  "Got it — I'll capture rules as we go, and you'll review and approve each " +
  "one before it's final.";
const EXPERT_TURN_2 =
  "Age alone is never a reason to replace. A fifteen-year-old condenser with " +
  "a 0.50 rated static and a charge inside spec gets a repair quote.";
const SCOUT_TURN_2 =
  "The thinnest spot is the actual charge/superheat/subcooling thresholds — " +
  "you gave me the duct side of this in detail.";

const HER_CHARS = EXPERT_TURN_1.length + EXPERT_TURN_2.length;

const corpus = {
  rulebookId: "4eeba280-c33b-4731-a0e5-9e19cabdb129",
  interviews: [],
  contributions: [
    {
      id: "kept_source:walk16-interview",
      kind: "message",
      lane: "interview",
      laneLabel: "said in an interview",
      title: "walk16-HVAC Repair or Replace Verdict — interview",
      // 🚨 THE FLAT TEXT STILL CARRIES THE TOKENS, ON PURPOSE. This is what
      // `platform.masterwork_source.content` holds on every row written before
      // the fix (it IS `RawMaterial.searchable_text()`), and what an older
      // server sends. The page must render the TURNS and never this — a guard
      // whose fixture was already clean would prove nothing about the render.
      text: [
        `user: ${EXPERT_TURN_1}`,
        `assistant: ${SCOUT_TURN_1}`,
        `user: ${EXPERT_TURN_2}`,
        `assistant: ${SCOUT_TURN_2}`,
      ].join("\n"),
      expertChars: HER_CHARS,
      turns: [
        { voice: "person" as const, text: EXPERT_TURN_1, speaker: null },
        { voice: "machine" as const, text: SCOUT_TURN_1, speaker: null },
        { voice: "person" as const, text: EXPERT_TURN_2, speaker: null },
        { voice: "machine" as const, text: SCOUT_TURN_2, speaker: null },
      ],
      when: "2026-09-21T02:10:00.000Z",
    },
  ],
  totalChars:
    HER_CHARS + SCOUT_TURN_1.length + SCOUT_TURN_2.length + "assistant: ".length * 4,
  expertChars: HER_CHARS,
  laneCounts: { interview: 1 },
  limits: [],
  hiddenInterviewCount: 0,
  canReadMaterial: true,
};

jest.mock("../service", () => ({
  ...jest.requireActual("../service"),
  getExpertCorpus: jest.fn(async () => corpus),
}));

jest.mock("../../service", () => ({
  ...jest.requireActual("../../service"),
  getRulebook: jest.fn(async () => ({
    id: corpus.rulebookId,
    name: "walk16-HVAC Repair or Replace Verdict",
  })),
}));

// The heavy canonical renderer is dynamic and client-only; under test it only
// has to put the words on screen, which is the whole assertion.
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

// The page's chrome reaches for the Redux store and the media/file services.
// None of it is under test: the assertion is what the RECORD renders and what
// its header counts. Each stub renders nothing, so a role token could only
// come from the thing being guarded.
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));
jest.mock("@/components/content-actions/ContentActionBar", () => ({
  ContentActionBar: () => null,
}));
jest.mock("@/features/masterwork/drive/DriveLinkButton", () => ({
  DriveLinkButton: () => null,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));
jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

async function openTheRecord(): Promise<string> {
  const { ExpertRecordPage } = await import("../ExpertRecordPage");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ExpertRecordPage rulebookId={corpus.rulebookId} />);
  });
  // The corpus read resolves on a microtask; let the page settle.
  await act(async () => {
    await Promise.resolve();
  });
  return host.textContent ?? "";
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("Your words", () => {
  it("prints not one role token, and folds our question as a question", async () => {
    const onScreen = await openTheRecord();

    expect(onScreen).toContain(EXPERT_TURN_1);
    expect(onScreen).not.toContain("user:");
    expect(onScreen).not.toContain("assistant:");
    expect(onScreen).not.toContain("system:");

    // Her words whole; ours present but said in English, as the question it was.
    expect(onScreen).toContain(EXPERT_TURN_2);
    expect(onScreen).toContain(`We asked: ${SCOUT_TURN_1}`);
  });

  it("counts her words only, through the one shared counter", async () => {
    const onScreen = await openTheRecord();

    expect(onScreen).toContain(wordCount(HER_CHARS));
    // And it is NOT the corpus size — the 1,550-against-595 gap the walk saw.
    expect(wordCount(HER_CHARS)).not.toBe(wordCount(corpus.totalChars));
    expect(onScreen).not.toContain(wordCount(corpus.totalChars));
  });
});
