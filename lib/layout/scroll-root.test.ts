/**
 * Observers inside a window panel or drawer must watch THAT scroller: with the
 * viewport as root, a rootMargin never reaches past the panel's clip, so lazy
 * diagrams and progressive blocks mounted only once already on screen.
 */
import { nearestScrollRoot } from "./scroll-root";

function box(overflowY: string, scrollHeight: number, clientHeight: number, overflowX = "visible") {
  const el = document.createElement("div");
  el.style.overflowY = overflowY;
  el.style.overflowX = overflowX;
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { value: clientHeight });
  return el;
}

it("finds the panel's own scroller, skipping a table wrapper that only scrolls sideways", () => {
  const panel = box("auto", 5000, 600);
  const tableWrap = box("auto", 300, 300, "auto");
  const target = document.createElement("div");
  tableWrap.appendChild(target);
  panel.appendChild(tableWrap);
  document.body.appendChild(panel);
  expect(nearestScrollRoot(target)).toBe(panel);
  panel.remove();
});

it("answers null when the page itself scrolls", () => {
  const plain = document.createElement("div");
  const target = document.createElement("div");
  plain.appendChild(target);
  document.body.appendChild(plain);
  expect(nearestScrollRoot(target)).toBeNull();
  plain.remove();
});
