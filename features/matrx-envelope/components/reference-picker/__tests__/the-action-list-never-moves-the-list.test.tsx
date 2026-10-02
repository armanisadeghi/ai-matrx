/**
 * Opening "Change…" never moves the record list under it.
 *
 * THE DEFECT (G8B review, 2026-10-02, nightly clone): the action list opened
 * INLINE above the records, so when the actions finished loading the list
 * jumped ~140px down — under the pointer. The list now floats (a popover):
 * the row it opens from is the same closed, open-and-loading and
 * open-and-loaded, and the actions never render inside it.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let resolveCatalog: (value: unknown) => void = () => undefined;
jest.mock("@/features/directive-catalog/service", () => ({
  fetchDirectiveCatalog: jest.fn(
    () =>
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "https://server.example.test",
  useAppDispatch: () => () => undefined,
}));

import { ActionRow } from "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** What the row lays out: its elements and its text (ARIA / popper state aside). */
const shape = (el: Element) => `${el.querySelectorAll("*").length}|${el.textContent}`;

describe("the action list", () => {
  it("opens over the records, never pushing them down", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <div>
          <div data-testid="row">
            <ActionRow token="task" directiveClass="reference" onChange={() => undefined} />
          </div>
          <p data-testid="records">records</p>
        </div>,
      );
    });
    const row = container.querySelector('[data-testid="row"]')!;
    const closed = shape(row);

    const change = [...row.querySelectorAll("button")].find((b) => b.textContent === "Change…")!;
    await act(async () => {
      change.click();
    });
    const loading = shape(row);
    expect(loading).toBe(closed);

    await act(async () => {
      resolveCatalog({ nouns: [{ noun: "task", create: "yes", update: "yes", delete: "yes" }] });
      await Promise.resolve();
    });
    const options = [...document.querySelectorAll('[role="radio"]')];
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Update it")]),
    );
    for (const option of options) expect(row.contains(option)).toBe(false);
    const loaded = shape(row);
    expect(loaded).toBe(closed);

    act(() => root.unmount());
    container.remove();
  });
});
