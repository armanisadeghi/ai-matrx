/**
 * The deck Progress screen's "Needs practice" list and the deck-scoped drill
 * (`weak-areas?set=`) share `rankDeckPractice`: never-studied and well-known
 * cards stay out, struggle-flagged cards lead, then lowest recall first.
 */
import type { ItemMasteryRow } from "@/features/education/study/types";
import { needsDeckPractice, rankDeckPractice, rankTestStudy } from "../deckPractice";

function row(
  id: string,
  over: Partial<ItemMasteryRow>,
): ItemMasteryRow {
  return {
    item_id: id,
    item_type: "fc_card",
    attempt_count: 1,
    struggle_flag: false,
    stability: null,
    difficulty: null,
    last_review: null,
    lapses: 0,
    mastery_score: 0.5,
    ...over,
  } as unknown as ItemMasteryRow;
}

const now = new Date("2026-10-01T12:00:00Z");

describe("rankDeckPractice", () => {
  it("keeps only studied cards below Familiar, worst first, flags leading", () => {
    const ranked = rankDeckPractice(
      [
        row("new", { attempt_count: 0, mastery_score: 0 }),
        row("strong", { mastery_score: 0.95 }),
        row("learning", { mastery_score: 0.6 }),
        row("struggling", { mastery_score: 0.2 }),
        row("flagged", { mastery_score: 0.85, struggle_flag: true }),
      ],
      now,
    );
    expect(ranked.map((m) => m.item_id)).toEqual([
      "flagged",
      "struggling",
      "learning",
    ]);
  });

  it("never counts a card that was never answered", () => {
    expect(
      needsDeckPractice(row("x", { attempt_count: 0, struggle_flag: true }), now),
    ).toBe(false);
  });
});

describe("rankTestStudy", () => {
  it("lists every card once: needs practice, then never studied, then solid weakest-first", () => {
    const ids = rankTestStudy(
      ["strong", "new", "struggling", "new", "okay"],
      [
        row("strong", { mastery_score: 0.95 }),
        row("struggling", { mastery_score: 0.2 }),
        row("okay", { mastery_score: 0.9 }),
      ],
      now,
    );
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("struggling");
    expect(ids[1]).toBe("new");
    expect(new Set(ids)).toEqual(new Set(["strong", "new", "struggling", "okay"]));
  });
});
