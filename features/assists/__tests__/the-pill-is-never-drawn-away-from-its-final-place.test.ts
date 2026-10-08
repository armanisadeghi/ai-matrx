/**
 * THE ASSISTS PILL IS NEVER DRAWN AWAY FROM ITS FINAL PLACE (zero layout shift, 2026-10-08).
 *
 * Measured live: on every page load the fixed "N assists" pill jumped from the bottom-right
 * (1105,898) to the header slot (916,3) and back, once to three times a load, each jump scoring
 * ~0.0086 layout shift. The first placement pass ran against a half-painted page and docked the
 * pill in the header; a later pass moved it back, visibly.
 *
 * Fix under test: the pill mounts hidden (`data-assist-dock-pending` + `invisible` — no layout
 * space, no shift), goes back to hidden in the same pass that changes its place, and is drawn only
 * once two consecutive passes agree on the place and the document has loaded.
 *
 * RED on the old dock: it had no pending state, so a changed place was always drawn.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REVEAL_CAP_MS, stepDockReveal, type DockRevealState } from "../assistClearance";

const fresh: DockRevealState = { signature: null, pendingSince: 0 };

/** Runs passes in order; returns, per pass, whether the pill was drawn after it. */
function drawnAfterEachPass(passes: { sig: string; at: number; complete: boolean }[]): boolean[] {
  let state = fresh;
  return passes.map((p) => {
    const step = stepDockReveal(state, p.sig, p.at, p.complete);
    state = step.state;
    return !step.pending;
  });
}

describe("the assists pill is drawn only where it will stay", () => {
  it("is hidden on the first pass, whatever place it picked", () => {
    expect(drawnAfterEachPass([{ sig: "slot|header", at: 10, complete: true }])).toEqual([false]);
  });

  it("is never drawn at the transient header slot of a half-painted page", () => {
    // The shipped bug: slot (header) -> rest (corner) -> slot -> rest, 150 ms apart.
    const drawn = drawnAfterEachPass([
      { sig: "slot|header", at: 100, complete: false },
      { sig: "rest|corner", at: 250, complete: true },
      { sig: "slot|header", at: 400, complete: true },
      { sig: "rest|corner", at: 550, complete: true },
      { sig: "rest|corner", at: 700, complete: true },
    ]);
    expect(drawn).toEqual([false, false, false, false, true]);
  });

  it("is hidden again in the same pass that moves it, never moved while drawn", () => {
    let state = fresh;
    const seen: { sig: string; drawn: boolean }[] = [];
    for (const [sig, at] of [["rest", 100], ["rest", 250], ["lift|40", 400], ["lift|40", 550]] as const) {
      const step = stepDockReveal(state, sig, at, true);
      state = step.state;
      seen.push({ sig, drawn: !step.pending });
    }
    // Drawn at "rest" only after it held; the pass that changes the place hides it.
    expect(seen).toEqual([
      { sig: "rest", drawn: false },
      { sig: "rest", drawn: true },
      { sig: "lift|40", drawn: false },
      { sig: "lift|40", drawn: true },
    ]);
  });

  it("waits for the document to load, but never longer than the cap", () => {
    expect(drawnAfterEachPass([
      { sig: "rest", at: 100, complete: false },
      { sig: "rest", at: 250, complete: false },
    ])).toEqual([false, false]);
    expect(drawnAfterEachPass([
      { sig: "rest", at: 100, complete: false },
      { sig: "rest", at: 100 + REVEAL_CAP_MS, complete: false },
    ])).toEqual([false, true]);
  });

  it("the pill ships hidden in both markups (desktop and mobile)", () => {
    const src = readFileSync(join(__dirname, "../components/AssistsDock.tsx"), "utf8");
    const pending = src.match(/data-assist-dock-pending=""/g) ?? [];
    const hidden = src.match(/data-\[assist-dock-pending\]:invisible/g) ?? [];
    expect(pending).toHaveLength(2);
    expect(hidden).toHaveLength(2);
    // The desktop CONTAINER is the box that moves: it hides with its pending pill.
    expect(src).toContain("has-[[data-assist-dock-pending]]:invisible");
  });
});
