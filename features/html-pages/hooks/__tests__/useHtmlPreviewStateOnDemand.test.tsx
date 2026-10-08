/**
 * @jest-environment jsdom
 *
 * The chat package's preview hook slot loads the real hook (and KaTeX with it) on first use:
 * the first render suspends into the overlay's fallback, then the real hook's state comes back.
 */
import { Suspense, act } from "react";
import { createRoot } from "react-dom/client";

const mockReal = jest.fn((props: { markdownContent: string }) => ({ contentHtml: `<p>${props.markdownContent}</p>` }));
jest.mock("@/features/html-pages/hooks/useHtmlPreviewState", () => ({ useHtmlPreviewState: mockReal }));

import { useHtmlPreviewStateOnDemand } from "@/features/html-pages/hooks/useHtmlPreviewStateOnDemand";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const state = useHtmlPreviewStateOnDemand({ markdownContent: "hi", user: null } as never) as unknown as {
    contentHtml: string;
  };
  return <div data-testid="html">{state.contentHtml}</div>;
}

test("suspends until the real hook loads, then returns its state", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Suspense fallback={<div data-testid="loading" />}>
        <Probe />
      </Suspense>,
    );
  });
  // The fallback rendered first (the hook suspended), then the real hook answered.
  await act(async () => {
    await Promise.resolve();
  });
  expect(container.querySelector('[data-testid="html"]')?.textContent).toBe("<p>hi</p>");
  expect(mockReal).toHaveBeenCalledWith(expect.objectContaining({ markdownContent: "hi" }));
  act(() => root.unmount());
});
