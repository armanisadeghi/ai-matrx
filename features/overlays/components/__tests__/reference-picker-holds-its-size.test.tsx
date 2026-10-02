/**
 * The "Add a reference" dialog holds its size while its content loads.
 *
 * THE DEFECT (G6B review, 2026-10-02, nightly clone): the dialog sized itself
 * to its content and is centred, so when the Task list finished loading it
 * grew and re-centred under the pointer; a click meant for "Change…" landed on
 * a list row and inserted an unwanted link.
 *
 * Proof: the same dialog, rendered around a short body and a long one, has the
 * same fixed height on desktop and on the phone sheet — the height never comes
 * from the content.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mobile = { current: false };
const body = { current: 1 };

jest.mock("@ai-matrx/kit/media-query", () => ({
  useIsMobile: () => mobile.current,
}));
jest.mock(
  "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody",
  () => ({
    ReferencePickerBody: () => (
      <div data-testid="picker-body">
        {Array.from({ length: body.current }, (_, i) => (
          <p key={i}>row {i}</p>
        ))}
      </div>
    ),
  }),
);

import ReferencePickerOverlay from "@/features/overlays/components/ReferencePickerOverlay";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The classes that decide the box's height on the dialog / sheet element. */
function heightClasses(rows: number): string[] {
  body.current = rows;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReferencePickerOverlay
        isOpen
        onClose={() => undefined}
        callbackGroupId={null}
        mode="insert"
      />,
    );
  });
  const box = document.querySelector('[role="dialog"]');
  const classes = (box?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => /^(max-|min-)?h-/.test(c));
  act(() => root.unmount());
  container.remove();
  return classes;
}

describe("the reference picker holds its size", () => {
  for (const isMobile of [false, true]) {
    it(`${isMobile ? "phone sheet" : "desktop dialog"}: a fixed height, the same for short and long content`, () => {
      mobile.current = isMobile;
      const short = heightClasses(1);
      const long = heightClasses(200);
      // A fixed height — not a content-sized one (h-auto / h-fit, what the
      // shells default to) under a ceiling (max-h-…) that lets it grow.
      const CONTENT_SIZED = new Set(["h-auto", "h-fit", "h-min", "h-max"]);
      const fixed = short.filter((c) => c.startsWith("h-") && !CONTENT_SIZED.has(c));
      expect(fixed).toHaveLength(1);
      expect(long).toEqual(short);
    });
  }
});
