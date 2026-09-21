/**
 * THE GUARD: one source, one card, named once — and no preview for a document.
 *
 * WHAT WENT WRONG (seventeenth cold walk, 2026-09-21, defects A and B — on
 * production, driven as a residential electrician who had done one interview
 * and attached three files). "Your words" was headed
 *
 *     Everything you've told us while building walk17-Panel Repair or Replace
 *     Verdict — oldest first, nothing left out.
 *     11 things you contributed · 1 interview · 3.4k words
 *
 * for four interview turns and three documents, against the product's own
 * interview screen saying "4 things you said · 479 words" two clicks away.
 * Enumerated, the eleven cards were her three files "from a file you
 * uploaded", the whole interview, her four turns, and then her same three
 * files again "from something you handed over" — the second copies opening
 * with `--- Page 1 ---`. And under each text source sat a red box reading
 * "Image failed to load" with a bare UUID URL printed under it.
 *
 * WHY THIS TEST IS NOT SELF-CONGRATULATION:
 *  - It renders the REAL `ExpertRecordPage` against the real wire shape, and
 *    the fixture is the LIVE rows of rulebook 0a324d29-098c-453d-857f-22d173d4682a
 *    (read 2026-09-21), file ids and labels included.
 *  - It counts OCCURRENCES ON SCREEN of each document's name, so a page that
 *    deduped the count but still drew the card twice fails.
 *  - `InlineMediaRef` is stubbed as something that RENDERS AN IMAGE with its
 *    ref in the src — the opposite of stubbing it to null. The assertion is
 *    that no such element exists for a text source, which can only pass by the
 *    slot genuinely not being drawn.
 *  - Proven failing against the shipped render (all eleven segments, an
 *    unconditional preview slot) before the fix, passing after.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { tallyContributions, wordCount } from "../format";

const RULEBOOK = "0a324d29-098c-453d-857f-22d173d4682a";
const CONVERSATION = "f7f5036f-24dc-4ad7-861c-21b4f357d479";

/** The three uploads, with the live file ids and the labels she gave them. */
const FILES = [
  ["a5ab4c36-1eea-4c31-a849-df80e02a6ce7", "01_panel_upgrade_checklist.md"],
  ["8202fef8-7ad6-4243-89b4-cb3bce5cf5ec", "02_callback_log_spring_2026.md"],
  ["50cbbb4e-4575-400d-818a-a6bbe375d22e", "03_permit_note_service_change.txt"],
] as const;

const TURNS = [
  "We never quote a panel on the same visit that we red-tag a service.",
  "A written load calculation goes on the ticket before any replacement price.",
  "Burned, pitted or arc-damaged bus bar is one of my four hard triggers.",
  "A measured voltage drop, not a guess, decides whether it is the feeder.",
];

const HER_TURN_CHARS = TURNS.reduce((n, t) => n + t.length, 0);

/**
 * The extracted text, as the file lane reads it off the processed pages.
 * Deliberately does NOT repeat the file name: the card prints the name once,
 * as its title, and a fixture that echoed it would make "appears once"
 * unmeasurable.
 */
function documentText(name: string): string {
  const [n] = name.split("_");
  return (
    `Source ${n}. Utility disconnect is scheduled, never assumed. ` +
    `A written load calculation is on the ticket before any replacement price.`
  );
}

/**
 * What the corpus endpoint sends now: ONE reading per source. Her four turns
 * from `chat.message`, and her three documents from the file lane — the kept
 * `interview:<id>` row and the three kept `file:<id>` rows are the same four
 * sources read a second time and are no longer on the wire.
 */
