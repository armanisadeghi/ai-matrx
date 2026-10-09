/**
 * @jest-environment jsdom
 */
/**
 * G18 review (2026-10-07): a "No" tooltip stuck over the admin table. A
 * disabled <button> gets no mouseleave in Chrome and a removed node's native
 * tooltip stays on screen, so no inert cell carries a native `title`, and an
 * inert toggle is aria-disabled, never `disabled`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { StateCell } from "@/features/directive-catalog/components/StateCell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<>{node}</>));
  return host;
}

it("a passive cell has no native tooltip but keeps its name", () => {
  const host = render(<StateCell state="no" />);
  expect(host.querySelector("[title]")).toBeNull();
  expect(host.querySelector('[aria-label="No"]')).not.toBeNull();
});

it("an inspect-only cell's inert toggle is aria-disabled, never disabled, with no tooltip", () => {
  const host = render(<StateCell state="planned" onInspect={() => undefined} inspectLabel="Inspect" />);
  const toggle = host.querySelector("button") as HTMLButtonElement;
  expect(toggle.disabled).toBe(false);
  expect(toggle.getAttribute("aria-disabled")).toBe("true");
  expect(toggle.hasAttribute("title")).toBe(false);
});
