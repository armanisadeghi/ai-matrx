import { MADE_DECK_FORGET_MS, readMadeDeck } from "../madeDeckMarker";

// Live 2026-10-05: deck cd7320db… was made, "Opening your deck…" sat ~60 s,
// then the page showed a blank form. The made deck is recorded before the
// navigation so /new can name it, with its link.
describe("readMadeDeck", () => {
  const now = 1_800_000_000_000;
  it("reads the record the new-deck page writes before opening the deck", () => {
    expect(readMadeDeck({ setId: "cd7320db", name: "Clinic ops", madeAt: now - 1000 }, now)).toEqual({
      setId: "cd7320db",
      name: "Clinic ops",
      madeAt: now - 1000,
    });
  });
  it("names an unnamed deck plainly", () => {
    expect(readMadeDeck({ setId: "a", name: " ", madeAt: now }, now)?.name).toBe("Your deck");
  });
  it("is nothing for an empty bag, a stray shape, or a record past a day", () => {
    expect(readMadeDeck(null, now)).toBeNull();
    expect(readMadeDeck({ runId: "x" }, now)).toBeNull();
    expect(readMadeDeck({ setId: "a", madeAt: now - MADE_DECK_FORGET_MS - 1 }, now)).toBeNull();
  });
});
