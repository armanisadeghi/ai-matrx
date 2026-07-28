/**
 * Repaint-signal contract for the DB tool-renderer cache.
 *
 * Guards the fix for the "agent edits a tool renderer mid-session but the card
 * shows the stale compiled renderer until a hard refresh" bug: busting the
 * cache must also bump a monotonic version so a mounted `DbToolRendererImpl`
 * re-resolves. Targeted busts must NOT repaint unrelated tools; a blanket bust
 * must repaint everything.
 */
import {
  getToolRendererVersion,
  subscribeToolRenderer,
  invalidateToolRenderer,
  invalidateAllToolRenderers,
} from "../toolRendererCache";

describe("toolRendererCache repaint signal", () => {
  it("targeted invalidate bumps only that tool's version and notifies", () => {
    const a0 = getToolRendererVersion("tool_a");
    const b0 = getToolRendererVersion("tool_b");

    let notified = 0;
    const unsub = subscribeToolRenderer(() => {
      notified += 1;
    });

    invalidateToolRenderer("tool_a");

    expect(getToolRendererVersion("tool_a")).toBe(a0 + 1);
    expect(getToolRendererVersion("tool_b")).toBe(b0); // unrelated tool untouched
    expect(notified).toBe(1);

    unsub();
    invalidateToolRenderer("tool_a");
    expect(notified).toBe(1); // no notification after unsubscribe
  });

  it("blanket invalidate bumps the epoch so every tool repaints", () => {
    const a0 = getToolRendererVersion("tool_a");
    const b0 = getToolRendererVersion("tool_b");

    let notified = 0;
    const unsub = subscribeToolRenderer(() => {
      notified += 1;
    });

    invalidateAllToolRenderers();

    expect(getToolRendererVersion("tool_a")).toBe(a0 + 1);
    expect(getToolRendererVersion("tool_b")).toBe(b0 + 1);
    expect(notified).toBe(1);

    unsub();
  });
});
