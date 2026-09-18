/**
 * A FINISHED LANE OFFERS ANOTHER GO.
 *
 * 🚨 THE DEFECT (cold walk 6, finding 7, 2026-09-17). Shadow-the-inbox finished
 * its first thread and offered exactly three things: "Review the drafts",
 * "Interview me about the gaps", and "Close". Every one of them leaves. The
 * lane's own doors read "Paste a thread" and "Upload an export" — one at a
 * time, obviously many over the weeks — and the only route to a second thread
 * was to close the dialog and come back in through the Rulebook. Reproduced
 * live that day on a brand-new Rulebook: "1 suggested rule added as drafts",
 * and no control on screen that leads anywhere but out. NO DEAD ENDS
 * (`common-docs/policies/no-dead-ends.md`).
 *
 * THE CLASS, not the instance: every "add rules from a source" lane ends on the
 * same terminus screen with the same two exits, and the thing a person most
 * wants there is another go. So the census below is the guard — each of these
 * lanes must render the shared affordance (`lib/durable-run/DurableRunAgain`),
 * and the affordance must return the lane to its own first step rather than
 * closing anything.
 *
 * RED against the pre-fix tree: every row fails, with
 *   ✕ features/masterwork/components/detail/ShadowInboxDialog.tsx offers
 *     another go from its result screen
 *     Expected substring: "DurableRunAgain"
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..");

/**
 * The lanes whose result screen is a terminus a person will want to re-enter.
 * A new source lane belongs on this list the day it is built; a lane that is
 * genuinely once-only (there is no second one to do) does not, and says why
 * here rather than being quietly left off.
 */
const REPEATABLE_LANES = [
  "features/masterwork/components/detail/ShadowInboxDialog.tsx",
  "features/masterwork/components/detail/IngestSourceDialog.tsx",
  "features/masterwork/components/detail/ChatImportDialog.tsx",
  "features/masterwork/components/detail/BodyOfWorkDialog.tsx",
  "features/masterwork/components/detail/IngestTimelineDialog.tsx",
];

describe("a finished lane offers another go", () => {
  it.each(REPEATABLE_LANES)(
    "%s offers another go from its result screen",
    (rel) => {
      const source = readFileSync(join(REPO, rel), "utf8");
      // The result screen is the one that says the drafts landed.
      expect(source).toMatch(/Review the drafts|See your held-out cases/);
      expect(source).toContain("DurableRunAgain");
    },
  );

  it("never offers another go by closing the dialog", () => {
    // The dead end was people being sent OUT to get back IN. An affordance
    // that closes the dialog is the dead end wearing a button.
    const shared = readFileSync(
      join(REPO, "lib/durable-run/DurableRunAgain.tsx"),
      "utf8",
    );
    expect(shared).not.toContain("onOpenChange");
  });
});
