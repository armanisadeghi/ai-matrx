/**
 * Measured 2026-10-03 on every Sheet (clone preview): ~200 commits a second and "Maximum update depth
 * exceeded" while nothing was touched. The Sheet hands `useRelationWordsFor` a freshly mapped `fields`
 * array on every render; the hook's effect depended on the array-derived request and set a new (equal)
 * state object each time, so it rendered forever. It must settle, whatever array identity it is handed.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../service", () => ({ readRelationWords: jest.fn().mockResolvedValue(new Map([["6f1c2b6a-2f7e-4d43-9a43-5a2f4f0f1a11", "Acme Medical"]])) }));

import { useRelationWordsFor } from "../relation-words-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renders = 0;
function Sheetish({ relation }: { relation: boolean }) {
  renders += 1;
  // A new array on every render, as the Sheet's `fields.map(...)` is.
  const fields = [{ field_name: "vendor", format: relation ? { id: "relation" } : { id: "text" } }].map((f) => ({ ...f }));
  const rows = [{ data: { vendor: relation ? "6f1c2b6a-2f7e-4d43-9a43-5a2f4f0f1a11" : "Acme Medical" } }].map((r) => ({ ...r }));
  useRelationWordsFor(fields as never, rows, "t-equipment");
  return null;
}

for (const relation of [false, true]) {
  it(`settles with ${relation ? "a" : "no"} relation column`, async () => {
    renders = 0;
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => {
      root.render(<Sheetish relation={relation} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(renders).toBeLessThan(10);
    act(() => root.unmount());
  });
}
