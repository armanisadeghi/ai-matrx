/**
 * The shared code view — real Shiki, real grammars, the real stream tokenizer.
 *
 * Breaks this guards: tokens not colored (highlighter never loads), fence
 * `{2,4-5}` lines not marked, unified-diff lines not tinted, `showLineNumbers{N}`
 * numbering ignored, or a STREAMED block (growing prefix) ending with different
 * colors than the same code rendered at once (the incremental tokenizer drifting).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShikiCodeView } from "../ShikiCodeView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DISPATCH = `export function assignRoute(stop: PickupStop) {
  const truck = nearestTruck(stop.zip);
  if (!truck) return null;
  truck.stops.push(stop);
  return truck.id;
}`;

const TARIFF_DIFF = `--- a/pricing/tariff.sql
+++ b/pricing/tariff.sql
@@ -1,3 +1,3 @@
 SELECT zone, rate
-FROM tariff_2025
+FROM tariff_2026
 WHERE active;`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function waitFor(check: () => boolean, what: string) {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

const colored = () =>
  Array.from(container.querySelectorAll<HTMLSpanElement>("[data-line] span span")).filter(
    (s) => s.style.color,
  );

function colorsByText(): string[] {
  return Array.from(container.querySelectorAll<HTMLSpanElement>("[data-line] span span")).map(
    (s) => `${s.textContent}=${s.style.color}`,
  );
}

it("colors TypeScript tokens and marks the fence's highlighted lines", async () => {
  await act(async () => {
    root.render(
      <ShikiCodeView code={DISPATCH} language="ts" mode="dark" highlightLines={[2, 4, 5]} />,
    );
  });
  await waitFor(() => colored().length > 5, "Shiki token colors");
  const keyword = colored().find((s) => s.textContent === "export");
  const identifier = colored().find((s) => s.textContent === "assignRoute");
  expect(keyword?.style.color).toBeTruthy();
  expect(identifier?.style.color).toBeTruthy();
  expect(keyword?.style.color).not.toBe(identifier?.style.color);
  const marked = Array.from(container.querySelectorAll("[data-highlighted]")).map((el) =>
    el.getAttribute("data-line"),
  );
  expect(marked).toEqual(["2", "4", "5"]);
});

it("tints unified-diff lines by their marker and starts numbering where the fence says", async () => {
  await act(async () => {
    root.render(
      <ShikiCodeView code={TARIFF_DIFF} language="diff" mode="light" showLineNumbers startLine={40} />,
    );
  });
  const diffOf = (n: number) =>
    container.querySelector(`[data-line="${n}"]`)?.getAttribute("data-diff") ?? null;
  expect([1, 2, 3, 4, 5, 6, 7].map(diffOf)).toEqual([null, null, "hunk", null, "remove", "add", null]);
  const numbers = Array.from(container.querySelectorAll("[data-line] > span[aria-hidden]")).map(
    (el) => el.textContent,
  );
  expect(numbers[0]).toBe("40");
  expect(numbers[numbers.length - 1]).toBe("46");
});

it("a streamed block ends with the same colors as the same code rendered at once", async () => {
  await act(async () => {
    root.render(<ShikiCodeView code={DISPATCH} language="ts" mode="dark" />);
  });
  await waitFor(() => colored().length > 5, "one-shot colors");
  const oneShot = colorsByText();
  act(() => root.unmount());
  root = createRoot(container);
  for (let end = 7; end < DISPATCH.length + 7; end += 7) {
    await act(async () => {
      root.render(
        <ShikiCodeView code={DISPATCH.slice(0, Math.min(end, DISPATCH.length))} language="ts" mode="dark" />,
      );
    });
  }
  await waitFor(() => colorsByText().join("|") === oneShot.join("|"), "streamed colors to settle equal to one-shot");
  expect(colorsByText()).toEqual(oneShot);
});
