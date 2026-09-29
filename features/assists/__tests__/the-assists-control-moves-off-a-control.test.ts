/**
 * THE ASSISTS CONTROL MOVES OFF A CONTROL (list-shell fix D round 2, 2026-09-28).
 *
 * Settings final judge: mid-page the pill sat on a Models row switch (/user-settings/ai/models), the
 * phone bulb on a switch, the Notifications Text column — the scroll-end inset cannot help there.
 * The dock now lifts to the nearest spot with no control beneath it, or yields (faded,
 * click-through) when none is in reach.
 *
 * RED on the old code: nothing moved the dock — `applyAssistDockLift`/`liftFor` did not exist and
 * `--assist-dock-lift` was never written, so the switch stayed under the pill.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { applyAssistDockLift, liftFor, useAssistClearance } from "../assistClearance";

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("the assists control moves off a control", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--assist-dock-lift");
  });

  it("lifts by the smallest step that clears, stays put when clear, yields when nothing clears", () => {
    const base = { top: 700, bottom: 730, left: 1120, right: 1268 };
    expect(liftFor(base, () => false)).toBe(0);
    // A switch row spans y 680–736: the dock (30px tall) first clears it 56px up, resting at 644–674.
    const switchRow = (r: { top: number; bottom: number }) => r.bottom > 680 && r.top < 736;
    expect(liftFor(base, switchRow)).toBe(56);
    expect(liftFor(base, () => true)).toBeNull();
  });

  it("writes the lift when a switch is under the dock, and yields when the page is all controls", () => {
    const sw = document.createElement("button");
    sw.setAttribute("role", "switch");
    document.body.appendChild(sw);
    const dock = document.createElement("div");
    dock.setAttribute("data-assists-dock", "");
    document.body.appendChild(dock);
    dock.getBoundingClientRect = () => rect(700, 730, 1120, 1268);
    const blank = document.createElement("div");
    document.body.appendChild(blank);
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (_x, y) =>
      y > 680 && y < 736 ? [dock, sw] : [dock, blank];

    applyAssistDockLift();
    expect(document.documentElement.style.getPropertyValue("--assist-dock-lift")).toBe("48px"); // sampled 2px inside the dock edges
    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false);

    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [dock, sw];
    applyAssistDockLift();
    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--assist-dock-lift")).toBe("");
  });

  it("uses visible footer and attention-dock geometry when a tooltip hides the disabled control from hit testing", () => {
    const dock = document.createElement("div");
    dock.setAttribute("data-assists-dock", "");
    dock.getBoundingClientRect = () => rect(700, 730, 112, 268);
    document.body.appendChild(dock);

    const footer = document.createElement("div");
    footer.setAttribute("data-matrx-table-footer", "");
    footer.getBoundingClientRect = () => rect(680, 736, 0, 390);
    const tooltip = document.createElement("span");
    const next = document.createElement("button");
    next.disabled = true;
    next.textContent = "Next";
    footer.append(tooltip, next);
    document.body.appendChild(footer);

    const attention = document.createElement("div");
    attention.setAttribute("data-surface-value", "admin_attention_dock_collapsed");
    let attentionRect = rect(632, 688, 0, 390);
    attention.getBoundingClientRect = () => attentionRect;
    document.body.appendChild(attention);

    // The tooltip wrapper is the first non-dock hit, so interactive-only
    // sampling cannot reach the disabled Next button beneath it.
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [dock, tooltip];

    applyAssistDockLift();
    expect(document.documentElement.style.getPropertyValue("--assist-dock-lift")).toBe("104px");
    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false);

    attentionRect = rect(64, 736, 0, 390);
    document.documentElement.style.removeProperty("--assist-dock-lift");
    applyAssistDockLift();
    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(true);
  });

  it("reschedules clearance when a dragged attention dock updates its inline position", async () => {
    const dock = document.createElement("div");
    dock.setAttribute("data-assists-dock", "");
    dock.getBoundingClientRect = () => rect(700, 730, 112, 268);
    document.body.appendChild(dock);

    const attention = document.createElement("div");
    attention.setAttribute("data-surface-value", "admin_attention_dock_collapsed");
    let attentionRect = rect(100, 156, 0, 390);
    attention.getBoundingClientRect = () => attentionRect;
    document.body.appendChild(attention);

    const blank = document.createElement("div");
    document.body.appendChild(blank);
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [dock, blank];

    const originalFrame = globalThis.requestAnimationFrame;
    const queued = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    globalThis.requestAnimationFrame = (callback) => {
      const id = ++frameId;
      queued.set(id, callback);
      return id;
    };
    const runQueuedFrame = () => {
      const next = queued.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) throw new Error("Expected clearance to schedule an animation frame");
      queued.delete(next[0]);
      next[1](0);
    };

    function Harness() {
      useAssistClearance(true);
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(Harness));
      });
      act(runQueuedFrame);
      expect(document.documentElement.style.getPropertyValue("--assist-dock-lift")).toBe("");

      attentionRect = rect(680, 736, 0, 390);
      await act(async () => {
        attention.style.transform = "translateY(12px)";
        await Promise.resolve();
      });
      act(runQueuedFrame);
      expect(document.documentElement.style.getPropertyValue("--assist-dock-lift")).toBe("56px");
    } finally {
      act(() => root.unmount());
      host.remove();
      globalThis.requestAnimationFrame = originalFrame;
    }
  });
});
