/**
 * The reference picker says what a pick does, and a pick always ends it.
 *
 * THE DEFECTS (G8B review, 2026-10-02, nightly clone):
 *   1. On a read-only surface (copy mode) the dialog was still titled "Add a
 *      reference" — it copies.
 *   2. A pick whose handler threw (the rich editor's insert) left the dialog
 *      open with nothing inserted and nothing said.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
jest.mock("@ai-matrx/kit/media-query", () => ({ useIsMobile: () => false }));
const pickFrom = { current: null as null | ((pick: unknown) => void) };
jest.mock(
  "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody",
  () => ({
    ReferencePickerBody: ({ onPicked }: { onPicked: (pick: unknown) => void }) => {
      pickFrom.current = onPicked;
      return <div data-testid="picker-body" />;
    },
  }),
);

import ReferencePickerOverlay from "@/features/overlays/components/ReferencePickerOverlay";
import { createReferencePickerCallbackGroup } from "@/features/overlays/callbacks/referencePicker";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function render(mode: "insert" | "copy", callbackGroupId: string | null, onClose = () => undefined) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReferencePickerOverlay isOpen onClose={onClose} callbackGroupId={callbackGroupId} mode={mode} />,
    );
  });
  const title = document.querySelector('[role="dialog"] h2')?.textContent ?? "";
  return {
    title,
    done: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the reference picker says what it does", () => {
  it("copy mode is titled for copying; insert mode for adding", () => {
    const copy = render("copy", null);
    expect(copy.title).toBe("Copy a reference");
    copy.done();
    const insert = render("insert", null);
    expect(insert.title).toBe("Add a reference");
    insert.done();
  });

  it("a pick whose handler throws still closes the dialog and says so", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { callbackGroupId } = createReferencePickerCallbackGroup({
      onPicked: () => {
        throw new Error("Inserted content deeper than insertion position");
      },
    });
    const onClose = jest.fn();
    const view = render("insert", callbackGroupId, onClose);
    expect(() => act(() => pickFrom.current?.({ fence: "x" }))).not.toThrow();
    expect(onClose).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    view.done();
  });
});
