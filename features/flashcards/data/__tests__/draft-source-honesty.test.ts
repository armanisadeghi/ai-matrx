import { lateSourceIds, unreadableRestoredIds } from "../draftSourceHonesty";

describe("a Source added after Make the deck started is not silently cleared", () => {
  it("is named late, so it stays in the draft", () => {
    expect(lateSourceIds(["a", "b", "late"], new Set(["a", "b"]))).toEqual(["late"]);
  });
  it("a topic-only run has no late Sources", () => {
    expect(lateSourceIds(["x"], new Set())).toEqual([]);
  });
});

describe("restored Sources that cannot be read are taken out", () => {
  const card = (id: string, over: Partial<{ status: string; archived: boolean; state: string | null }> = {}) => ({
    id,
    status: "ready",
    archived: false,
    state: "ready" as string | null,
    ...over,
  });
  it("drops only restored, unreadable, non-archived ones", () => {
    const cards = [
      card("empty", { state: "unavailable" }),
      card("fine"),
      card("archived", { state: "unavailable", archived: true }),
      card("added-now", { state: "unavailable" }),
    ];
    expect(unreadableRestoredIds(cards, new Set(["empty", "fine", "archived"]))).toEqual(["empty"]);
  });
});
