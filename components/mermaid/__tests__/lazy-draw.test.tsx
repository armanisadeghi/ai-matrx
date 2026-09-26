/**
 * FORCING FUNCTION: a long document with many diagrams draws only the ones near
 * the viewport on paste, and every one before a print.
 *
 * THE DEFECT (verifier round 1, 2026-09-26): a 1 MB document with 46 mermaid
 * diagrams froze the studio for 38–75 s and a real chat answer's Preview for
 * 51 s — mermaid measures every label with getBBox, and all 46 drew at once.
 * c71082a03a draws near the viewport and the rest in idle time. This asserts
 * the draw calls themselves (mermaid's `renderMermaid` is mocked): on mount only
 * the diagrams the IntersectionObserver reports as near are drawn; a print draws
 * the rest. Fails on the pre-c71082a03a MermaidRenderer (scratch copy): all 46
 * draw on mount.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const drawn: string[] = [];
jest.mock("../runtime", () => ({
  MermaidRenderSupersededError: class extends Error {},
  preloadMermaid: () => undefined,
  supersedeMermaidRender: () => undefined,
  validateMermaid: async () => ({ ok: true }),
  renderMermaid: async (source: string) => {
    drawn.push(source);
    return { svg: `<svg viewBox="0 0 10 10"><text>${source.length}</text></svg>` };
  },
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("../MermaidViewport", () => ({ MermaidViewport: () => null }));

// Only the first 3 diagrams are "near the viewport"; the rest never intersect.
const NEAR = 3;
let observed = 0;
class NearFirstObserver {
  private index: number;
  constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.index = observed++;
  }
  observe() {
    const near = this.index < NEAR;
    setTimeout(() => this.cb([{ isIntersecting: near }]), 0);
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NearFirstObserver;
// No idle time in this test: the idle queue must not run during the mount check.
(window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback = () => 0;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MermaidRenderer } from "../MermaidRenderer";

const OPTIONS = { theme: "default", look: "classic", layout: "dagre" } as const;
const DIAGRAMS = 46;
const sources = Array.from({ length: DIAGRAMS }, (_, i) => `flowchart LR\n  A${i}[Stage ${i}] --> B${i}[Next]`);

it("46 diagrams: only the ones near the viewport draw on mount; a print draws all", async () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        {sources.map((s, i) => (
          <MermaidRenderer key={i} source={s} options={OPTIONS} />
        ))}
      </>,
    );
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
  }
  expect(drawn.length).toBe(NEAR);

  const { renderAllDiagrams } = await import("../lazy-draw");
  const done = renderAllDiagrams(60_000);
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
  }
  expect(await done).toEqual({ pending: 0 });
  expect(new Set(drawn).size).toBe(DIAGRAMS);
  await act(async () => root.unmount());
  jest.useRealTimers();
});
