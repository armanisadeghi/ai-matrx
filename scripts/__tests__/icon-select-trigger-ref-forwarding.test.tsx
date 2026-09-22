/** @jest-environment jsdom */
/**
 * POPOVER-EXPR (2026-09-23) — regression guard for a real, found-in-production
 * defect in `components/official/IconSelect.tsx`'s searchable branch.
 *
 * `<PopoverTrigger asChild>` is a Radix `Slot`: it clones its onClick,
 * aria-expanded, data-state and ref onto whatever single element its child
 * renders. `IconSelectTrigger` used to be a plain function component that
 * destructured only four named props and returned a `<Button>` with NO
 * `React.forwardRef` and NO `...rest` spread — so every prop Slot tried to
 * clone onto it was silently thrown away. The trigger rendered, looked
 * correct, but no click — real or headless — ever opened the popover, in
 * this app or in this lane's own proof harness (`app/(dev)/demos/
 * popover-expr-proof/page.dev.tsx`, discovered while proving `sizing="content"`
 * on this exact component). Fixed by wrapping `IconSelectTrigger` in
 * `forwardRef` and spreading `...rest` (incl. the caller-supplied `className`)
 * onto the underlying `Button`, the same shape `EntityTypeCombobox` and
 * `RunControlShell`'s triggers already used successfully.
 *
 * jsdom has no layout engine, so this cannot measure popover width (that is
 * proven headlessly in a real browser for the two other adopted callers —
 * see the lane's BUILD-LOG row); it proves the ONE thing that was actually
 * broken: the trigger receives and acts on Radix's cloned click handling.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import IconSelect from "@/components/official/IconSelect";
import { Home } from "lucide-react";

// Radix Popper needs APIs jsdom doesn't implement.
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
(Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
(Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

test("IconSelect's searchable trigger forwards Radix's clone and opens on click", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <IconSelect
        items={[{ id: "1", label: "Home", icon: <Home />, value: "home" }]}
        searchable
        ariaLabel="Choose"
      />,
    );
  });

  const btn = container.querySelector("button") as HTMLButtonElement;
  expect(btn).toBeTruthy();
  // Slot's clone reaching the DOM node is the whole bug: before the fix this
  // attribute was never present at all.
  expect(btn.getAttribute("aria-expanded")).not.toBeNull();
  expect(btn.getAttribute("aria-expanded")).toBe("false");

  act(() => {
    btn.click();
  });

  expect(btn.getAttribute("aria-expanded")).toBe("true");

  root.unmount();
  container.remove();
});
