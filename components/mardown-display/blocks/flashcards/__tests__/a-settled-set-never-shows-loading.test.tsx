/**
 * A flashcard set whose producer is done never shows "Loading" again.
 *
 * 2026-10-06: a recitation-stopped Flashcard Generator turn left its last
 * card on "Loading flashcard..." forever — live AND after reload. The card
 * text arrived inside `<artifact type="flashcards">…</artifact>` (and was
 * saved to a canvas row as plain "Front:/Back:" text); completion was
 * inferred ONLY from the `</flashcards>` sentinel, which neither framing
 * carries. So the parser held the last card as "partial" and the set body
 * drew its "Loading next flashcard" placeholder with nothing left to come.
 *
 * Exercises the real derivation (`deriveFlashcardsSet`, the core of
 * `useFlashcardsSet`) on the incident's real text shape, then renders the
 * real `FlashcardsSetBody` (the component that draws the placeholder) with
 * what the derivation returned.
 */

import { renderToStaticMarkup } from "react-dom/server";
import {
  deriveFlashcardsSet,
  MISSING_BACK_TEXT,
} from "../flashcards-set-derive";

jest.mock("../FlashcardItem", () => ({
  __esModule: true,
  default: ({ front, back }: { front: string; back: string | null }) => (
    <div data-testid="card">
      {front} :: {back ?? "PENDING"}
    </div>
  ),
}));

// eslint-disable-next-line import/first -- after the leaf mock above
import { FlashcardsSetBody } from "../flashcards-set-parts";

/** The saved canvas row / artifact body: no `</flashcards>` sentinel. */
const SAVED_TEXT =
  "Front: Population distribution\nBack: the pattern of human settlement-the spread of people across the earth.\n\n\n---\n\n" +
  "Front: population density\nBack: a measure of the average population per square mile or kilometer of an area.\n\n\n---\n\n" +
  "Front: Boserup theory\nBack: the Boserup theory suggested that the more people there are, the more hands there are to work, rather than just more mouths to feed.\n";

function renderBody(set: ReturnType<typeof deriveFlashcardsSet>): string {
  return renderToStaticMarkup(
    <FlashcardsSetBody
      flashcards={set.flashcards}
      isComplete={set.isComplete}
      layoutMode="grid"
      hasStreamingCard={
        !set.isComplete &&
        set.flashcards.some((c) => c.back === null || c.back === undefined)
      }
    />,
  );
}

test("settled text with no sentinel: every card renders, nothing is loading", () => {
  const set = deriveFlashcardsSet({ content: SAVED_TEXT, settled: true });
  expect(set.isComplete).toBe(true);
  expect(set.flashcards.map((c) => c.front)).toEqual([
    "Population distribution",
    "population density",
    "Boserup theory",
  ]);
  const html = renderBody(set);
  expect(html.match(/data-testid="card"/g)).toHaveLength(3);
  expect(html).not.toContain("Loading next flashcard");
});

test("while still streaming, the unfinished last card is held and the placeholder shows", () => {
  const set = deriveFlashcardsSet({ content: SAVED_TEXT, settled: false });
  expect(set.isComplete).toBe(false);
  expect(set.flashcards).toHaveLength(2);
  expect(renderBody(set)).toContain("Loading next flashcard");
});

test("a stream cut off after a card's front says so instead of waiting", () => {
  const cut = `${SAVED_TEXT}\n---\n\nFront: Malthusian theory\n`;
  const set = deriveFlashcardsSet({ content: cut, settled: true });
  expect(set.isComplete).toBe(true);
  expect(set.flashcards.at(-1)).toEqual({
    front: "Malthusian theory",
    back: MISSING_BACK_TEXT,
  });
});

test("settled server data: a card whose answer never arrived is labelled, never pending", () => {
  const set = deriveFlashcardsSet({
    serverData: {
      cards: [
        { front: "Population distribution", back: "the pattern of settlement" },
        { front: "Boserup theory", back: null },
      ],
      isComplete: false,
    },
    settled: true,
  });
  expect(set.isComplete).toBe(true);
  expect(set.flashcards[1]?.back).toBe(MISSING_BACK_TEXT);
  const html = renderBody(set);
  expect(html).not.toContain("PENDING");
  expect(html).not.toContain("Loading next flashcard");
});
