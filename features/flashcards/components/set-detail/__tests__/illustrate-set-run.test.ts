/**
 * "Illustrate the rest" never wipes the trial card's picture from review.
 *
 * The flow is: confirm → ONE trial card → see its image → confirm the rest.
 * The second run's plan must append to what the first run settled; if it
 * replaced the rows, the image the person just approved would vanish.
 */
import {
  IDLE_RUN,
  reduceIllustrateRun,
  type IllustrateRunState,
} from "../illustrateSetRun";

const trialDone: IllustrateRunState = {
  ...IDLE_RUN,
  phase: "starting",
  cards: [
    {
      cardId: "c1",
      label: "Card 1",
      status: "completed",
      result: { card_id: "c1", face: "front", attached: true, image_url: "https://x/1.png" },
    },
  ],
};

describe("illustrate set run reducer", () => {
  it("a follow-up plan keeps the settled trial card and adds the new ones", () => {
    const next = reduceIllustrateRun(trialDone, {
      kind: "set_image_plan",
      cards: [
        { cardId: "c2", label: "Card 2" },
        { cardId: "c3", label: "Card 3" },
      ],
      skippedExisting: 1,
      trimmedByLimit: 0,
    });
    expect(next.phase).toBe("running");
    expect(next.cards.map((c) => [c.cardId, c.status])).toEqual([
      ["c1", "completed"],
      ["c2", "waiting"],
      ["c3", "waiting"],
    ]);
    expect(next.cards[0].result?.image_url).toBe("https://x/1.png");
  });

  it("a plan arriving after Stop stays stopping", () => {
    const next = reduceIllustrateRun(
      { ...trialDone, phase: "stopping" },
      { kind: "set_image_plan", cards: [], skippedExisting: 0, trimmedByLimit: 0 },
    );
    expect(next.phase).toBe("stopping");
  });
});
