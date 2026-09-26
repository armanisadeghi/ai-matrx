/**
 * FORCING FUNCTION: a print or page capture renders EVERY block.
 *
 * THE DEFECT (2026-09-26): a long document mounts 600 blocks and the rest as
 * the reader scrolls. The live-page print path (renderAllDiagrams, then print)
 * drew every mounted diagram — and printed "Showing 600 of 1,712 blocks" with
 * the tail missing. Progressive mount now follows the render-all switch.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useProgressiveMount } from "../progressive-mount";
import { renderAllDiagrams } from "@/components/mermaid/lazy-draw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class NeverIntersecting {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NeverIntersecting;

function Doc({ total }: { total: number }) {
  const { shown } = useProgressiveMount(total);
  return <div data-shown={shown} />;
}

it("render-all mounts the whole document before a print", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Doc total={1712} />));
  // Let the automatic slices run to their cap.
  for (let i = 0; i < 10; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  const before = Number(host.firstElementChild?.getAttribute("data-shown"));
  expect(before).toBeLessThan(1712);

  await act(async () => {
    await renderAllDiagrams(1000);
  });
  expect(Number(host.firstElementChild?.getAttribute("data-shown"))).toBe(1712);
  await act(async () => root.unmount());
});
