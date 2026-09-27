/**
 * FORCING FUNCTION: the page scrolls over a diagram.
 *
 * THE DEFECT (verifier round 2, since June): the diagram frame was a vertical
 * scroller with `overscroll-behavior: contain`, so a mouse wheel over any
 * diagram stopped scrolling the page. An embedded diagram's frame now scrolls
 * sideways only (a zoomed diagram pans by drag, zooms with ctrl/cmd-wheel);
 * only a full-height viewer owns vertical scrolling.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MermaidViewport } from "../MermaidViewport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const SVG = '<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg"></svg>';

async function frameClass(props: { fillHeight?: boolean }) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MermaidViewport svg={SVG} {...props} />
      </TooltipProvider>,
    ),
  );
  const frame = host.querySelector("svg")!.parentElement!.parentElement!.parentElement!;
  const cls = frame.className;
  await act(async () => root.unmount());
  return cls;
}

it("an embedded diagram never captures the page's vertical wheel", async () => {
  const cls = await frameClass({});
  expect(cls).not.toMatch(/overscroll-contain/);
  expect(cls).toMatch(/overflow-y-hidden/);
});

it("a full-height viewer scrolls itself", async () => {
  expect(await frameClass({ fillHeight: true })).toMatch(/overflow-auto/);
});
