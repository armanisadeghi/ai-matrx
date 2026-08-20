/**
 * The download → read-back proof for offline study (IC-8 §4).
 *
 * This exists because the deck half of the outbox shipped with ZERO callers:
 * `putOfflineDeck` / `getOfflineDeck` / `removeOfflineDeck` were fully built,
 * the panel told learners to press Download, and nothing ever wrote or read a
 * cached deck. The regression this guards is therefore not "does Dexie work" —
 * it is "does the round trip a learner depends on actually close".
 *
 * Runs against the real outbox on fake-indexeddb; only the two network
 * services are faked.
 */

import "fake-indexeddb/auto";

const SET = {
  id: "set-1",
  name: "Cardiac pharmacology",
  topic: "Pharmacology",
  difficulty: "hard",
};
const CARDS = [
  { id: "card-1", front: "Beta blockers", back: "Slow the heart" },
  { id: "card-2", front: "ACE inhibitors", back: "Lower blood pressure" },
];

type SetResult = {
  data: { set: typeof SET; cards: typeof CARDS } | null;
  error: string | null;
};
const getSetWithCards = jest.fn<Promise<SetResult>, []>(async () => ({
  data: { set: SET, cards: CARDS },
  error: null,
}));
const getMasteryBulk = jest.fn(async () => ({
  data: [{ item_id: "card-1", item_type: "fc_card", attempt_count: 3 }],
  error: null as string | null,
}));
const listDue = jest.fn(async () => ({
  // Includes a card from ANOTHER deck — the snapshot must filter to this set.
  data: [
    { item_id: "card-2", item_type: "fc_card" },
    { item_id: "card-from-other-deck", item_type: "fc_card" },
  ],
  error: null as string | null,
}));

jest.mock("../fcService", () => ({
  fcService: { getSetWithCards: () => getSetWithCards() },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    getMasteryBulk: () => getMasteryBulk(),
    listDue: () => listDue(),
  },
}));

import {
  downloadDeckOffline,
  readOfflineDeck,
  getOfflineDeckStatus,
  removeDeckOffline,
} from "../offlineDeck";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

describe("offline deck download", () => {
  it("downloads a deck and reads it back with no network call", async () => {
    const res = await downloadDeckOffline(ALICE, SET.id);
    expect(res).toEqual({ ok: true, cardCount: 2, error: null });

    getSetWithCards.mockClear();
    const snapshot = await readOfflineDeck(ALICE, SET.id);

    // The read path is the whole point: it must not touch the network.
    expect(getSetWithCards).not.toHaveBeenCalled();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.set.name).toBe("Cardiac pharmacology");
    expect(snapshot!.cards.map((c) => c.id)).toEqual(["card-1", "card-2"]);
    // Mastery is restored, so the learner's progress is honest offline.
    expect(snapshot!.masteryByCard["card-1"]?.attempt_count).toBe(3);
    // The due snapshot is scoped to THIS deck.
    expect(snapshot!.dueCardIds).toEqual(["card-2"]);
  });

  it("reports download state, and forgets it on remove", async () => {
    await downloadDeckOffline(ALICE, SET.id);
    const before = await getOfflineDeckStatus(ALICE, SET.id);
    expect(before.downloaded).toBe(true);
    expect(before.cardCount).toBe(2);

    await removeDeckOffline(ALICE, SET.id);
    const after = await getOfflineDeckStatus(ALICE, SET.id);
    expect(after.downloaded).toBe(false);
    expect(await readOfflineDeck(ALICE, SET.id)).toBeNull();
  });

  it("never serves one learner's download to another on the same device", async () => {
    await downloadDeckOffline(ALICE, SET.id);
    // Same device, same set id, different signed-in learner.
    expect(await readOfflineDeck(BOB, SET.id)).toBeNull();
    expect((await getOfflineDeckStatus(BOB, SET.id)).downloaded).toBe(false);
    // Alice's copy is untouched by Bob's miss.
    expect(await readOfflineDeck(ALICE, SET.id)).not.toBeNull();
  });

  it("refuses without a signed-in learner instead of caching an unowned deck", async () => {
    const res = await downloadDeckOffline("", SET.id);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sign in/i);
  });

  it("surfaces a failed deck fetch rather than storing a hollow download", async () => {
    getSetWithCards.mockResolvedValueOnce({ data: null, error: "not found" });
    const res = await downloadDeckOffline(ALICE, "set-missing");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not found");
    expect(await readOfflineDeck(ALICE, "set-missing")).toBeNull();
  });

  it("still downloads when the mastery/due overlay is unavailable", async () => {
    getMasteryBulk.mockResolvedValueOnce({ data: [], error: "rls" });
    listDue.mockResolvedValueOnce({ data: [], error: "rls" });
    const res = await downloadDeckOffline(ALICE, SET.id);
    expect(res.ok).toBe(true);
    const snapshot = await readOfflineDeck(ALICE, SET.id);
    expect(snapshot!.cards).toHaveLength(2);
    expect(snapshot!.dueCardIds).toEqual([]);
  });
});