const contributions = [
  ...TURNS.map((text, i) => ({
    id: `msg-${i + 1}`,
    sourceKey: `interview:${CONVERSATION}`,
    kind: "message",
    lane: "interview",
    laneLabel: "said in an interview",
    title: null,
    text,
    expertChars: text.length,
    turns: [],
    when: `2026-09-21T09:1${i + 1}:00.000Z`,
    conversationId: CONVERSATION,
    messageId: `msg-${i + 1}`,
  })),
  ...FILES.map(([fileId, name]) => ({
    id: `file:${fileId}`,
    sourceKey: `file:${fileId}`,
    kind: "document",
    lane: "file",
    laneLabel: "from a file you uploaded",
    title: name,
    text: documentText(name),
    expertChars: documentText(name).length,
    turns: [],
    when: "2026-09-21T09:25:55.000Z",
    fileId,
  })),
];

const corpus = {
  rulebookId: RULEBOOK,
  interviews: [],
  contributions,
  totalChars: contributions.reduce((n, c) => n + c.text.length, 0),
  expertChars: contributions.reduce((n, c) => n + c.expertChars, 0),
  laneCounts: { interview: 4, file: 3 },
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
    id: RULEBOOK,
    name: "walk17-Panel Repair or Replace Verdict",
  })),
}));

jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

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

// 🚨 STUBBED AS SOMETHING THAT DRAWS, NOT AS NULL. The real component infers
// its element from the file's mime and falls back to <img>; the walk's screen
// was five of those, each 404'ing and printing its own URL. A stub rendering
// nothing would make this guard unfalsifiable.
jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: ({ ref }: { ref?: string }) => (
    <img data-preview-slot="1" alt="" src={`https://www.aimatrx.com/${ref}`} />
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

async function openTheRecord(): Promise<HTMLDivElement> {
  const { ExpertRecordPage } = await import("../ExpertRecordPage");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ExpertRecordPage rulebookId={RULEBOOK} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("Your words — one source, one card", () => {
  it("renders each document once, and never under a second name", async () => {
    const node = await openTheRecord();
    const onScreen = node.textContent ?? "";

    for (const [, name] of FILES) {
      expect(occurrences(onScreen, name)).toBe(1);
    }
    // One name for an upload, and it is the one an Expert would use.
    expect(onScreen).toContain("from a file you uploaded");
    expect(onScreen).not.toContain("from something you handed over");
  });

  it("never prints a page marker as prose", async () => {
    const node = await openTheRecord();
    expect(node.textContent ?? "").not.toMatch(/---\s*Page\s+\d+\s*---/);
  });

  it("counts seven things and says what they were, in her words only", async () => {
    const node = await openTheRecord();
    const onScreen = node.textContent ?? "";

    expect(onScreen).toContain("7 things you contributed");
    expect(onScreen).toContain("4 interview turns");
    expect(onScreen).toContain("3 documents");
    // The header's number is the interview screen's own helper on her chars.
    expect(onScreen).toContain(wordCount(corpus.expertChars));
    // And it is nowhere near the 3.4k the duplicated panel reported: the four
    // turns and three documents together, once each.
    expect(tallyContributions(corpus.contributions)).toEqual({
      total: 7,
      byKind: "4 interview turns and 3 documents",
      expertChars: HER_TURN_CHARS + FILES.reduce(
        (n, [, name]) => n + documentText(name).length,
        0,
      ),
    });
    // The eleven-card header is gone in both its halves.
    expect(onScreen).not.toContain("11 things");
    expect(onScreen).not.toContain("3.4k words");
  });

  it("draws no preview slot for a text source, and no URL anywhere", async () => {
    const node = await openTheRecord();

    // Not one image element: every source here is text we already rendered.
    expect(node.querySelectorAll("[data-preview-slot]")).toHaveLength(0);
    expect(node.querySelectorAll("img")).toHaveLength(0);

    // And no file id is printed at a person, in any form.
    const onScreen = node.textContent ?? "";
    for (const [fileId] of FILES) {
      expect(onScreen).not.toContain(fileId);
    }
    expect(onScreen).not.toContain("Image failed to load");

    // The door still exists — a source without a preview is not a dead card.
    expect(occurrences(onScreen, "Open the source")).toBe(FILES.length);
  });
});
