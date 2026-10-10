/**
 * A TOOLBAR SLOT KEEPS ITS SIZE BEFORE ITS CONTENT LANDS (STABLE-2, /data home CLS 0.11): the saved-view
 * tabs and the table's controls arrive after the first frame, and the search box beside them jumped
 * 441px. Each slot remembers what its content last measured and reserves it on the next visit.
 * Break: no reservation (style undefined) or no recording → red.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { reserveSlotScript, useReservedSlot } from "../components/useReservedSlot";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "matrx:list-slot-size:data-home:tabs";
const RO = globalThis.ResizeObserver;

beforeAll(() => {
  // A ResizeObserver that reports at once, as the real one does on observe().
  globalThis.ResizeObserver = class {
    constructor(private cb: () => void) {}
    observe() {
      this.cb();
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = RO;
});
afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

function Slot({ reserve, surface = "data-home" }: { reserve: boolean; surface?: string }) {
  const slot = useReservedSlot(surface, "tabs", reserve, undefined);
  return <div data-slot="" ref={slot.ref} style={slot.style} />;
}

async function mount(reserve: boolean, surface?: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Slot reserve={reserve} surface={surface} />));
  return { container, slot: container.querySelector("[data-slot]") as HTMLElement, root };
}

it("reserves the last measured width and height in the first commit", async () => {
  window.localStorage.setItem(KEY, JSON.stringify({ w: 278, h: 31 }));
  const { slot, root } = await mount(true);
  expect(slot.style.minWidth).toBe("278px");
  expect(slot.style.minHeight).toBe("31px");
  expect(slot.style.display).toBe("flex");
  await act(async () => root.unmount());
});

it("reserves nothing when the surface is not showing its table, or nothing was ever measured", async () => {
  window.localStorage.setItem(KEY, JSON.stringify({ w: 278, h: 31 }));
  const off = await mount(false);
  expect(off.slot.style.minWidth).toBe("");
  await act(async () => off.root.unmount());
  window.localStorage.clear();
  const none = await mount(true, "a-surface-with-no-first-visit-size");
  expect(none.slot.style.minWidth).toBe("");
  await act(async () => none.root.unmount());
});

it("a FIRST visit to /data reserves the slot's typical size, so a cold browser's first frame is already final (CLS 0.068 -> 0.002)", async () => {
  const { slot, root } = await mount(true); // nothing in localStorage
  expect([slot.style.minWidth, slot.style.minHeight]).toEqual(["117px", "31px"]);
  await act(async () => root.unmount());
  document.body.innerHTML = '<div id="slot"></div><script id="s"></script>';
  new Function("document", reserveSlotScript("data-home", "controls"))({ currentScript: document.getElementById("s") });
  const slot2 = document.getElementById("slot") as HTMLElement;
  expect([slot2.style.minWidth, slot2.style.minHeight]).toEqual(["147px", "34px"]);
});

it("remembers what the content measures once it lands", async () => {
  const { slot, root } = await mount(true);
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 278, height: 31 } as DOMRect);
  await act(async () => {
    slot.appendChild(document.createElement("div"));
    await Promise.resolve();
  });
  expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ w: 278, h: 31 });
  await act(async () => root.unmount());
});

it("the server's first frame is reserved too: the inline script sets the remembered size on the slot before it", () => {
  window.localStorage.setItem(KEY, JSON.stringify({ w: 278, h: 31 }));
  document.body.innerHTML = '<div id="slot"></div><script id="s"></script>';
  const fake = { currentScript: document.getElementById("s") };
  new Function("document", reserveSlotScript("data-home", "tabs"))(fake);
  const slot = document.getElementById("slot") as HTMLElement;
  expect([slot.style.minWidth, slot.style.minHeight, slot.style.display]).toEqual(["278px", "31px", "flex"]);
});

it("the inline script is silent when nothing was remembered", () => {
  document.body.innerHTML = '<div id="slot"></div><script id="s"></script>';
  new Function("document", reserveSlotScript("a-surface-with-no-first-visit-size", "tabs"))({
    currentScript: document.getElementById("s"),
  });
  expect((document.getElementById("slot") as HTMLElement).getAttribute("style")).toBeNull();
});
