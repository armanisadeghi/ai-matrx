/**
 * THE TRIAD GAME'S DOOR — the card is real, and it opens on something.
 *
 * The census (2026-09-15) logged `triad_game` as row 17: a card that says
 * "Coming soon", `aria-disabled="true"`, no link. This suite is what stops it
 * regressing into the WORSE state the same census logged as row 3 — a card that
 * is live, selectable, and lands the Expert on a bare Rulebook page with no
 * game and no error.
 *
 * Proven red before green, each independently:
 *
 * * drop the `q.triad === "1"` branch from `resolveApproachLane` → "resolves to
 *   its own lane" fails, and with it the whole door.
 * * leave the registry row `enabled: false` / `availability: "coming_soon"` →
 *   "is a reachable card" fails.
 * * relax `parseDeck`'s `items.length !== 3` → "refuses a card that is not
 *   three items" fails.
 * * delete the route file → "the lane it names is a real route" fails.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  approachState,
  type DistillationApproach,
} from "../../browse/approaches";
import { resolveApproachLane } from "../../browse/approachLane";
import { parseDeck } from "../types";

/** The live `platform.approach` row, as `enable_triad_game.py` leaves it. */
const TRIAD_ROW: DistillationApproach = {
  id: "row-id",
  key: "triad_game",
  label: "The Triad game",
  blurb:
    "A repertory grid in disguise: three real cases — which two are alike, " +
    "which is the odd one out, and why?",
  whatItNeeds: "Nothing but your reactions. We bring the cases.",
  costTimeShape: "About fifteen seconds per triad — play it in a queue.",
  mandateKey: "masterwork.triad_game",
  intakeQuery: { triad: "1" },
  sortOrder: 80,
  enabled: true,
  availability: "available",
  launchHref: null,
  catalogNumber: 13,
};

describe("the Triad game's card is a real door", () => {
  it("is a reachable card in the catalog, not a coming-soon tile", () => {
    const state = approachState(TRIAD_ROW);
    expect(state.status).toBe("ready");
    expect(state.reachable).toBe(true);
    // The guided start is the door the catalog offers: it creates the Rulebook
    // the game needs, then hands the row's own `intake_query` to the Rulebook
    // page, which forwards to the lane.
    expect(state.href).toBe("/masterwork/new?approach=triad_game");
  });

  it("resolves to its own lane, never to a dialog that does not exist", () => {
    expect(resolveApproachLane(TRIAD_ROW)).toEqual({ kind: "triad" });
  });

  it("never resolves to null — the census-row-3 defect", () => {
    // A row the product cannot map is what dropped Experts on a bare page.
    expect(resolveApproachLane(TRIAD_ROW)).not.toBeNull();
  });

  it("the lane it names is a real route on disk", () => {
    const route = join(
      process.cwd(),
      "app",
      "(core)",
      "masterwork",
      "[id]",
      "triad",
      "page.tsx",
    );
    expect(existsSync(route)).toBe(true);
  });
});

describe("a card the surface may draw", () => {
  const card = (items: { key: string; text: string }[]) => ({
    id: "abc123def456",
    prompt: "Which one would you send?",
    mode: "best_one",
    items: items.map((i) => ({ ...i, note: "" })),
  });

  it("keeps a card that is exactly three items", () => {
    const deck = parseDeck({
      rulebook_id: "r1",
      mode: "best_one",
      requested: 10,
      repeats_dropped: 0,
      triads: [
        card([
          { key: "a", text: "one" },
          { key: "b", text: "two" },
          { key: "c", text: "three" },
        ]),
      ],
    });
    expect(deck?.triads).toHaveLength(1);
    expect(deck?.triads[0].items.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });

  it("refuses a card that is not three items", () => {
    const deck = parseDeck({
      rulebook_id: "r1",
      triads: [
        card([
          { key: "a", text: "one" },
          { key: "b", text: "two" },
        ]),
      ],
    });
    // A two-item "triad" is not the instrument. Dropped, never drawn.
    expect(deck?.triads).toHaveLength(0);
  });

  it("refuses an item whose key is not one of the three handles", () => {
    const deck = parseDeck({
      rulebook_id: "r1",
      triads: [
        card([
          { key: "a", text: "one" },
          { key: "d", text: "two" },
          { key: "c", text: "three" },
        ]),
      ],
    });
    expect(deck?.triads).toHaveLength(0);
  });

  it("arms the microphone unless the server says otherwise", () => {
    expect(parseDeck({ rulebook_id: "r", triads: [] })?.voiceDefaultOn).toBe(true);
    expect(
      parseDeck({ rulebook_id: "r", triads: [], voice_default_on: false })
        ?.voiceDefaultOn,
    ).toBe(false);
  });

  it("reports the repeats the server dropped rather than hiding them", () => {
    const deck = parseDeck({
      rulebook_id: "r",
      triads: [],
      requested: 10,
      repeats_dropped: 3,
    });
    expect(deck?.repeatsDropped).toBe(3);
  });
});
