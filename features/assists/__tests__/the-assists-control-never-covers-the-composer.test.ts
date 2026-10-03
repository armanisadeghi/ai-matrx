/**
 * THE ASSISTS CONTROL NEVER COVERS THE COMPOSER (2026-10-02).
 *
 * The floating "N assists" pill rested on the chat composer's context chip
 * until it was dismissed: the chip is a small control that fell between the
 * dock's nine hit-test samples, over a composer card that is not itself
 * interactive, so the pass saw nothing under the pill. A composer shell
 * (`data-agent-input-shell`) and anything marked `data-assist-dock-avoid` are
 * now avoided by their whole box: the pill lifts clear of the composer.
 *
 * RED on the old code: the composer card is a plain div, the chip sits between
 * the samples, so no lift was written and the pill stayed on the chip.
 */
import { applyAssistDockLift, dockPlacementVar } from "../assistClearance";

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("the assists control never covers the composer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const marker of ["data-agent-input-shell", "data-assist-dock-avoid"]) {
    it(`lifts clear of a composer marked ${marker}, even when its chip falls between the samples`, () => {
      const dock = document.createElement("div");
      dock.setAttribute("data-assists-dock", "");
      // The pill: 148 px wide, 30 px tall, resting at the bottom right.
      dock.getBoundingClientRect = () => rect(820, 850, 1120, 1268);
      document.body.appendChild(dock);

      const composer = document.createElement("div");
      composer.setAttribute(marker, "");
      composer.getBoundingClientRect = () => rect(700, 880, 760, 1240);
      // The context chip: a small button at x 1150–1170, between the samples
      // at 1122 / 1194 / 1266, so a hit test alone never finds it.
      const chip = document.createElement("button");
      chip.getBoundingClientRect = () => rect(822, 848, 1150, 1170);
      composer.appendChild(chip);
      document.body.appendChild(composer);
      const card = document.createElement("div");
      composer.appendChild(card);
      (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) =>
        y >= 700 && y <= 880 && x >= 760 && x <= 1240 ? [dock, card, composer] : [dock, document.body];

      applyAssistDockLift();
      // Lifted by the smallest 8 px step whose bottom (850 - 152 = 698) is above the composer (700).
      expect(dockPlacementVar("--assist-dock-lift")).toBe("152px");
      expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false);
    });
  }
});
