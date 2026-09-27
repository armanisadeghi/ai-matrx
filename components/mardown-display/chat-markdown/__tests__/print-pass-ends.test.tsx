/**
 * FORCING FUNCTION: a print never switches off the huge-paste protection.
 *
 * THE DEFECT (verifier round 2, 2026-09-26): the render-all switch a print
 * sets was never cleared. After one Cmd+P, a 5 MB paste mounted all 8,269
 * blocks (31.5 s stall, 2.6 GB heap) and typing took 2.1 s per key. Render-all
 * is now a pass from beforeprint to afterprint (or around a capture); after it
 * a new document slices again.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PROGRESSIVE_FIRST_SLICE, useProgressiveMount } from "../progressive-mount";
import { isRenderAllActive, renderAllDiagrams } from "@/components/mermaid/lazy-draw";

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
const shown = (host: HTMLElement) => Number(host.firstElementChild?.getAttribute("data-shown"));

it("the browser's print is one pass: after afterprint a 5 MB paste slices again", async () => {
  window.dispatchEvent(new Event("beforeprint"));
  expect(isRenderAllActive()).toBe(true);
  window.dispatchEvent(new Event("afterprint"));
  expect(isRenderAllActive()).toBe(false);

  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Doc total={8269} />));
  expect(shown(host)).toBe(PROGRESSIVE_FIRST_SLICE);
  await act(async () => root.unmount());
});

it("a capture's pass closes on release", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Doc total={3000} />));
  let release: () => void = () => {};
  await act(async () => {
    release = (await renderAllDiagrams(1000)).release;
  });
  expect(shown(host)).toBe(3000);
  await act(async () => release());
  expect(isRenderAllActive()).toBe(false);
  await act(async () => root.render(<Doc total={8269} />));
  expect(shown(host)).toBeLessThan(8269);
  await act(async () => root.unmount());
});
