/**
 * Saved items shows the person's own items while `platform.shown_to_context`
 * (1.47 s on the clone) is still pending (2026-10-02). The organization list
 * cannot be built until that call answers; the person's own items pass the
 * rule always and are read without it. Fails on the old hook: it only ever
 * called list(filters), which here never resolves, so nothing renders.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const list = jest.fn();
jest.mock("@/features/canvas/services/canvasItemsService", () => ({
  canvasItemsService: { list: (...a: unknown[]) => list(...a) },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));

import { useCanvasItems } from "../useCanvasItems";

const row = (id: string) => ({ id, title: id, type: "html", is_archived: false });

function Probe() {
  const { items, isLoading, isCompleting, load } = useCanvasItems({});
  React.useEffect(() => {
    void load();
  }, [load]);
  return (
    <div data-loading={String(isLoading)} data-completing={String(isCompleting)}>
      {items.map((i) => i.id).join(",")}
    </div>
  );
}

it("renders own items before the context-gated list answers, then the full list", async () => {
  let resolveFull!: (v: unknown) => void;
  list.mockImplementation((_f: unknown, scope?: string) =>
    scope === "mine"
      ? Promise.resolve({ data: [row("a")], error: null })
      : new Promise((r) => { resolveFull = r; }),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => { root.render(<Probe />); });
  expect(host.textContent).toBe("a");
  expect(host.firstElementChild?.getAttribute("data-completing")).toBe("true");
  expect(host.firstElementChild?.getAttribute("data-loading")).toBe("false");

  await act(async () => { resolveFull({ data: [row("a"), row("b")], error: null }); });
  expect(host.textContent).toBe("a,b");
  expect(host.firstElementChild?.getAttribute("data-completing")).toBe("false");
  act(() => root.unmount());
});
