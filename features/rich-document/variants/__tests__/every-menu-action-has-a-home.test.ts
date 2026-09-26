/**
 * GUARD (D6 class) — every registered menu action has a home in MENU_STRUCTURE.
 *
 * An action nobody placed falls into `buildMenuTree`'s `extras` and renders
 * as a loose row at the END of the top level. 2026-09-26: "Read-aloud voice
 * settings" (listen.ts, f772ee2fe0) landed that way — the 18th top-level row
 * of the ⋯ menu, under "App", below the fold on a 375px phone sheet, and it
 * broke registryMenuFitsViewport. This fails the day the next unplaced id is
 * registered, naming it, so its author chooses a section instead of the fold.
 */
import "../../actions/handlers";
import { getAllActions } from "../../actions/provider";
import { MENU_STRUCTURE, registryMenuActions } from "../shared/menuStructure";

/**
 * Deliberately top-level extras. The code-block actions only appear on a code
 * block's own menu (`visible` needs code facts), where they ARE the block's
 * leading actions; no chat-message menu ever shows them.
 */
const INTENTIONAL_EXTRAS = new Set([
  "code-block-open-in-editor",
  "code-block-apply-to-file",
  "code-block-run",
  "code-block-chart",
]);

describe("every registered menu action has a home (D6)", () => {
  it("names no unplaced action", () => {
    const placed = new Set(MENU_STRUCTURE.flatMap((section) => section.actionIds));
    const unplaced = registryMenuActions(getAllActions())
      .map((action) => action.id)
      .filter((id) => !placed.has(id) && !INTENTIONAL_EXTRAS.has(id));
    expect(unplaced).toEqual([]);
  });
});
