/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostMedia } from "../components/PostMedia";
import { fetchPlaybackUrl, listPostMedia } from "../server";
import type { PostMediaRef } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../server", () => ({ fetchPlaybackUrl: jest.fn(), listPostMedia: jest.fn(), postThumbnailDoor: () => "thumbnail", socialErrorMessage: (_e: unknown, fallback: string) => fallback }));
jest.mock("../postSpend", () => ({ confirmPostSpend: jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "travel-org" }));

let host: HTMLDivElement;
let root: Root;
const props = { postId: "spain-trip", organizationId: "travel-org", thumbnailUrl: "https://cdn.example.com/cover.jpg", postUrl: "https://www.instagram.com/p/DeUMWUxk1NV/", platform: "instagram", platformPostId: "DeUMWUxk1NV", format: "other", durationSeconds: null };
const ref = (role: string, mime = "image/jpeg"): PostMediaRef => ({ file_id: role, role, mime_type: mime, size_bytes: 1024, door: `/media/${role}` });
async function mount(files: PostMediaRef[]) {
  jest.mocked(listPostMedia).mockResolvedValue(files);
  await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PostMedia {...props} /></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
}
async function next() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Next saved slide"]');
  expect(button).not.toBeNull();
  await act(async () => { button?.click(); });
}
beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  jest.mocked(fetchPlaybackUrl).mockImplementation(async door => `blob:${door}`);
  URL.revokeObjectURL = jest.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.clearAllMocks(); });

it("browses all seven archived carousel slides rather than repeating the thumbnail", async () => {
  await mount([ref("thumbnail"), ...Array.from({ length: 7 }, (_, i) => ref(`image_${i + 1}`))]);
  expect(host.textContent).toContain("1 / 7 saved");
  expect(host.querySelector("img")?.src).toBe("blob:/media/image_1");
  for (let i = 2; i <= 7; i++) { await next(); expect(host.querySelector("img")?.src).toBe(`blob:/media/image_${i}`); }
  expect(host.textContent).toContain("7 / 7 saved");
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Next saved slide"]')?.disabled).toBe(true);
  expect(fetchPlaybackUrl).not.toHaveBeenCalledWith("/media/thumbnail", expect.anything());
});
it("preserves mixed-media order and offers an authenticated download after decode failure", async () => {
  await mount([ref("image_1"), ref("video_1", "video/mp4"), ref("image_2", "image/heic")]);
  await next();
  expect(host.querySelector("video")?.src).toBe("blob:/media/video_1");
  expect(host.querySelector("video")?.controls).toBe(true);
  await next();
  await act(async () => { host.querySelector("img")?.dispatchEvent(new Event("error")); });
  expect(host.textContent).toContain("Preview unavailable");
  const download = host.querySelector<HTMLAnchorElement>("a[download]");
  expect(download?.href).toBe("blob:/media/image_2");
  expect(fetchPlaybackUrl).toHaveBeenLastCalledWith("/media/image_2", expect.objectContaining({ organizationId: "travel-org" }));
});
it("does not claim a provider cover is an archived carousel when no assets exist", async () => {
  await mount([ref("thumbnail")]);
  expect(host.querySelector('button[aria-label="Next saved slide"]')).toBeNull();
  expect(host.textContent).toContain("Cover only");
  expect(host.querySelector("a")?.href).toBe(props.postUrl);
});
