/**
 * @jest-environment jsdom
 *
 * Share falls back to copying the link through the kit clipboard door — never a raw
 * `(navigator as …).clipboard.writeText` — so a refused clipboard gets the kit's
 * textarea fallback and exactly ONE notice either way (AP-2).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));
jest.mock("motion/react", () => ({ AnimatePresence: (p: { children?: React.ReactNode }) => <>{p.children}</> }));
jest.mock("@/components/image/shared/DesktopImageCard", () => ({
  DesktopImageCard: (p: { onClick: () => void }) => (
    <button type="button" onClick={p.onClick}>
      open
    </button>
  ),
}));
jest.mock("@/components/image/gallery/desktop/SimpleImageViewer", () => ({
  SimpleImageViewer: (p: { photos: { url: string }[]; onShare: (photo: { url: string }) => void }) => (
    <button type="button" onClick={() => p.onShare(p.photos[0])}>
      share
    </button>
  ),
}));
jest.mock("@/components/image/shared/SearchBar", () => ({ SearchBar: () => null }));
jest.mock("@/components/ui/toggle-group", () => ({
  ToggleGroup: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
  ToggleGroupItem: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
}));
jest.mock("@ai-matrx/kit/download", () => ({ downloadFile: jest.fn() }));
jest.mock("@/utils/file-operations/utils", () => ({ mimeToExtension: () => ".jpg" }));

import { ImageGallery } from "../ImageGallery";

const writeText = jest.fn<Promise<void>, [string]>();
let container: HTMLDivElement;
let root: Root;
const click = async (text: string) => {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent?.trim() === text);
  expect(b).toBeDefined();
  await act(async () => b!.click());
};
const urls = ["https://img.example/a.jpg"];

beforeEach(() => {
  toast.mockReset();
  writeText.mockReset();
  delete (navigator as { share?: unknown }).share;
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  jest.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function share() {
  await act(async () => root.render(<ImageGallery imageUrls={urls} />));
  await click("open");
  await click("share");
}

it("copies the link through the kit and says so once", async () => {
  writeText.mockResolvedValue(undefined);
  await share();
  expect(writeText).toHaveBeenCalledWith(urls[0]);
  expect(toast.mock.calls).toEqual([[{ title: "Link copied" }]]);
});

it("a refused clipboard falls back to execCommand before giving up — one failure notice", async () => {
  writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  const exec = jest.fn(() => false);
  document.execCommand = exec;
  await share();
  expect(exec).toHaveBeenCalledWith("copy");
  expect(toast.mock.calls).toEqual([
    [{ title: "There was an issue copying the link.", variant: "destructive" }],
  ]);
});

it("a refused async clipboard still lands through the textarea fallback", async () => {
  writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  document.execCommand = jest.fn(() => true);
  await share();
  expect(toast.mock.calls).toEqual([[{ title: "Link copied" }]]);
});
