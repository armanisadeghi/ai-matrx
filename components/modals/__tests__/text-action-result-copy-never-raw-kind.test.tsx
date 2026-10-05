/** @jest-environment jsdom */
/**
 * Y8 (kind never raw): the text-action result modal's Copy puts the readable
 * markdown of a kind answer on the clipboard, never `{"__kind":…}`. Replace /
 * Insert hand the answer text on untouched (the caller's data).
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/rich-content/RichContent", () => ({ RichContent: () => null }));

import { TextActionResultModal } from "../TextActionResultModal";

const KIND = JSON.stringify({ __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] });

let root: Root;
let host: HTMLDivElement;
const writeText = jest.fn(async () => undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("Copy writes the kind's markdown, not its JSON", async () => {
  act(() =>
    root.render(
      <TextActionResultModal isOpen onClose={() => {}} originalText="trip" aiResponse={KIND} />,
    ),
  );
  const copy = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Copy");
  expect(copy).toBeTruthy();
  await act(async () => {
    copy!.click();
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  const written = (writeText.mock.calls[0] as unknown as [string])[0];
  expect(written).not.toContain("__kind");
  expect(written).toContain("Passport");
});
