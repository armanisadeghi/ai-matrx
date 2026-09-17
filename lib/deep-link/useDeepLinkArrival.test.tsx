/**
 * THE GUARD for cold walk 6, finding 5: a "come back and finish this" link
 * must open every time it is visited.
 *
 * The defect: seventeen deep links on the Masterwork Rulebook page each held a
 * `useRef(false)` latch. `/masterwork/[id]` is ONE component instance across
 * client-side navigation, so the latch stayed true forever — the second visit
 * to `?drip=1` or `?red_pen=1` opened nothing, said nothing, and left the
 * Expert on a plain page wondering what she had clicked. The walk found it on
 * the Daily Drip and the Red-Pen lane; the latch was on every lane.
 *
 * Proven red before green (2026-09-17): with the `if (!asking) { handled = false }`
 * re-arm removed from `useDeepLinkArrival`, "opens again after the URL stops
 * asking and asks again" fails with `expect(received).toBe(2) // Received: 1`.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useDeepLinkArrival } from "./useDeepLinkArrival";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** Render the hook with props we can change, the way a URL changes. */
async function drive(initial: { asking: boolean; ready: boolean }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  let opened = 0;
  let setProps!: (next: { asking: boolean; ready: boolean }) => void;

  function Probe() {
    const [props, set] = React.useState(initial);
    setProps = set;
    useDeepLinkArrival(props.asking, props.ready, () => {
      opened += 1;
    });
    return null;
  }

  await act(async () => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  return {
    opens: () => opened,
    async set(next: { asking: boolean; ready: boolean }) {
      await act(async () => setProps(next));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("useDeepLinkArrival", () => {
  it("opens once on arrival, not once per render", async () => {
    const h = await drive({ asking: true, ready: true });
    await h.set({ asking: true, ready: true });
    await h.set({ asking: true, ready: true });
    expect(h.opens()).toBe(1);
    await h.unmount();
  });

  it("opens again after the URL stops asking and asks again", async () => {
    const h = await drive({ asking: true, ready: true });
    expect(h.opens()).toBe(1);
    // She closed it and walked off to another page on the same route instance…
    await h.set({ asking: false, ready: true });
    // …then followed the same link again. THIS is the visit that did nothing.
    await h.set({ asking: true, ready: true });
    expect(h.opens()).toBe(2);
    await h.unmount();
  });

  it("holds the arrival until the record it needs has loaded, never drops it", async () => {
    const h = await drive({ asking: true, ready: false });
    expect(h.opens()).toBe(0);
    await h.set({ asking: true, ready: true });
    expect(h.opens()).toBe(1);
    await h.unmount();
  });

  it("never fires while the URL is not asking", async () => {
    const h = await drive({ asking: false, ready: true });
    await h.set({ asking: false, ready: true });
    expect(h.opens()).toBe(0);
    await h.unmount();
  });
});
